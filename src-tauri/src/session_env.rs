//! Env-var snapshot for the active session — backs the Inspector's `Env`
//! panel.
//!
//! ## Capture method per shell kind
//!
//! - **WSL** (`ShellKind::Wsl`): respawn a fresh login shell over wsl.exe
//!   and read `env -0` from it. The reported environment is "what the
//!   user's login shell would set up right now", **not** the live env of
//!   the running session. Two reasons:
//!
//!   1. The PID we stored is `wsl.exe`'s on the Windows side, not the
//!      bash PID inside WSL, so `/proc/<pid>/environ` would 404.
//!   2. Hunting the right PID inside WSL via `ps | grep <script>` is
//!      fragile and the bash process has typically `exec`'d into `claude`
//!      by the time the user opens the panel — its env at that point is
//!      claude's process env, less useful than the shell's.
//!
//!   The fresh-shell capture is what users actually need to debug PATH /
//!   nvm / asdf issues. Marked `wsl_fresh_login_shell` in the DTO so the
//!   panel can explain the discrepancy.
//!
//! - **Native bash / zsh on Linux**: `/proc/<pid>/environ` — accurate and
//!   live because the stored PID *is* the shell process. Marked
//!   `proc_environ`.
//!
//! - **Native pwsh / cmd on Windows**: unsupported in V0.1. Querying
//!   another process's env on Windows needs `NtQueryInformationProcess`
//!   + PEB traversal. Returns an explanatory error so the panel can
//!   tell the user what to expect. V0.2 follow-up.
//!
//! - **Native bash / zsh on macOS**: unsupported in V0.1 (no `/proc`).
//!   Returns an explanatory error.
//!
//! ## Redaction
//!
//! Variable names matching the keyword regex below have their values
//! replaced with `REDACTED` before the DTO leaves Rust. The Copy-as-
//! Markdown output keeps the redaction, so a snapshot the user pastes
//! into a bug report can't leak secrets by accident.

use std::process::Command;

use serde::Serialize;
use tauri::State;

use crate::db::{DbState, now_millis};
use crate::error::AppResult;
use crate::project::{self, ShellKind};
use crate::sessions;
use crate::wsl_shell::WslShellCache;

