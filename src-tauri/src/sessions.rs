//! Persistent session records.
//!
//! Sessions live in two places:
//! - The `sessions` SQL table is the **source of truth** for the user-visible
//!   list (running + idle + stopped). It survives app restarts and is what the
//!   sidebar enumerates.
//! - The `PtyManager` in [`crate::pty`] keeps the in-memory `PtyHandle` for
//!   sessions that are currently `Running` (master fd + writer channel + child).
//!
//! This module owns the SQL layer; `pty.rs` owns the runtime layer and writes
//! through to the SQL table on lifecycle transitions (insert on spawn, mark
//! stopped on exit).

use rusqlite::{Connection, Row, params};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::DbState;
use crate::error::{AppError, AppResult};

const DEFAULT_SESSION_NAME: &str = "main";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SessionStatus {
    Running,
    Idle,
    Stopped,
}

impl SessionStatus {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::Running => "running",
            Self::Idle => "idle",
            Self::Stopped => "stopped",
        }
    }

    fn parse(s: &str) -> AppResult<Self> {
        match s {
            "running" => Ok(Self::Running),
            "idle" => Ok(Self::Idle),
            "stopped" => Ok(Self::Stopped),
            other => Err(AppError::Validation(format!(
                "unknown session status: {other}"
            ))),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionMeta {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub claude_id: String,
    pub status: SessionStatus,
    pub pid: u32,
    pub started_at: i64,
    pub ended_at: Option<i64>,
}

fn row_to_session(row: &Row<'_>) -> rusqlite::Result<SessionMeta> {
    let status_str: String = row.get("status")?;
    let status: SessionStatus = SessionStatus::parse(&status_str).map_err(|e| {
        rusqlite::Error::FromSqlConversionFailure(
            0,
            rusqlite::types::Type::Text,
            Box::new(std::io::Error::other(e.to_string())),
        )
    })?;
    let pid_signed: i64 = row.get("pid")?;
    Ok(SessionMeta {
        id: row.get("id")?,
        project_id: row.get("project_id")?,
        name: row.get("name")?,
        claude_id: row.get("claude_id")?,
        status,
        pid: u32::try_from(pid_signed).unwrap_or(0),
        started_at: row.get("started_at")?,
        ended_at: row.get("ended_at")?,
    })
}

/// Persist a freshly-spawned session in `status=Running`. Called by
/// `pty::session_create` right after the PTY is up.
pub(crate) fn insert(conn: &Connection, meta: &SessionMeta) -> AppResult<()> {
    conn.execute(
        "INSERT INTO sessions (id, project_id, name, claude_id, status, pid, started_at, ended_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            meta.id,
            meta.project_id,
            meta.name,
            meta.claude_id,
            meta.status.as_str(),
            i64::from(meta.pid),
            meta.started_at,
            meta.ended_at,
        ],
    )?;
    Ok(())
}

/// Mark a session as stopped. Idempotent — calling this twice is safe.
pub(crate) fn mark_stopped(conn: &Connection, id: &str, ended_at: i64) -> AppResult<()> {
    conn.execute(
        "UPDATE sessions SET status = 'stopped', ended_at = ?1 WHERE id = ?2 AND status != 'stopped'",
        params![ended_at, id],
    )?;
    Ok(())
}

/// Reap every session left in `running` or `idle` after the previous app
/// run. The PtyManager is in-memory only, so on startup nothing alive
/// owns these rows — they're orphans from a crash / forced quit / OS
/// shutdown. Returns the number of rows flipped to `stopped`.
pub(crate) fn reap_orphans(conn: &Connection, ended_at: i64) -> AppResult<usize> {
    let affected: usize = conn.execute(
        "UPDATE sessions SET status = 'stopped', ended_at = ?1 \
         WHERE status IN ('running', 'idle')",
        params![ended_at],
    )?;
    Ok(affected)
}

/// Flip a stopped session back to running with a fresh pid + start timestamp.
/// Used by `pty::session_restart`.
pub(crate) fn mark_running(
    conn: &Connection,
    id: &str,
    pid: u32,
    started_at: i64,
) -> AppResult<()> {
    let affected: usize = conn.execute(
        "UPDATE sessions SET status = 'running', pid = ?1, started_at = ?2, ended_at = NULL WHERE id = ?3",
        params![i64::from(pid), started_at, id],
    )?;
    if affected == 0 {
        return Err(AppError::NotFound);
    }
    Ok(())
}

/// Delete a session row. Returns `true` when the row existed.
pub(crate) fn delete(conn: &Connection, id: &str) -> AppResult<bool> {
    let affected: usize = conn.execute("DELETE FROM sessions WHERE id = ?1", [id])?;
    Ok(affected > 0)
}

/// Fetch a single session by id.
pub(crate) fn get_by_id(conn: &Connection, id: &str) -> AppResult<SessionMeta> {
    conn.query_row(
        "SELECT id, project_id, name, claude_id, status, pid, started_at, ended_at \
         FROM sessions WHERE id = ?1",
        [id],
        row_to_session,
    )
    .map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => AppError::NotFound,
        other => AppError::from(other),
    })
}

/// Provide users with a default-name builder: `main`, then `main 2`, `main 3`, …
pub(crate) fn next_default_name(conn: &Connection, project_id: &str) -> AppResult<String> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM sessions WHERE project_id = ?1",
        [project_id],
        |row| row.get(0),
    )?;
    if count == 0 {
        Ok(DEFAULT_SESSION_NAME.to_owned())
    } else {
        Ok(format!("{DEFAULT_SESSION_NAME} {}", count + 1))
    }
}

// -------- commands ----------------------------------------------------------

#[tauri::command]
pub async fn session_list_by_project(
    db: State<'_, DbState>,
    project_id: String,
) -> AppResult<Vec<SessionMeta>> {
    let conn = db.lock()?;
    let mut stmt = conn.prepare(
        "SELECT id, project_id, name, claude_id, status, pid, started_at, ended_at \
         FROM sessions WHERE project_id = ?1 ORDER BY started_at ASC",
    )?;
    let rows = stmt.query_map([&project_id], row_to_session)?;
    let sessions: Vec<SessionMeta> = rows.collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(sessions)
}

#[tauri::command]
pub async fn session_update_meta(
    db: State<'_, DbState>,
    session_id: String,
    name: String,
) -> AppResult<SessionMeta> {
    let trimmed: String = name.trim().to_owned();
    if trimmed.is_empty() {
        return Err(AppError::Validation("session name cannot be empty".into()));
    }
    let conn = db.lock()?;
    let affected: usize = conn.execute(
        "UPDATE sessions SET name = ?1 WHERE id = ?2",
        params![trimmed, session_id],
    )?;
    if affected == 0 {
        return Err(AppError::NotFound);
    }
    let meta: SessionMeta = conn
        .query_row(
            "SELECT id, project_id, name, claude_id, status, pid, started_at, ended_at \
             FROM sessions WHERE id = ?1",
            [&session_id],
            row_to_session,
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => AppError::NotFound,
            other => AppError::from(other),
        })?;
    Ok(meta)
}
