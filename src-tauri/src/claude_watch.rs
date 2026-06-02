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
/// Claude UI takes a moment to start, then waits for first user input
/// before writing the JSONL on some setups — bumped from 30 s after PR
/// #45 timed out in real WSL usage. If the watcher still misses,
/// the timeout-side diagnostics in [`poll_for_metadata`] dump the
/// actual `~/.claude/projects/` contents so we can compare encodings.
const POLL_TIMEOUT: Duration = Duration::from_secs(60);

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
    let start: Instant = Instant::now();
    let deadline: Instant = start + POLL_TIMEOUT;
    let encoded_cwd: String = encode_cwd_for_project(project);

    tracing::info!(
        cwd = %project.cwd,
        encoded_cwd = %encoded_cwd,
        shell_kind = ?project.shell_kind,
        shell_value = %project.shell_value,
        spawned_at_ms,
        timeout_s = POLL_TIMEOUT.as_secs(),
        "claude watcher started",
    );

    // One-shot at startup: list what's already in `~/.claude/projects/` so
    // we can compare Claude CLI's actual directory naming against our
    // `encoded_cwd`. Logged once at INFO; cheap (single subprocess) and
    // invaluable when the watcher times out.
    log_projects_dir_listing(project, "at_start");

    let mut poll_count: u32 = 0;
    loop {
        if cancel.load(Ordering::SeqCst) {
            return None;
        }
        if Instant::now() >= deadline {
            // Final diagnostic dump before we give up — saves a triage
            // round-trip when the user reports "claude watcher timed out".
            log_projects_dir_listing(project, "at_timeout");
            log_watch_dir_listing(project, &encoded_cwd);
            return None;
        }

        poll_count += 1;
        let found: Option<String> = match project.shell_kind {
            ShellKind::Native => find_latest_jsonl_native(&encoded_cwd, spawned_at_ms),
            ShellKind::Wsl => {
                find_latest_jsonl_wsl(&project.shell_value, &encoded_cwd, spawned_at_ms)
            }
        };
        tracing::debug!(
            poll = poll_count,
            elapsed = ?start.elapsed(),
            found = ?found,
            "claude watcher poll",
        );

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

/// Log `ls -la ~/.claude/projects/` so we can see (a) whether the
/// `.claude` dir even exists for this user, and (b) the exact directory
/// names Claude CLI creates — which we can then compare against our
/// `encoded_cwd` to spot encoding mismatches.
fn log_projects_dir_listing(project: &Project, when: &str) {
    let output: Option<String> = match project.shell_kind {
        ShellKind::Native => list_projects_dir_native(),
        ShellKind::Wsl => list_projects_dir_wsl(&project.shell_value),
    };
    match output {
        Some(text) => {
            tracing::info!(
                when,
                listing = %text.trim(),
                "claude watcher: ~/.claude/projects/ listing",
            );
        }
        None => {
            tracing::warn!(when, "claude watcher: failed to list ~/.claude/projects/",);
        }
    }
}

/// Log `ls -lt <watch_dir>` (no mtime filter). If Claude has written ANY
/// JSONL there but our `find -newermt` filter rejected it, this surfaces
/// the file + its real mtime so we can decide whether to relax the
/// filter.
fn log_watch_dir_listing(project: &Project, encoded_cwd: &str) {
    let output: Option<String> = match project.shell_kind {
        ShellKind::Native => list_watch_dir_native(encoded_cwd),
        ShellKind::Wsl => list_watch_dir_wsl(&project.shell_value, encoded_cwd),
    };
    tracing::warn!(
        encoded_cwd,
        listing = %output.as_deref().unwrap_or("(no output)").trim(),
        "claude watcher: final watch dir listing on timeout",
    );
}

fn list_watch_dir_native(encoded_cwd: &str) -> Option<String> {
    let home: PathBuf = dirs_home()?;
    let dir: PathBuf = home.join(".claude").join("projects").join(encoded_cwd);
    let entries = std::fs::read_dir(&dir).ok()?;
    Some(
        entries
            .flatten()
            .map(|e| format!("{}", e.path().display()))
            .collect::<Vec<_>>()
            .join("\n"),
    )
}

fn list_watch_dir_wsl(distro: &str, encoded_cwd: &str) -> Option<String> {
    let cmd: String = format!("ls -lt \"$HOME/.claude/projects/{encoded_cwd}\" 2>&1");
    let output = silent_command("wsl.exe")
        .args(["-d", distro, "--", "sh", "-c", &cmd])
        .output()
        .ok()?;
    Some(String::from_utf8_lossy(&output.stdout).into_owned())
}

fn list_projects_dir_native() -> Option<String> {
    let home: PathBuf = dirs_home()?;
    let dir: PathBuf = home.join(".claude").join("projects");
    let entries = std::fs::read_dir(&dir).ok()?;
    let mut names: Vec<String> = entries
        .flatten()
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .collect();
    names.sort();
    Some(names.join("\n"))
}

fn list_projects_dir_wsl(distro: &str) -> Option<String> {
    let output = silent_command("wsl.exe")
        .args([
            "-d",
            distro,
            "--",
            "sh",
            "-c",
            "ls -la \"$HOME/.claude/projects\" 2>&1",
        ])
        .output()
        .ok()?;
    Some(String::from_utf8_lossy(&output.stdout).into_owned())
}

/// Encode the project's cwd into Claude CLI's transcript-directory name.
/// Claude writes to `~/.claude/projects/<encoded-cwd>/`, where the
/// encoding is: take the absolute *Linux* path Claude sees inside the
/// shell, strip a trailing `/`, replace every remaining `/` with `-`
/// (e.g. `/home/jadei/Projects/X` → `-home-jadei-Projects-X`).
///
/// For native projects the cwd is already a Linux/Unix path — encoding
/// is direct. For **WSL** projects, however, the cwd is usually the
/// **Windows UNC path** the user picked through the Windows file dialog
/// (`\\wsl.localhost\Ubuntu-24.04\home\jadei\Projects\X`). Claude CLI
/// runs *inside* WSL and never sees that UNC string — it sees the
/// straight Linux path. We have to do the same translation before
/// applying the `/` → `-` rule, otherwise the watcher polls a directory
/// that doesn't exist (the PR #46 timeout on Windows confirmed this).
fn encode_cwd_for_project(project: &Project) -> String {
    let linux_cwd: String = match project.shell_kind {
        ShellKind::Wsl => wsl_linux_cwd(&project.cwd, &project.shell_value),
        ShellKind::Native => project.cwd.clone(),
    };
    linux_cwd.trim_end_matches('/').replace('/', "-")
}

/// Strip the `\\wsl.localhost\<distro>\` (or legacy `\\wsl$\<distro>\`)
/// prefix from a Windows UNC path so what's left is the Linux-side
/// absolute path WSL processes use. Backslashes are flipped to forward
/// slashes for the encoder. Idempotent for paths that are already Linux
/// style.
///
/// The prefix match is case-insensitive because Windows treats the UNC
/// host name as case-insensitive even though the path Linux sees is
/// strictly case-sensitive.
fn wsl_linux_cwd(cwd: &str, distro: &str) -> String {
    let unix_slashes: String = cwd.replace('\\', "/");
    let lower: String = unix_slashes.to_lowercase();
    let distro_lower: String = distro.to_lowercase();
    let candidates: [String; 2] = [
        format!("//wsl.localhost/{distro_lower}/"),
        format!("//wsl$/{distro_lower}/"),
    ];
    for prefix in &candidates {
        if let Some(rest) = lower.strip_prefix(prefix.as_str()) {
            // Index into the original (non-lowered) string at the same
            // byte offset — ASCII-only prefix, so byte counts line up.
            let tail: &str = &unix_slashes[prefix.len()..];
            // Sanity check that the case-insensitive match aligned.
            debug_assert_eq!(tail.to_lowercase(), rest);
            return format!("/{tail}");
        }
    }
    unix_slashes
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wsl_linux_cwd_unc_wsl_localhost() {
        // The case that bit us on the user's machine — UNC path from
        // Windows file picker, distro casing preserved.
        let got: String = wsl_linux_cwd(
            r"\\wsl.localhost\Ubuntu-24.04\home\jadei\Projects\TestJacqline",
            "Ubuntu-24.04",
        );
        assert_eq!(got, "/home/jadei/Projects/TestJacqline");
    }

    #[test]
    fn wsl_linux_cwd_unc_wsl_dollar_legacy() {
        let got: String = wsl_linux_cwd(r"\\wsl$\Debian\home\user\code", "Debian");
        assert_eq!(got, "/home/user/code");
    }

    #[test]
    fn wsl_linux_cwd_host_name_case_insensitive() {
        // Mixed-case host name + distro — Windows treats both as
        // case-insensitive; the Linux tail keeps its original casing.
        let got: String = wsl_linux_cwd(
            r"\\WSL.LocalHost\Ubuntu-24.04\Home\User\Repo",
            "Ubuntu-24.04",
        );
        assert_eq!(got, "/Home/User/Repo");
    }

    #[test]
    fn wsl_linux_cwd_already_linux_path() {
        let got: String = wsl_linux_cwd("/home/jadei/Projects/X", "Ubuntu-24.04");
        assert_eq!(got, "/home/jadei/Projects/X");
    }

    #[test]
    fn encode_for_unc_wsl_project_matches_claude_dir() {
        use crate::project::{Project, ShellKind};
        let project = Project {
            id: "p".into(),
            name: "n".into(),
            cwd: r"\\wsl.localhost\Ubuntu-24.04\home\jadei\Projects\TestJacqline".into(),
            shell_kind: ShellKind::Wsl,
            shell_value: "Ubuntu-24.04".into(),
            provider: String::new(),
            created_at: 0,
            updated_at: 0,
        };
        assert_eq!(
            encode_cwd_for_project(&project),
            "-home-jadei-Projects-TestJacqline",
        );
    }
}
