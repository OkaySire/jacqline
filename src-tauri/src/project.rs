use rusqlite::Row;
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

use crate::db::{DbState, now_millis};
use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ShellKind {
    Native,
    Wsl,
}

impl ShellKind {
    fn as_str(self) -> &'static str {
        match self {
            Self::Native => "native",
            Self::Wsl => "wsl",
        }
    }

    fn parse(s: &str) -> AppResult<Self> {
        match s {
            "native" => Ok(Self::Native),
            "wsl" => Ok(Self::Wsl),
            other => Err(AppError::Validation(format!("unknown shell_kind: {other}"))),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub cwd: String,
    pub shell_kind: ShellKind,
    pub shell_value: String,
    pub provider: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Default, Deserialize)]
pub struct ProjectPatch {
    pub name: Option<String>,
    pub cwd: Option<String>,
    pub shell_kind: Option<ShellKind>,
    pub shell_value: Option<String>,
    pub provider: Option<String>,
}

pub(crate) fn get_by_id(conn: &rusqlite::Connection, id: &str) -> AppResult<Project> {
    conn.query_row(
        "SELECT id, name, cwd, shell_kind, shell_value, provider, created_at, updated_at \
         FROM projects WHERE id = ?1",
        [id],
        row_to_project,
    )
    .map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => AppError::NotFound,
        other => AppError::from(other),
    })
}

fn row_to_project(row: &Row<'_>) -> rusqlite::Result<Project> {
    let shell_kind_str: String = row.get("shell_kind")?;
    let shell_kind: ShellKind = ShellKind::parse(&shell_kind_str).map_err(|e| {
        rusqlite::Error::FromSqlConversionFailure(
            0,
            rusqlite::types::Type::Text,
            Box::new(std::io::Error::other(e.to_string())),
        )
    })?;
    Ok(Project {
        id: row.get("id")?,
        name: row.get("name")?,
        cwd: row.get("cwd")?,
        shell_kind,
        shell_value: row.get("shell_value")?,
        provider: row.get("provider")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

fn require_non_empty(field: &str, value: &str) -> AppResult<()> {
    if value.trim().is_empty() {
        Err(AppError::Validation(format!("{field} is required")))
    } else {
        Ok(())
    }
}

#[tauri::command]
pub async fn project_list(db: State<'_, DbState>) -> AppResult<Vec<Project>> {
    let conn = db.lock()?;
    let mut stmt = conn.prepare(
        "SELECT id, name, cwd, shell_kind, shell_value, provider, created_at, updated_at \
         FROM projects ORDER BY updated_at DESC",
    )?;
    let rows = stmt.query_map([], row_to_project)?;
    let projects: Vec<Project> = rows.collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(projects)
}

#[tauri::command]
pub async fn project_create(
    db: State<'_, DbState>,
    name: String,
    cwd: String,
    shell_kind: ShellKind,
    shell_value: String,
    provider: Option<String>,
) -> AppResult<Project> {
    require_non_empty("name", &name)?;
    require_non_empty("cwd", &cwd)?;
    require_non_empty("shell_value", &shell_value)?;

    let now: i64 = now_millis();
    let project: Project = Project {
        id: Uuid::new_v4().to_string(),
        name: name.trim().to_owned(),
        cwd: cwd.trim().to_owned(),
        shell_kind,
        shell_value: shell_value.trim().to_owned(),
        provider: provider.unwrap_or_else(|| "claude-code".to_owned()),
        created_at: now,
        updated_at: now,
    };

    let conn = db.lock()?;
    conn.execute(
        "INSERT INTO projects (id, name, cwd, shell_kind, shell_value, provider, created_at, updated_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![
            project.id,
            project.name,
            project.cwd,
            project.shell_kind.as_str(),
            project.shell_value,
            project.provider,
            project.created_at,
            project.updated_at,
        ],
    )?;
    tracing::info!(id = %project.id, name = %project.name, "project created");
    Ok(project)
}

#[tauri::command]
pub async fn project_update(
    db: State<'_, DbState>,
    id: String,
    patch: ProjectPatch,
) -> AppResult<Project> {
    let conn = db.lock()?;

    let current: Project = get_by_id(&conn, &id)?;

    let updated: Project = Project {
        id: current.id.clone(),
        name: patch.name.unwrap_or(current.name).trim().to_owned(),
        cwd: patch.cwd.unwrap_or(current.cwd).trim().to_owned(),
        shell_kind: patch.shell_kind.unwrap_or(current.shell_kind),
        shell_value: patch
            .shell_value
            .unwrap_or(current.shell_value)
            .trim()
            .to_owned(),
        provider: patch.provider.unwrap_or(current.provider),
        created_at: current.created_at,
        updated_at: now_millis(),
    };

    require_non_empty("name", &updated.name)?;
    require_non_empty("cwd", &updated.cwd)?;
    require_non_empty("shell_value", &updated.shell_value)?;

    conn.execute(
        "UPDATE projects \
         SET name = ?1, cwd = ?2, shell_kind = ?3, shell_value = ?4, provider = ?5, updated_at = ?6 \
         WHERE id = ?7",
        rusqlite::params![
            updated.name,
            updated.cwd,
            updated.shell_kind.as_str(),
            updated.shell_value,
            updated.provider,
            updated.updated_at,
            updated.id,
        ],
    )?;
    tracing::info!(id = %updated.id, "project updated");
    Ok(updated)
}

#[tauri::command]
pub async fn project_delete(db: State<'_, DbState>, id: String) -> AppResult<()> {
    let conn = db.lock()?;
    let affected: usize = conn.execute("DELETE FROM projects WHERE id = ?1", [&id])?;
    if affected == 0 {
        return Err(AppError::NotFound);
    }
    tracing::info!(id = %id, "project deleted");
    Ok(())
}
