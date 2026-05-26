//! Debug snapshot — one Rust command that gathers everything we'd typically
//! ask the user for when triaging a bug: app version, OS, installed WSL
//! distros, DB counts, recent log lines, recent session exits, updater
//! state, and a PATH preview. The frontend's "Copy as Markdown" button
//! sends the whole thing into the bus paste box in one shot.
//!
//! Privacy: the PATH preview redacts substrings that look like secrets
//! (`token`, `secret`, `key`, `password`, `auth` followed by `=value`).
//! No environment variable other than PATH is exposed.

use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use crate::db::DbState;
use crate::error::{AppError, AppResult};

const RECENT_LOG_LINES: usize = 100;
const RECENT_SESSION_EXITS: usize = 5;
const PATH_PREVIEW_BYTES: usize = 500;
const SETTING_LAST_SEEN_SHA: &str = "updater.last_seen_sha";
const CURRENT_SHA: &str = env!("JACQLINE_GIT_SHA");

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DebugSnapshot {
    pub app_version: String,
    pub timestamp_ms: i64,
    pub app_data_dir: String,
    pub log_dir: String,
    pub log_path: String,
    pub os: OsInfo,
    pub wsl_distros: Vec<String>,
    pub db_stats: DbStats,
    pub recent_session_exits: Vec<RecentExit>,
    pub updater: UpdaterState,
    pub path_preview: String,
    pub recent_logs: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OsInfo {
    pub name: String,
    pub arch: String,
    pub family: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DbStats {
    pub projects_count: i64,
    pub sessions_total: i64,
    pub sessions_running: i64,
    pub sessions_idle: i64,
    pub sessions_stopped: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentExit {
    pub session_id: String,
    pub project_id: String,
    pub name: String,
    pub status: String,
    pub started_at: i64,
    pub ended_at: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdaterState {
    pub current_sha: String,
    pub last_seen_sha: Option<String>,
}

#[tauri::command]
pub async fn debug_snapshot(app: AppHandle, db: State<'_, DbState>) -> AppResult<DebugSnapshot> {
    let app_data_dir: PathBuf = app.path().app_data_dir()?;
    let log_dir: PathBuf = app.path().app_log_dir()?;
    let log_path: PathBuf =
        find_latest_log(&log_dir).unwrap_or_else(|| log_dir.join("jacqline.log"));

    let os = OsInfo {
        name: std::env::consts::OS.to_owned(),
        arch: std::env::consts::ARCH.to_owned(),
        family: std::env::consts::FAMILY.to_owned(),
    };

    let wsl_distros: Vec<String> = if cfg!(windows) {
        wsl_distros()
    } else {
        Vec::new()
    };

    let (db_stats, recent_exits, last_seen_sha) = {
        let conn = db.lock()?;
        let stats: DbStats = collect_db_stats(&conn)?;
        let exits: Vec<RecentExit> = collect_recent_exits(&conn)?;
        let last_seen: Option<String> = read_last_seen_sha(&conn)?;
        (stats, exits, last_seen)
    };

    let path_preview: String = preview_path();
    let recent_logs: Vec<String> = tail_log(&log_path, RECENT_LOG_LINES);

    Ok(DebugSnapshot {
        app_version: env!("CARGO_PKG_VERSION").to_owned(),
        timestamp_ms: now_millis(),
        app_data_dir: app_data_dir.to_string_lossy().into_owned(),
        log_dir: log_dir.to_string_lossy().into_owned(),
        log_path: log_path.to_string_lossy().into_owned(),
        os,
        wsl_distros,
        db_stats,
        recent_session_exits: recent_exits,
        updater: UpdaterState {
            current_sha: CURRENT_SHA.to_owned(),
            last_seen_sha,
        },
        path_preview,
        recent_logs,
    })
}

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| i64::try_from(d.as_millis()).unwrap_or(i64::MAX))
        .unwrap_or(0)
}

/// Find the most-recently-modified file under `log_dir` whose name starts
/// with `jacqline.log`. `tracing_appender::rolling::daily` produces
/// `jacqline.log.YYYY-MM-DD` files — picking the freshest one gives us
/// today's log without parsing the date.
fn find_latest_log(log_dir: &PathBuf) -> Option<PathBuf> {
    // tracing-appender daily rolling emits `jacqline.log.YYYY-MM-DD`.
    // We pick whichever file under log_dir whose name starts with
    // "jacqline.log" was most recently modified.
    let entries = std::fs::read_dir(log_dir).ok()?;
    let mut candidates: Vec<(std::time::SystemTime, PathBuf)> = entries
        .filter_map(|res| res.ok())
        .filter(|e| e.file_name().to_string_lossy().starts_with("jacqline.log"))
        .filter_map(|e| {
            let modified: std::time::SystemTime = e.metadata().ok()?.modified().ok()?;
            Some((modified, e.path()))
        })
        .collect();
    candidates.sort_by_key(|c| std::cmp::Reverse(c.0));
    candidates.into_iter().next().map(|(_, p)| p)
}

fn tail_log(path: &PathBuf, max_lines: usize) -> Vec<String> {
    let content: String = match std::fs::read_to_string(path) {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };
    let mut lines: Vec<String> = content.lines().map(str::to_owned).collect();
    if lines.len() > max_lines {
        lines = lines.split_off(lines.len() - max_lines);
    }
    lines
}

fn collect_db_stats(conn: &rusqlite::Connection) -> AppResult<DbStats> {
    let projects_count: i64 =
        conn.query_row("SELECT COUNT(*) FROM projects", [], |row| row.get(0))?;
    let sessions_total: i64 =
        conn.query_row("SELECT COUNT(*) FROM sessions", [], |row| row.get(0))?;
    let sessions_running: i64 = conn.query_row(
        "SELECT COUNT(*) FROM sessions WHERE status = 'running'",
        [],
        |row| row.get(0),
    )?;
    let sessions_idle: i64 = conn.query_row(
        "SELECT COUNT(*) FROM sessions WHERE status = 'idle'",
        [],
        |row| row.get(0),
    )?;
    let sessions_stopped: i64 = conn.query_row(
        "SELECT COUNT(*) FROM sessions WHERE status = 'stopped'",
        [],
        |row| row.get(0),
    )?;
    Ok(DbStats {
        projects_count,
        sessions_total,
        sessions_running,
        sessions_idle,
        sessions_stopped,
    })
}

fn collect_recent_exits(conn: &rusqlite::Connection) -> AppResult<Vec<RecentExit>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, name, status, started_at, ended_at \
         FROM sessions \
         WHERE status = 'stopped' \
         ORDER BY COALESCE(ended_at, started_at) DESC \
         LIMIT ?1",
    )?;
    let rows = stmt.query_map([RECENT_SESSION_EXITS as i64], |row| {
        Ok(RecentExit {
            session_id: row.get("id")?,
            project_id: row.get("project_id")?,
            name: row.get("name")?,
            status: row.get("status")?,
            started_at: row.get("started_at")?,
            ended_at: row.get("ended_at")?,
        })
    })?;
    let out: Vec<RecentExit> = rows.collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(out)
}

