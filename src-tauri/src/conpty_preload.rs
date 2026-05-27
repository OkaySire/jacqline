//! Windows-only: preload the bundled ConPTY runtime so the stale system
//! ConPTY (which hangs interactive PTYs over WSL, microsoft/WSL#11465) is
//! never reached. WezTerm + Alacritty use the same trick.
//!
//! Mechanics: `LoadLibraryW(absolute_path_to_our_conpty.dll)` puts our
//! version into the process module table. Subsequent ConPTY calls resolve
//! to it. Our conpty.dll then locates `OpenConsole.exe` next to itself
//! (same `conpty/` resource folder), so the whole chain stays on the
//! bundled binaries.
//!
//! If the bundled DLL is missing (dev build without resources, MSI install
//! that skipped the resource folder, etc.) we fall back silently to the
//! system ConPTY and just log a WARN — the user keeps working, just on the
//! buggy system runtime.

use std::path::PathBuf;
use std::sync::OnceLock;

#[derive(Debug, Clone)]
pub struct BundledConpty {
    pub dll_path: PathBuf,
    pub version: Option<String>,
}

static PRELOADED: OnceLock<Option<BundledConpty>> = OnceLock::new();

/// Try to preload the bundled conpty.dll. Idempotent — only the first call
/// does anything. Result cached so [`bundled_state`] can report it from
/// the debug snapshot.
#[cfg(target_os = "windows")]
pub fn preload(resource_dir: &std::path::Path) {
    PRELOADED.get_or_init(|| {
        use std::os::windows::ffi::OsStrExt;
        use windows::Win32::System::LibraryLoader::LoadLibraryW;
        use windows::core::PCWSTR;

        let conpty_dir: PathBuf = resource_dir.join("conpty");
        let dll_path: PathBuf = conpty_dir.join("conpty.dll");
        let version: Option<String> = std::fs::read_to_string(conpty_dir.join("VERSION"))
            .ok()
            .map(|s| s.trim().to_owned());

        if !dll_path.is_file() {
            tracing::warn!(
                path = %dll_path.display(),
                "bundled conpty.dll missing — falling back to system ConPTY",
            );
            return None;
        }

        let wide: Vec<u16> = dll_path
            .as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();

        // SAFETY: PCWSTR points at a null-terminated UTF-16 buffer we own
        // for the duration of the call. LoadLibraryW takes the path,
        // increments the module's refcount, and returns. The HMODULE is
        // never closed — we want it pinned for the process lifetime.
        let result = unsafe { LoadLibraryW(PCWSTR(wide.as_ptr())) };
        match result {
            Ok(handle) if !handle.is_invalid() => {
                tracing::info!(
                    path = %dll_path.display(),
                    version = ?version,
                    "bundled conpty.dll preloaded",
                );
                Some(BundledConpty { dll_path, version })
            }
            other => {
                tracing::warn!(
                    path = %dll_path.display(),
                    result = ?other,
                    "LoadLibraryW failed — falling back to system ConPTY",
                );
                None
            }
        }
    });
}

/// Non-Windows builds: no-op. Linux and macOS use portable-pty's native
/// PTY backends — there is no ConPTY layer to bypass.
#[cfg(not(target_os = "windows"))]
pub fn preload(_resource_dir: &std::path::Path) {
    PRELOADED.get_or_init(|| None);
}

/// Snapshot of whether the preload succeeded — for the Debug panel.
pub fn bundled_state() -> Option<BundledConpty> {
    PRELOADED.get().cloned().flatten()
}
