//! Tiny wrapper around [`std::process::Command`] that suppresses the
//! transient console window Windows allocates by default when a GUI app
//! spawns a console subprocess.
//!
//! Symptom: a black CMD window flashes on screen for ~100 ms whenever
//! we invoke `wsl.exe`, `where`, `git`, etc. from a click handler.
//! Annoying enough that users notice and report it. Adding the
//! `CREATE_NO_WINDOW` flag (`0x0800_0000`) before `.output()` /
//! `.status()` / `.spawn()` quiets the pop without changing anything
//! else about the child's stdio.
//!
//! On non-Windows targets this is a transparent passthrough — the flag
//! doesn't exist and there is no console window to suppress.

use std::ffi::OsStr;
use std::process::Command;

/// Build a [`Command`] for `program` that won't allocate a visible
/// console window on Windows. Caller chains `.arg()` / `.args()` /
/// `.stdin()` / etc. as usual, then `.output()` / `.status()` /
/// `.spawn()`.
pub fn silent_command<S: AsRef<OsStr>>(program: S) -> Command {
    let mut cmd = Command::new(program);
    apply_no_window(&mut cmd);
    cmd
}

#[cfg(windows)]
fn apply_no_window(cmd: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    cmd.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
fn apply_no_window(_cmd: &mut Command) {}
