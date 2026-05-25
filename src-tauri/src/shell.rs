use serde::{Deserialize, Serialize};

use crate::error::AppResult;
use crate::project::ShellKind;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShellOption {
    pub label: String,
    pub shell_kind: ShellKind,
    pub shell_value: String,
}

/// Enumerate the shells available on the current host.
///
/// - On Unix-like systems, parses `/etc/shells`, keeps entries whose binary
///   actually exists, dedupes by basename, and sorts a few common ones
///   (`bash`, `zsh`, `fish`, `dash`, `tcsh`) to the top.
/// - On Windows, probes for `pwsh`, `powershell`, and `cmd` on the `PATH`, then
///   lists installed WSL distros via `wsl.exe --list --quiet`.
///
/// Errors are not propagated — a missing `/etc/shells` or absent WSL returns an
/// empty list rather than failing the whole UI.
#[tauri::command]
pub async fn detect_shells() -> AppResult<Vec<ShellOption>> {
    let options: Vec<ShellOption> = collect_shells();
    tracing::debug!(count = options.len(), "detected shells");
    Ok(options)
}

fn collect_shells() -> Vec<ShellOption> {
    let mut options: Vec<ShellOption> = Vec::new();

    #[cfg(unix)]
    {
        options.extend(unix::detect());
    }

    #[cfg(windows)]
    {
        options.extend(windows::detect_native());
        options.extend(windows::detect_wsl());
    }

    options
}

#[cfg(unix)]
mod unix {
    use std::collections::HashSet;
    use std::fs;
    use std::path::Path;

    use super::{ShellKind, ShellOption};

    const PREFERRED: &[&str] = &["bash", "zsh", "fish", "dash", "tcsh"];

    pub fn detect() -> Vec<ShellOption> {
        let content: String = fs::read_to_string("/etc/shells").unwrap_or_default();
        let mut seen: HashSet<String> = HashSet::new();
        let mut shells: Vec<ShellOption> = Vec::new();

        for raw in content.lines() {
            let path: &str = raw.trim();
            if path.is_empty() || path.starts_with('#') {
                continue;
            }
            if !Path::new(path).exists() {
                continue;
            }
            let name: &str = path.rsplit('/').next().unwrap_or(path);
            if !seen.insert(name.to_owned()) {
                continue;
            }
            shells.push(ShellOption {
                label: name.to_owned(),
                shell_kind: ShellKind::Native,
                shell_value: name.to_owned(),
            });
        }

        shells.sort_by(|a, b| {
            let pa: usize = PREFERRED
                .iter()
                .position(|x| *x == a.shell_value.as_str())
                .unwrap_or(usize::MAX);
            let pb: usize = PREFERRED
                .iter()
                .position(|x| *x == b.shell_value.as_str())
                .unwrap_or(usize::MAX);
            pa.cmp(&pb).then_with(|| a.shell_value.cmp(&b.shell_value))
        });

        shells
    }
}

#[cfg(windows)]
mod windows {
    use std::process::{Command, Stdio};

    use super::{ShellKind, ShellOption};

    pub fn detect_native() -> Vec<ShellOption> {
        const CANDIDATES: &[(&str, &str)] = &[
            ("PowerShell (pwsh)", "pwsh"),
            ("Windows PowerShell", "powershell"),
            ("cmd.exe", "cmd"),
        ];

        CANDIDATES
            .iter()
            .filter(|(_, value)| on_path(value))
            .map(|(label, value)| ShellOption {
                label: (*label).to_owned(),
                shell_kind: ShellKind::Native,
                shell_value: (*value).to_owned(),
            })
            .collect()
    }

    pub fn detect_wsl() -> Vec<ShellOption> {
        if !on_path("wsl.exe") {
            return Vec::new();
        }

        let output = match Command::new("wsl.exe")
            .args(["--list", "--quiet"])
            .stderr(Stdio::null())
            .output()
        {
            Ok(o) if o.status.success() => o,
            Ok(o) => {
                tracing::debug!(?o.status, "wsl --list --quiet exited non-zero");
                return Vec::new();
            }
            Err(err) => {
                tracing::debug!(%err, "failed to spawn wsl.exe");
                return Vec::new();
            }
        };

        // wsl.exe emits UTF-16 LE (with BOM) — decode then strip BOM/CR/NUL.
        let decoded: String = decode_utf16_lossy(&output.stdout);
        decoded
            .lines()
            .map(|line| {
                line.trim_start_matches('\u{feff}')
                    .trim_end_matches('\r')
                    .trim_matches('\0')
                    .trim()
            })
            .filter(|line| !line.is_empty())
            .map(|distro| ShellOption {
                label: format!("WSL: {distro}"),
                shell_kind: ShellKind::Wsl,
                shell_value: distro.to_owned(),
            })
            .collect()
    }

    fn on_path(binary: &str) -> bool {
        Command::new("where")
            .arg(binary)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map(|status| status.success())
            .unwrap_or(false)
    }

    fn decode_utf16_lossy(bytes: &[u8]) -> String {
        let mut units: Vec<u16> = Vec::with_capacity(bytes.len() / 2);
        let mut chunks = bytes.chunks_exact(2);
        for chunk in &mut chunks {
            units.push(u16::from_le_bytes([chunk[0], chunk[1]]));
        }
        String::from_utf16_lossy(&units)
    }
}
