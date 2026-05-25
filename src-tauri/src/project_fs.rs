//! Scoped filesystem commands for a project's `cwd`.
//!
//! Every command canonicalizes both the project's working directory and the
//! requested target, then verifies the target is still inside the cwd. Anything
//! else (paths containing `..`, absolute paths, symlinks pointing outside) is
//! rejected with `AppError::Validation`. The frontend never gets a tauri-fs
//! permission — it can only address files through these commands.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::DbState;
use crate::error::{AppError, AppResult};
use crate::project::{self, Project};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DirEntryKind {
    File,
    Dir,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DirEntry {
    pub name: String,
    pub kind: DirEntryKind,
    pub size: u64,
    /// Last-modified time in milliseconds since the Unix epoch. `None` if the
    /// platform doesn't expose it (rare).
    pub modified: Option<i64>,
}

fn canonical_cwd(project: &Project) -> AppResult<PathBuf> {
    PathBuf::from(&project.cwd)
        .canonicalize()
        .map_err(|e| AppError::Validation(format!("project cwd is not accessible: {e}")))
}

fn reject_traversal(rel_path: &str) -> AppResult<()> {
    for component in Path::new(rel_path).components() {
        match component {
            std::path::Component::Normal(_) | std::path::Component::CurDir => {}
            _ => {
                return Err(AppError::Validation(format!(
                    "path must be relative to the project root: {rel_path}",
                )));
            }
        }
    }
    Ok(())
}

/// Resolve an **existing** `<project.cwd>/<rel_path>` and ensure the result
/// is still inside the cwd after symlink resolution.
pub(crate) fn resolve_scoped(project: &Project, rel_path: &str) -> AppResult<PathBuf> {
    let cwd: PathBuf = canonical_cwd(project)?;
    reject_traversal(rel_path)?;

    let target: PathBuf = cwd.join(rel_path);
    let canonical: PathBuf = target
        .canonicalize()
        .map_err(|e| AppError::Validation(format!("path not found or not accessible: {e}")))?;

    if !canonical.starts_with(&cwd) {
        return Err(AppError::Validation(format!(
            "path resolves outside the project root: {rel_path}",
        )));
    }

    Ok(canonical)
}

/// Resolve a path that may not exist yet (for `fs_write` of a new file).
/// Canonicalizes the parent directory and verifies it's inside the cwd, then
/// joins the file name back. Rejects writes whose **parent** doesn't already
/// exist — we don't create directories on the user's behalf.
fn resolve_scoped_for_write(project: &Project, rel_path: &str) -> AppResult<PathBuf> {
    let cwd: PathBuf = canonical_cwd(project)?;
    reject_traversal(rel_path)?;

    let target: PathBuf = cwd.join(rel_path);
    let parent: &Path = target
        .parent()
        .ok_or_else(|| AppError::Validation("path has no parent directory".into()))?;
    let file_name = target
        .file_name()
        .ok_or_else(|| AppError::Validation("path has no file name".into()))?;

    let parent_canon: PathBuf = parent
        .canonicalize()
        .map_err(|e| AppError::Validation(format!("parent directory not accessible: {e}")))?;

    if !parent_canon.starts_with(&cwd) {
        return Err(AppError::Validation(format!(
            "path resolves outside the project root: {rel_path}",
        )));
    }

    Ok(parent_canon.join(file_name))
}

pub(crate) fn load_project(db: &DbState, project_id: &str) -> AppResult<Project> {
    let conn = db.lock()?;
    project::get_by_id(&conn, project_id)
}

fn entry_from_dir_entry(entry: &std::fs::DirEntry) -> AppResult<DirEntry> {
    let metadata = entry.metadata()?;
    let kind: DirEntryKind = if metadata.is_dir() {
        DirEntryKind::Dir
    } else {
        DirEntryKind::File
    };
    let size: u64 = if metadata.is_file() {
        metadata.len()
    } else {
        0
    };
    let modified: Option<i64> = metadata
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| {
            let ms: u128 = d.as_millis();
            i64::try_from(ms).unwrap_or(i64::MAX)
        });

    let name: String = entry
        .file_name()
        .to_str()
        .map(str::to_owned)
        .unwrap_or_else(|| entry.file_name().to_string_lossy().into_owned());

    Ok(DirEntry {
        name,
        kind,
        size,
        modified,
    })
}

#[tauri::command]
pub async fn fs_list(
    db: State<'_, DbState>,
    project_id: String,
    rel_path: String,
) -> AppResult<Vec<DirEntry>> {
    let project: Project = load_project(&db, &project_id)?;
    let scoped: PathBuf = resolve_scoped(&project, &rel_path)?;

    let mut entries: Vec<DirEntry> = std::fs::read_dir(&scoped)?
        .filter_map(|res| res.ok())
        .filter_map(|entry| entry_from_dir_entry(&entry).ok())
        .collect();

    // Directories first, then files, both alphabetical (case-insensitive).
    entries.sort_by(|a, b| match (&a.kind, &b.kind) {
        (DirEntryKind::Dir, DirEntryKind::File) => std::cmp::Ordering::Less,
        (DirEntryKind::File, DirEntryKind::Dir) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(entries)
}

#[tauri::command]
pub async fn fs_read(
    db: State<'_, DbState>,
    project_id: String,
    rel_path: String,
) -> AppResult<Vec<u8>> {
    let project: Project = load_project(&db, &project_id)?;
    let scoped: PathBuf = resolve_scoped(&project, &rel_path)?;

    let metadata = std::fs::metadata(&scoped)?;
    if !metadata.is_file() {
        return Err(AppError::Validation(format!(
            "not a regular file: {rel_path}",
        )));
    }

    let bytes: Vec<u8> = std::fs::read(&scoped)?;
    Ok(bytes)
}

#[tauri::command]
pub async fn fs_write(
    db: State<'_, DbState>,
    project_id: String,
    rel_path: String,
    data: Vec<u8>,
) -> AppResult<()> {
    let project: Project = load_project(&db, &project_id)?;
    let scoped: PathBuf = resolve_scoped_for_write(&project, &rel_path)?;

    // If the target exists, refuse to overwrite a directory.
    if let Ok(metadata) = std::fs::metadata(&scoped)
        && metadata.is_dir()
    {
        return Err(AppError::Validation(format!(
            "cannot write over a directory: {rel_path}",
        )));
    }

    std::fs::write(&scoped, &data)?;
    tracing::debug!(path = %scoped.display(), bytes = data.len(), "fs_write");
    Ok(())
}