fn read_last_seen_sha(conn: &rusqlite::Connection) -> AppResult<Option<String>> {
    let result: rusqlite::Result<String> = conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        [SETTING_LAST_SEEN_SHA],
        |row| row.get(0),
    );
    match result {
        Ok(s) => Ok(Some(s)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(AppError::from(e)),
    }
}

fn wsl_distros() -> Vec<String> {
    use std::process::{Command, Stdio};
    let output = match Command::new("wsl.exe")
        .args(["--list", "--quiet"])
        .stderr(Stdio::null())
        .output()
    {
        Ok(o) if o.status.success() => o,
        _ => return Vec::new(),
    };
    // wsl.exe emits UTF-16 LE with a BOM.
    let bytes = output.stdout;
    let mut units: Vec<u16> = Vec::with_capacity(bytes.len() / 2);
    let mut chunks = bytes.chunks_exact(2);
    for chunk in &mut chunks {
        units.push(u16::from_le_bytes([chunk[0], chunk[1]]));
    }
    let decoded: String = String::from_utf16_lossy(&units);
    decoded
        .lines()
        .map(|l| {
            l.trim_start_matches('\u{feff}')
                .trim_end_matches('\r')
                .trim_matches('\0')
                .trim()
                .to_owned()
        })
        .filter(|l| !l.is_empty())
        .collect()
}

/// Read $PATH (or %PATH%), trim to ~500 chars, and redact obvious secrets.
fn preview_path() -> String {
    let raw: String = std::env::var("PATH").unwrap_or_default();
    let mut preview: String = if raw.len() > PATH_PREVIEW_BYTES {
        let mut cut: String = raw.chars().take(PATH_PREVIEW_BYTES).collect();
        cut.push_str(" …(truncated)");
        cut
    } else {
        raw
    };
    redact_secrets(&mut preview);
    preview
}

/// Cheap redaction: walk the string once, lowercase-compare against a few
/// keywords, replace the value portion (`=...` up to the next separator)
/// with `[redacted]`. Not bullet-proof but good enough for a manual
/// snapshot the user reviews before pasting.
fn redact_secrets(s: &mut String) {
    const KEYWORDS: &[&str] = &["token", "secret", "key", "password", "auth"];
    let lower: String = s.to_lowercase();
    let mut redactions: Vec<(usize, usize)> = Vec::new();

    for keyword in KEYWORDS {
        let mut search_from: usize = 0;
        while let Some(rel) = lower[search_from..].find(keyword) {
            let abs: usize = search_from + rel;
            // Look for an `=` within the next ~32 bytes.
            let tail_start: usize = abs + keyword.len();
            let eq_pos = lower[tail_start..(tail_start + 32).min(lower.len())].find('=');
            if let Some(rel_eq) = eq_pos {
                let value_start: usize = tail_start + rel_eq + 1;
                // Value ends at the next separator (`;` Windows, `:` Unix) or EOS.
                let value_end: usize = lower[value_start..]
                    .find([';', ':', ' '])
                    .map(|p| value_start + p)
                    .unwrap_or(lower.len());
                if value_end > value_start {
                    redactions.push((value_start, value_end));
                }
            }
            search_from = abs + keyword.len();
        }
    }

    // Apply redactions from the back so indices stay valid.
    redactions.sort_by_key(|r| std::cmp::Reverse(r.0));
    for (start, end) in redactions {
        if start <= s.len() && end <= s.len() && start < end {
            s.replace_range(start..end, "[redacted]");
        }
    }
}
