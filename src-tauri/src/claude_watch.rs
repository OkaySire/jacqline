//! Watch for Claude Code's JSONL transcript after a PTY spawn so we can
//! capture the `sessionId` and `version` it writes on the first line.
//!
//! Claude Code writes its transcript to
//! `~/.claude/projects/<encoded-cwd>/<claude-session-uuid>.jsonl`. The
//! encoding rule is "replace `/` with `-`". We compute the expected
//! directory, poll it every 500 ms for up to 30 s, and as soon as we
//! find a `.jsonl` whose mtime is past our spawn time, we read its
//! first line and persist the metadata.
//!
//! Three shell kinds, three I/O paths:
//!
//! - **Native (Linux / macOS / Windows)**: `std::fs` directly.
//! - **WSL**: each filesystem hit goes through
//!   `wsl.exe -d <distro> -- sh -c '<cmd>'` so we read inside the WSL
//!   filesystem (claude lives there, not on the Windows host). We use
//!   `silent_command` so each poll doesn't flash a CMD window.
//!
//! The watcher returns a [`WatcherHandle`] whose `Drop` flips a
//! cancellation flag the polling loop checks before each tick. Attach
//! the handle to [`crate::pty::PtyHandle`] so the watcher dies with the
//! session.

use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use rusqlite::Connection;
use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};
use tokio::time::Instant;

use crate::cmd_util::silent_command;
use crate::project::{Project, ShellKind};
use crate::sessions;

const POLL_INTERVAL: Duration = Duration::from_millis(500);
const POLL_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeMetadataPayload {
    /// Jacqline's own session UUID so a single frontend listener can
    /// demultiplex events for all sessions. The Claude UUID lives in
    /// `claude_session_id`.
    pub session_id: String,
    pub claude_session_id: String,
    pub claude_version: String,
}

/// Drop-guard returned by [`spawn`]; cancels the background polling
/// loop when the owning [`crate::pty::PtyHandle`] is dropped.
pub struct WatcherHandle {
    cancel: Arc<AtomicBool>,
}

impl Drop for WatcherHandle {
    fn drop(&mut self) {
        self.cancel.store(true, Ordering::SeqCst);
    }
}

/// Spawn the polling task. Returns immediately; the watcher runs in the
/// tokio runtime until it finds the JSONL, times out, or the handle is
/// dropped.
pub fn spawn(
    app: AppHandle,
    db_arc: Arc<Mutex<Connection>>,
    project: Project,
    session_id: String,
    spawned_at_ms: i64,
) -> WatcherHandle {
    let cancel: Arc<AtomicBool> = Arc::new(AtomicBool::new(false));
    let cancel_for_task: Arc<AtomicBool> = Arc::clone(&cancel);

    tokio::spawn(async move {
        match poll_for_metadata(&project, spawned_at_ms, &cancel_for_task).await {
            Some(mut metadata) => {
                metadata.session_id = session_id.clone();
                let claude_session_id: String = metadata.claude_session_id.clone();
                let claude_version: String = metadata.claude_version.clone();
                match db_arc.lock() {
                    Ok(conn) => {
                        if let Err(err) = sessions::set_claude_metadata(
                            &conn,
                            &session_id,
                            &claude_session_id,
                            &claude_version,
                        ) {
                            tracing::warn!(
                                %err,
                                session = %session_id,
                                "set_claude_metadata failed",
                            );
                        }
                    }
                    Err(_) => {
                        tracing::warn!(
                            session = %session_id,
                            "db mutex poisoned; cannot persist claude metadata",
                        );
                    }
                }
                tracing::info!(
                    session = %session_id,
                    claude_id = %claude_session_id,
                    version = %claude_version,
                    "intercepted claude session metadata",
                );
                if let Err(err) = app.emit("session_meta_updated", metadata) {
                    tracing::warn!(%err, "session_meta_updated emit failed");
                }
            }
            None => {
                if !cancel_for_task.load(Ordering::SeqCst) {
                    tracing::warn!(
                        session = %session_id,
                        timeout_s = POLL_TIMEOUT.as_secs(),
                        "claude watcher timed out — no JSONL transcript found",
                    );
                }
            }
        }
    });

    WatcherHandle { cancel }
}

