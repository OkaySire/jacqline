//! WSL default-shell detection + per-(distro,user) cache.
//!
//! We used to spawn `wsl.exe -- bash --norc --noprofile <script>` and rebuild
//! the user's PATH manually inside the script — fragile, missed half the
//! version managers, picked the wrong `node`. Now we instead detect the
//! user's actual login shell once per (distro, app launch) and spawn it
//! directly with `-l -i <script>`. The user's own rc files do the heavy
//! lifting — nvm, asdf, fnm, volta, mise, nodenv all work because the
//! user's actual shell sources them as it normally would.
//!
//! ## Detection order
//!
//! 1. Setting `wsl.<distro>.shell_override` — explicit user choice, wins
//!    over everything. Surfaced in the Debug panel with a copy-paste
//!    hint so users can recover from a misdetection without a UI.
//! 2. Cached result for this distro if we've probed it before this
//!    process launch.
//! 3. `wsl.exe -d <distro> -- sh -c 'getent passwd "$(id -un)"'` — parse
//!    field 7. We call sh explicitly (not the user's shell) so rc files
//!    don't get sourced during the probe.
//! 4. Fallback `/bin/bash`.
//!
//! ## Known limitation
//!
//! `getent passwd` returns the *login* shell from /etc/passwd. A user
//! whose passwd shell is bash but whose `.bash_profile` ends with
//! `exec zsh` will trip us up — we'd detect bash and spawn bash, which
//! would then exec zsh and lose the script. The override setting covers
//! that case. Detection of "what shell the user actually uses
//! interactively" without running their rc files is an unsolved problem.
//!
//! ## V0.2 follow-up (intentionally not implemented now)
//!
//! Setting `wsl.<distro>.init_script` — optional path to a user-provided
//! shell script to source before claude spawn. Lives in the spec for the
//! Customize modal.

use std::collections::HashMap;
use std::sync::Mutex;

use crate::cmd_util::silent_command;
use crate::db::DbState;

/// Classifies how we should write and invoke the preamble script for a
/// given user shell. POSIX covers bash / zsh / dash / sh / ksh (they
/// share enough syntax for our preamble). Fish needs its own script
/// because of `; or`, `$status`, `set`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ShellFamily {
    Posix,
    Fish,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedShell {
    /// Absolute path inside the WSL distro, e.g. `/usr/bin/zsh`.
    pub path: String,
    pub family: ShellFamily,
    /// `true` when the detection was overridden by the
    /// `wsl.<distro>.shell_override` setting rather than discovered
    /// via `getent`.
    pub via_override: bool,
}

#[derive(Default)]
pub struct WslShellCache {
    inner: Mutex<HashMap<String, DetectedShell>>,
}

impl WslShellCache {
    pub fn new() -> Self {
        Self::default()
    }

    /// Resolve the shell to use for `distro`, honoring override and cache.
    /// Never fails — returns a `DetectedShell` even when the probe errors
    /// (`/bin/bash` fallback so the session still spawns something the
    /// user can type into).
    pub fn detect(&self, db: &DbState, distro: &str) -> DetectedShell {
        // 1. Override.
        let override_key: String = format!("wsl.{distro}.shell_override");
        let override_path: Option<String> = read_setting(db, &override_key);
        if let Some(path) = override_path.filter(|s| !s.trim().is_empty()) {
            let path: String = path.trim().to_owned();
            let family: ShellFamily = classify(&path);
            tracing::info!(distro, %path, ?family, "wsl shell detection: using override");
            return DetectedShell {
                path,
                family,
                via_override: true,
            };
        }

        // 2. Cache.
        if let Ok(guard) = self.inner.lock()
            && let Some(cached) = guard.get(distro)
        {
            return cached.clone();
        }

        // 3. Probe.
        let probed: DetectedShell = probe_via_wsl(distro).unwrap_or_else(|| {
            tracing::warn!(distro, "wsl shell probe failed; falling back to /bin/bash");
            DetectedShell {
                path: "/bin/bash".into(),
                family: ShellFamily::Posix,
                via_override: false,
            }
        });

        if let Ok(mut guard) = self.inner.lock() {
            guard.insert(distro.to_owned(), probed.clone());
        }
        tracing::info!(
            distro,
            path = %probed.path,
            family = ?probed.family,
            "wsl shell detection: probed via getent",
        );
        probed
    }

    /// Snapshot of the cache for the Debug panel. Each entry includes
    /// whether the value is from the override or from a `getent` probe.
    pub fn snapshot(&self) -> Vec<(String, DetectedShell)> {
        match self.inner.lock() {
            Ok(guard) => {
                let mut entries: Vec<(String, DetectedShell)> =
                    guard.iter().map(|(d, s)| (d.clone(), s.clone())).collect();
                entries.sort_by(|a, b| a.0.cmp(&b.0));
                entries
            }
            Err(_) => Vec::new(),
        }
    }
}

/// Classify a shell path by its basename. Anything we don't recognize
/// falls into POSIX (bash, zsh, dash, sh, ksh, and unknowns).
fn classify(path: &str) -> ShellFamily {
    let name: &str = path.rsplit('/').next().unwrap_or(path);
    if name.eq_ignore_ascii_case("fish") {
        ShellFamily::Fish
    } else {
        ShellFamily::Posix
    }
}

fn probe_via_wsl(distro: &str) -> Option<DetectedShell> {
    // Call `sh -c '<probe>'` explicitly so the user's login shell rc
    // files do NOT get sourced during detection (a `.bash_profile` ending
    // with `exec zsh` would otherwise hijack the probe args).
    let output = silent_command("wsl.exe")
        .args([
            "-d",
            distro,
            "--",
            "sh",
            "-c",
            "getent passwd \"$(id -un)\"",
        ])
        .output()
        .ok()?;
    if !output.status.success() {
        tracing::warn!(distro, status = ?output.status, "wsl getent exited non-zero");
        return None;
    }
    let stdout: String = String::from_utf8_lossy(&output.stdout).into_owned();
    let line: &str = stdout.lines().next()?;
    let path: &str = line.split(':').nth(6)?.trim();
    if path.is_empty() {
        return None;
    }
    Some(DetectedShell {
        path: path.to_owned(),
        family: classify(path),
        via_override: false,
    })
}

fn read_setting(db: &DbState, key: &str) -> Option<String> {
    let conn = db.lock().ok()?;
    conn.query_row("SELECT value FROM settings WHERE key = ?1", [key], |r| {
        r.get::<_, String>(0)
    })
    .ok()
}

/// Setting key for an explicit shell override. Surfaced in the Debug
/// panel so users can copy-paste the right invocation when our
/// `getent`-based detection picks the wrong shell.
pub fn override_setting_key(distro: &str) -> String {
    format!("wsl.{distro}.shell_override")
}
