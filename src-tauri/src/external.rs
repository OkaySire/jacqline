//! External tool integrations: `git diff` against the working tree and
//! spawning the user-configured external editor for a project file.

use std::path::PathBuf;
use std::process::Command;

use tauri::State;

use crate::db::DbState;
use crate::error::{AppError, AppResult};
use crate::project::Project;
use crate::project_fs::{load_project, resolve_scoped};

const DEFAULT_EDITOR_TEMPLATE: &str = "code {path}";
const SETTING_EXTERNAL_EDITOR: &str = "external_editor";

/// Run `git -C <cwd> diff -- <abs_path>` and return the raw unified diff.
/// An empty string means "no changes" — the frontend should treat that as a
/// distinct state. Non-zero exit codes (e.g. not a git repo) are surfaced as
/// `AppError::Other` with stderr included.
#[tauri::command]
pub async fn git_diff(
    db: State<'_, DbState>,
    project_id: String,
    rel_path: String,
) -> AppResult<String> {
    let project: Project = load_project(&db, &project_id)?;
    let scoped: PathBuf = resolve_scoped(&project, &rel_path)?;

    let output = Command::new("git")
        .arg("-C")
        .arg(&project.cwd)
        .arg("diff")
        .arg("--no-color")
        .arg("--")
        .arg(&scoped)
        .output()
        .map_err(|e| AppError::Other(format!("git spawn failed: {e}")))?;

    if !output.status.success() {
        let stderr: String = String::from_utf8_lossy(&output.stderr).trim().to_owned();
        return Err(AppError::Other(format!(
            "git diff failed (exit {}): {stderr}",
            output.status.code().unwrap_or(-1),
        )));
    }

    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

/// Spawn the user-configured external editor on `<project.cwd>/<rel_path>`.
///
/// The template is read from `settings.external_editor` (falls back to
/// `code {path}`). `{path}` is replaced with the absolute path; if the
/// template has no placeholder, the path is appended as the last argument.
#[tauri::command]
pub async fn shell_open_external(
    db: State<'_, DbState>,
    project_id: String,
    rel_path: String,
) -> AppResult<()> {
    let project: Project = load_project(&db, &project_id)?;
    let scoped: PathBuf = resolve_scoped(&project, &rel_path)?;

    let template: String = {
        let conn = db.lock()?;
        let result: rusqlite::Result<String> = conn.query_row(
            "SELECT value FROM settings WHERE key = ?1",
            [SETTING_EXTERNAL_EDITOR],
            |row| row.get(0),
        );
        match result {
            Ok(v) => v,
            Err(rusqlite::Error::QueryReturnedNoRows) => DEFAULT_EDITOR_TEMPLATE.to_owned(),
            Err(e) => return Err(AppError::from(e)),
        }
    };

    let path_str: String = scoped.to_string_lossy().into_owned();
    let mut parts: Vec<String> = shlex::split(&template).ok_or_else(|| {
        AppError::Validation(format!("invalid external_editor template: {template}"))
    })?;

    let mut had_substitution: bool = false;
    for arg in &mut parts {
        if arg.contains("{path}") {
            *arg = arg.replace("{path}", &path_str);
            had_substitution = true;
        }
    }
    if !had_substitution {
        parts.push(path_str.clone());
    }

    let (cmd, args) = parts
        .split_first()
        .ok_or_else(|| AppError::Validation("external_editor template is empty".into()))?;

    Command::new(cmd)
        .args(args)
        .current_dir(&project.cwd)
        .spawn()
        .map_err(|e| AppError::Other(format!("editor spawn failed for `{cmd}`: {e}")))?;

    tracing::info!(template, path = %path_str, "external editor launched");
    Ok(())
}