async fn poll_for_metadata(
    project: &Project,
    spawned_at_ms: i64,
    cancel: &Arc<AtomicBool>,
) -> Option<ClaudeMetadataPayload> {
    let deadline: Instant = Instant::now() + POLL_TIMEOUT;
    let encoded_cwd: String = encode_cwd(&project.cwd);

    loop {
        if cancel.load(Ordering::SeqCst) {
            return None;
        }
        if Instant::now() >= deadline {
            return None;
        }

        let found: Option<String> = match project.shell_kind {
            ShellKind::Native => find_latest_jsonl_native(&encoded_cwd, spawned_at_ms),
            ShellKind::Wsl => {
                find_latest_jsonl_wsl(&project.shell_value, &encoded_cwd, spawned_at_ms)
            }
        };

        if let Some(path) = found {
            let first_line: Option<String> = match project.shell_kind {
                ShellKind::Native => read_first_line_native(&PathBuf::from(&path)),
                ShellKind::Wsl => read_first_line_wsl(&project.shell_value, &path),
            };
            if let Some(line) = first_line
                && let Some(metadata) = parse_first_line(&line)
            {
                return Some(metadata);
            }
        }

        tokio::time::sleep(POLL_INTERVAL).await;
    }
}

/// `/home/jadei/Projects/X` → `-home-jadei-Projects-X`. Strips trailing
/// slash, replaces every remaining `/` with `-`. Claude CLI's own
/// encoding for the per-cwd transcript subdirectory.
fn encode_cwd(cwd: &str) -> String {
    cwd.trim_end_matches('/').replace('/', "-")
}

fn find_latest_jsonl_native(encoded_cwd: &str, after_ms: i64) -> Option<String> {
    let home: PathBuf = dirs_home()?;
    let dir: PathBuf = home.join(".claude").join("projects").join(encoded_cwd);
    let entries = std::fs::read_dir(&dir).ok()?;
    let mut newest: Option<(SystemTime, PathBuf)> = None;
    for entry in entries.flatten() {
        let p: PathBuf = entry.path();
        if p.extension().and_then(|s| s.to_str()) != Some("jsonl") {
            continue;
        }
        let meta = entry.metadata().ok()?;
        let modified: SystemTime = meta.modified().ok()?;
        if systemtime_to_ms(modified) < after_ms {
            continue;
        }
        if let Some((cur, _)) = &newest
            && modified <= *cur
        {
            continue;
        }
        newest = Some((modified, p));
    }
    newest.map(|(_, p)| p.to_string_lossy().into_owned())
}

fn read_first_line_native(path: &PathBuf) -> Option<String> {
    use std::io::BufRead;
    let f = std::fs::File::open(path).ok()?;
    let mut reader = std::io::BufReader::new(f);
    let mut line = String::new();
    reader.read_line(&mut line).ok()?;
    Some(line)
}

fn find_latest_jsonl_wsl(distro: &str, encoded_cwd: &str, after_ms: i64) -> Option<String> {
    // `find -newermt @<epoch_seconds>` filters to files modified after our
    // spawn, `-printf` gives "mtime path", sort + head picks the newest.
    let after_s: i64 = after_ms / 1000;
    let cmd: String = format!(
        "find \"$HOME/.claude/projects/{encoded_cwd}\" -maxdepth 1 -name '*.jsonl' -newermt '@{after_s}' -printf '%T@ %p\\n' 2>/dev/null | sort -nr | head -1 | cut -d' ' -f2-",
    );
    let output = silent_command("wsl.exe")
        .args(["-d", distro, "--", "sh", "-c", &cmd])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let path: String = String::from_utf8_lossy(&output.stdout).trim().to_owned();
    if path.is_empty() { None } else { Some(path) }
}

fn read_first_line_wsl(distro: &str, path: &str) -> Option<String> {
    let output = silent_command("wsl.exe")
        .args(["-d", distro, "--", "head", "-n", "1", path])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    Some(String::from_utf8_lossy(&output.stdout).trim().to_owned())
}

fn parse_first_line(line: &str) -> Option<ClaudeMetadataPayload> {
    let parsed: serde_json::Value = serde_json::from_str(line.trim()).ok()?;
    let claude_session_id: String = parsed.get("sessionId")?.as_str()?.to_owned();
    let claude_version: String = parsed.get("version")?.as_str()?.to_owned();
    if claude_session_id.is_empty() {
        return None;
    }
    Some(ClaudeMetadataPayload {
        session_id: String::new(), // filled in by the watcher task on emit
        claude_session_id,
        claude_version,
    })
}

fn systemtime_to_ms(t: SystemTime) -> i64 {
    t.duration_since(UNIX_EPOCH)
        .map(|d| i64::try_from(d.as_millis()).unwrap_or(i64::MAX))
        .unwrap_or(0)
}

fn dirs_home() -> Option<PathBuf> {
    if let Ok(home) = std::env::var("HOME")
        && !home.is_empty()
    {
        return Some(PathBuf::from(home));
    }
    #[cfg(windows)]
    if let Ok(profile) = std::env::var("USERPROFILE")
        && !profile.is_empty()
    {
        return Some(PathBuf::from(profile));
    }
    None
}