/// Keywords (case-insensitive) we treat as sensitive. A variable name
/// containing any of these substrings gets its value redacted.
const REDACT_KEYWORDS: &[&str] = &[
    "TOKEN",
    "SECRET",
    "PASSWORD",
    "PASSWD",
    "AUTH",
    "API",
    "CREDENTIAL",
    "AWS_",
    "GCP_",
    "AZURE_",
    "GH_",
    "GITHUB_",
    "PRIVATE",
    // KEY is broad — matches PUBLIC_KEY, API_KEY, etc. but also things
    // like KEYBOARD_LAYOUT. False positives here are cheap (the panel
    // shows REDACTED but the user can see the name), false negatives
    // can leak secrets.
    "KEY",
];

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvVar {
    pub name: String,
    pub value: String,
    pub redacted: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionEnvSnapshot {
    pub session_id: String,
    pub project_id: String,
    pub session_name: String,
    pub pid: u32,
    pub shell: String,
    pub cwd: String,
    pub capture_method: String,
    pub generated_at: i64,
    pub vars: Vec<EnvVar>,
    /// Populated when capture failed. The panel surfaces this verbatim.
    pub error: Option<String>,
}

#[tauri::command]
pub async fn session_env_snapshot(
    db: State<'_, DbState>,
    wsl_cache: State<'_, WslShellCache>,
    session_id: String,
) -> AppResult<SessionEnvSnapshot> {
    let (session, project) = {
        let conn = db.lock()?;
        let session = sessions::get_by_id(&conn, &session_id)?;
        let project = project::get_by_id(&conn, &session.project_id)?;
        (session, project)
    };

    let (shell_display, capture_result, capture_method) = match project.shell_kind {
        ShellKind::Wsl => {
            let detected = wsl_cache.detect(&db, &project.shell_value);
            let method: String = format!("wsl_fresh_login_shell ({})", project.shell_value);
            (
                detected.path.clone(),
                capture_wsl(&project.shell_value, &detected.path),
                method,
            )
        }
        ShellKind::Native => {
            #[cfg(target_os = "linux")]
            {
                let method: String = "proc_environ".to_owned();
                (
                    project.shell_value.clone(),
                    capture_proc_environ(session.pid),
                    method,
                )
            }
            #[cfg(target_os = "macos")]
            {
                let method: String = "unsupported_native_macos".to_owned();
                (
                    project.shell_value.clone(),
                    Err(
                        "env capture is not supported on native macOS sessions yet (V0.2)"
                            .to_owned(),
                    ),
                    method,
                )
            }
            #[cfg(target_os = "windows")]
            {
                let method: String = "unsupported_native_windows".to_owned();
                (
                    project.shell_value.clone(),
                    Err(
                        "env capture is not supported on native Windows sessions yet (V0.2 — \
                         needs NtQueryInformationProcess + PEB traversal)"
                            .to_owned(),
                    ),
                    method,
                )
            }
            #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
            {
                let method: String = "unsupported_native".to_owned();
                (
                    project.shell_value.clone(),
                    Err("env capture is not supported on this platform".to_owned()),
                    method,
                )
            }
        }
    };

    let (vars, error): (Vec<EnvVar>, Option<String>) = match capture_result {
        Ok(raw) => (redact_and_sort(raw), None),
        Err(msg) => (Vec::new(), Some(msg)),
    };

    Ok(SessionEnvSnapshot {
        session_id,
        project_id: project.id,
        session_name: session.name,
        pid: session.pid,
        shell: shell_display,
        cwd: project.cwd,
        capture_method,
        generated_at: now_millis(),
        vars,
        error,
    })
}

fn capture_wsl(distro: &str, shell_path: &str) -> Result<Vec<(String, String)>, String> {
    // Use `env -0` so values that contain newlines stay intact. We invoke
    // the user's login shell directly with `-l -i -c` — single short arg
    // (no quoting cascade like the spawn path used to hit).
    let output = Command::new("wsl.exe")
        .args(["-d", distro, "--", shell_path, "-l", "-i", "-c", "env -0"])
        .output()
        .map_err(|e| format!("wsl.exe spawn failed: {e}"))?;
    if !output.status.success() {
        return Err(format!(
            "env capture exited non-zero ({:?}): {}",
            output.status,
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    parse_null_separated(&output.stdout)
}

#[cfg(target_os = "linux")]
fn capture_proc_environ(pid: u32) -> Result<Vec<(String, String)>, String> {
    let path: std::path::PathBuf = std::path::PathBuf::from(format!("/proc/{pid}/environ"));
    let raw: Vec<u8> =
        std::fs::read(&path).map_err(|e| format!("read {} failed: {e}", path.display()))?;
    parse_null_separated(&raw)
}

fn parse_null_separated(raw: &[u8]) -> Result<Vec<(String, String)>, String> {
    let mut out: Vec<(String, String)> = Vec::new();
    for entry in raw.split(|b| *b == 0) {
        if entry.is_empty() {
            continue;
        }
        let s: std::borrow::Cow<'_, str> = String::from_utf8_lossy(entry);
        if let Some(idx) = s.find('=') {
            let name: String = s[..idx].to_owned();
            let value: String = s[idx + 1..].to_owned();
            out.push((name, value));
        }
    }
    Ok(out)
}

fn redact_and_sort(mut raw: Vec<(String, String)>) -> Vec<EnvVar> {
    raw.sort_by(|a, b| a.0.cmp(&b.0));
    raw.into_iter()
        .map(|(name, value)| {
            let redacted: bool = should_redact(&name);
            EnvVar {
                value: if redacted {
                    "REDACTED".to_owned()
                } else {
                    value
                },
                name,
                redacted,
            }
        })
        .collect()
}

fn should_redact(name: &str) -> bool {
    let upper: String = name.to_uppercase();
    REDACT_KEYWORDS.iter().any(|kw| upper.contains(kw))
}
