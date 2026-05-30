use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};

use portable_pty::{CommandBuilder, MasterPty, PtySize, native_pty_system};
use rusqlite::Connection;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::mpsc::{UnboundedSender, unbounded_channel};
use uuid::Uuid;

use crate::claude_watch::{self, WatcherHandle as ClaudeWatcherHandle};
use crate::db::{DbState, now_millis};
use crate::error::{AppError, AppResult};
use crate::project::{self, Project, ShellKind};
use crate::sessions::{self, SessionMeta, SessionStatus};
use crate::wsl_shell::{DetectedShell, ShellFamily, WslShellCache};

const READ_BUFFER_BYTES: usize = 4096;
const DEFAULT_COLS: u16 = 80;
const DEFAULT_ROWS: u16 = 24;

// ----- runtime handle -------------------------------------------------------

/// Internal handle for a live PTY session.
///
/// Dropping the handle drops the master PTY, which closes the slave fd, which
/// causes the spawned child to receive `SIGHUP` (Unix) or its terminal to close
/// (Windows). The wait task observes the exit, persists `status=stopped` and
/// emits `pty:exit:<id>`; the reader / writer tasks tear themselves down on
/// the next read / closed channel.
struct PtyHandle {
    meta: SessionMeta,
    master: Box<dyn MasterPty + Send>,
    write_tx: UnboundedSender<Vec<u8>>,
    /// Set when we wrote a temp `.sh` to pass the claude preamble across
    /// the Rust → wsl.exe → bash chain (see [`prepare_wsl_script`]).
    /// Cleaned up on Drop — fire-and-forget; we don't care if the file is
    /// already gone or the FS is in a weird state on shutdown.
    script_path: Option<std::path::PathBuf>,
    /// Background task polling `~/.claude/projects/<encoded-cwd>/` for the
    /// JSONL transcript Claude writes on spawn. Drops cancel the task —
    /// it would otherwise tick for 30 s after the session is killed.
    /// Held as `_claude_watcher` because we only need its Drop side-effect,
    /// not method calls.
    _claude_watcher: Option<ClaudeWatcherHandle>,
}

impl Drop for PtyHandle {
    fn drop(&mut self) {
        if let Some(path) = self.script_path.take()
            && let Err(err) = std::fs::remove_file(&path)
            && err.kind() != std::io::ErrorKind::NotFound
        {
            tracing::debug!(
                path = %path.display(),
                %err,
                "session script cleanup failed (ignored)",
            );
        }
    }
}

// ----- manager --------------------------------------------------------------

#[derive(Default)]
pub struct PtyManager {
    sessions: Mutex<HashMap<String, PtyHandle>>,
}

impl PtyManager {
    pub fn new() -> Self {
        Self::default()
    }

    fn lock_sessions(&self) -> AppResult<std::sync::MutexGuard<'_, HashMap<String, PtyHandle>>> {
        self.sessions
            .lock()
            .map_err(|_| AppError::Other("pty manager mutex poisoned".into()))
    }

    fn contains(&self, id: &str) -> AppResult<bool> {
        Ok(self.lock_sessions()?.contains_key(id))
    }

    fn insert(&self, handle: PtyHandle) -> AppResult<SessionMeta> {
        let meta: SessionMeta = handle.meta.clone();
        self.lock_sessions()?.insert(meta.id.clone(), handle);
        Ok(meta)
    }

    fn write_sender(&self, id: &str) -> AppResult<UnboundedSender<Vec<u8>>> {
        self.lock_sessions()?
            .get(id)
            .map(|h| h.write_tx.clone())
            .ok_or(AppError::NotFound)
    }

    fn resize(&self, id: &str, size: PtySize) -> AppResult<()> {
        let guard = self.lock_sessions()?;
        let handle: &PtyHandle = guard.get(id).ok_or(AppError::NotFound)?;
        handle
            .master
            .resize(size)
            .map_err(|e| AppError::Pty(format!("resize failed: {e}")))
    }

    fn remove(&self, id: &str) -> AppResult<bool> {
        Ok(self.lock_sessions()?.remove(id).is_some())
    }

    fn list(&self) -> AppResult<Vec<SessionMeta>> {
        Ok(self
            .lock_sessions()?
            .values()
            .map(|h| h.meta.clone())
            .collect())
    }
}

// ----- spawn helpers --------------------------------------------------------

/// Real claude preamble for POSIX shells.
///
/// Native bash / zsh on Linux + macOS get this via `bash -l -i -c <preamble>`.
/// The `wsl.exe → bash` chain mangles long single-arg quoting (confirmed by
/// the diagnostic probe in PR #34), so WSL goes through a temp `.sh` file
/// instead (see [`CLAUDE_BASH_SCRIPT`] + [`prepare_wsl_script`]).
///
/// Octal escapes (`\033`) are interpreted by bash's `printf`, not the Rust
/// literal — every backslash is doubled in source.
const POSIX_CLAUDE_PREAMBLE: &str = "\
    printf '\\033[36m> jacqline: spawning claude...\\033[0m\\r\\n'; \
    type -p claude || printf '\\033[33m\\xe2\\x9a\\xa0 claude not found in PATH\\033[0m\\r\\n'; \
    printf 'PATH: %s\\r\\n' \"$PATH\"; \
    claude; rc=$?; \
    printf '\\033[31m< claude exited with %d\\033[0m\\r\\n' \"$rc\"; \
    exec bash -i\
";

/// File-friendly preamble for POSIX shells (bash / zsh / dash / sh / ksh).
/// Written to disk and run as `<detected_shell> -l -i /mnt/c/.../<id>.sh`.
///
/// Because we now spawn the user's *actual* login shell with `-l -i`
/// (see [`crate::wsl_shell`]), rc files are sourced natively —
/// `.zshrc` / `.bash_profile` / wherever they put their nvm / asdf /
/// fnm / volta / mise / nodenv setup. No more manual PATH rebuild, no
/// more `nvm use default` shimming, no more first-bin-wins glob.
const POSIX_CLAUDE_SCRIPT: &str = r#"#!/bin/sh
printf '\033[36m> jacqline: spawning claude...\033[0m\r\n'
command -v claude >/dev/null 2>&1 || printf '\033[33m\xe2\x9a\xa0 claude not found in PATH\033[0m\r\n'
printf 'PATH: %s\r\n' "$PATH"

claude
rc=$?

printf '\033[31m< claude exited with %d\033[0m\r\n' "$rc"

# Drop into the user's preferred shell — by now claude is done and they
# expect zsh / bash / whatever $SHELL is.
exec "${SHELL:-/bin/sh}" -i
"#;

/// fish-syntax port of [`POSIX_CLAUDE_SCRIPT`]. fish has its own control
/// flow keywords (`; or` instead of `||`), variable names (`$status`
/// instead of `$?`), and no `${VAR:-default}` expansion. Same visible
/// behavior.
const FISH_CLAUDE_SCRIPT: &str = r#"#!/usr/bin/env fish
printf '\033[36m> jacqline: spawning claude...\033[0m\r\n'
command -v claude >/dev/null 2>&1; or printf '\033[33m\xe2\x9a\xa0 claude not found in PATH\033[0m\r\n'
printf 'PATH: %s\r\n' "$PATH"

claude
set rc $status

printf '\033[31m< claude exited with %d\033[0m\r\n' $rc

# Drop into the user's preferred shell after claude is done.
if set -q SHELL
    exec $SHELL -i
else
    exec fish -i
end
"#;

/// PowerShell equivalent of [`POSIX_CLAUDE_PREAMBLE`]. Relies on `-NoExit`
/// at the launcher level to keep the shell alive after `claude` returns.
const PWSH_CLAUDE_PREAMBLE: &str = "\
    Write-Host -ForegroundColor Cyan '> jacqline: spawning claude...'; \
    if (-not (Get-Command claude -ErrorAction SilentlyContinue)) { \
      Write-Host -ForegroundColor Yellow 'WARNING: claude not found in PATH' \
    }; \
    Write-Host \"PATH: $env:Path\"; \
    claude; \
    $rc = $LASTEXITCODE; \
    Write-Host -ForegroundColor Red \"< claude exited with $rc\"\
";

/// cmd.exe equivalent. No ANSI; uses `&&` chaining and `/k` keeps the
/// shell open after `claude` exits so the user can still type.
const CMD_CLAUDE_PREAMBLE: &str = "\
    echo ^> jacqline: spawning claude... && \
    where claude >nul 2>&1 || echo (warning) claude not found in PATH && \
    echo PATH: %PATH% && \
    claude & echo ^< claude exited with %ERRORLEVEL%\
";

/// Write the claude preamble to
/// `<app_local_data_dir>/sessions/<sessionId>.<ext>` on the host filesystem.
/// `<ext>` and contents depend on the shell family — POSIX shells get
/// `.sh`, fish gets `.fish`.
///
/// Returns the absolute host path; cleanup is the caller's responsibility
/// (it's stashed in [`PtyHandle::script_path`] and removed on Drop).
///
/// The script is plain UTF-8 text — no chmod needed because we invoke
/// `<shell> <path>` explicitly inside WSL, bypassing the executable bit
/// check.
fn prepare_wsl_script(
    app: &AppHandle,
    session_id: &str,
    family: ShellFamily,
) -> AppResult<std::path::PathBuf> {
    let dir: std::path::PathBuf = app.path().app_local_data_dir()?.join("sessions");
    std::fs::create_dir_all(&dir)?;
    let (ext, content): (&str, &str) = match family {
        ShellFamily::Posix => ("sh", POSIX_CLAUDE_SCRIPT),
        ShellFamily::Fish => ("fish", FISH_CLAUDE_SCRIPT),
    };
    let path: std::path::PathBuf = dir.join(format!("{session_id}.{ext}"));
    std::fs::write(&path, content)?;
    Ok(path)
}

/// Translate `C:\Users\X\AppData\Local\jacqline\sessions\x.sh` into
/// `/mnt/c/Users/X/AppData/Local/jacqline/sessions/x.sh`. The wsl.exe
/// translator does this for arguments coming through `--` but we want
/// the resolved path explicit in the spawn arg list so it shows up in
/// the rolling log as-is.
fn windows_to_wsl_path(path: &std::path::Path) -> Option<String> {
    let s: std::borrow::Cow<'_, str> = path.to_string_lossy();
    let bytes: &[u8] = s.as_bytes();
    if bytes.len() < 3 || !bytes[0].is_ascii_alphabetic() || bytes[1] != b':' {
        return None;
    }
    let drive: char = (bytes[0] as char).to_ascii_lowercase();
    let rest: String = String::from_utf8_lossy(&bytes[2..]).replace('\\', "/");
    Some(format!("/mnt/{drive}{rest}"))
}

/// Best-effort cleanup of orphaned session scripts from previous app runs.
/// Called from `setup()` on app startup. Removes every `.sh` / `.fish`
/// under `<app_local_data_dir>/sessions/` — at that point the PtyManager
/// is empty (in-memory state didn't survive the restart) so no live
/// session can own one of these files.
pub fn cleanup_orphan_session_scripts(app: &AppHandle) {
    let dir: std::path::PathBuf = match app.path().app_local_data_dir() {
        Ok(d) => d.join("sessions"),
        Err(_) => return,
    };
    let entries = match std::fs::read_dir(&dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    let mut removed: usize = 0;
    for entry in entries.flatten() {
        let p: std::path::PathBuf = entry.path();
        let ext: Option<&str> = p.extension().and_then(|s| s.to_str());
        if matches!(ext, Some("sh") | Some("fish")) && std::fs::remove_file(&p).is_ok() {
            removed += 1;
        }
    }
    if removed > 0 {
        tracing::info!(
            dir = %dir.display(),
            removed,
            "cleaned orphan session scripts at startup",
        );
    }
}

fn build_command(
    project: &Project,
    with_claude: bool,
    wsl_script_path: Option<&str>,
    detected_shell: Option<&DetectedShell>,
) -> CommandBuilder {
    let mut cmd: CommandBuilder = match project.shell_kind {
        ShellKind::Native => {
            let shell: &str = project.shell_value.as_str();
            match shell {
                "pwsh" | "powershell" => {
                    let mut c = CommandBuilder::new(shell);
                    // `-NoExit` keeps the shell open after the command exits,
                    // so even when `claude` isn't found / crashes early the
                    // user sees the shell and can debug.
                    c.arg("-NoExit");
                    if with_claude {
                        c.arg("-Command");
                        c.arg(PWSH_CLAUDE_PREAMBLE);
                    }
                    c
                }
                "cmd" => {
                    let mut c = CommandBuilder::new("cmd");
                    if with_claude {
                        c.arg("/k");
                        c.arg(CMD_CLAUDE_PREAMBLE);
                    }
                    c
                }
                _ => {
                    // bash / zsh / fish / dash / ash. We previously used
                    // `-l -c claude` (login non-interactive). Login shells
                    // source `.bash_profile` / `.profile` but NOT `.bashrc`,
                    // where nvm/pnpm/asdf/cargo bin paths usually live —
                    // so `claude` would be "command not found" and the shell
                    // would exit, leaving the user with a blank terminal.
                    //
                    // Use `-l -i -c <preamble>` for bash/zsh so `.bashrc` /
                    // `.zshrc` get sourced too. fish doesn't have the
                    // same login/non-login divide, so we keep `-l -c` there.
                    let mut c = CommandBuilder::new(shell);
                    c.arg("-l");
                    if shell == "bash" || shell == "zsh" {
                        c.arg("-i");
                    }
                    if with_claude {
                        c.arg("-c");
                        c.arg(POSIX_CLAUDE_PREAMBLE);
                    }
                    c
                }
            }
        }
        ShellKind::Wsl => {
            // wsl.exe -d <distro> --cd <cwd> -- <user_shell> -l -i /mnt/c/.../<id>.<ext>
            //
            // We spawn the user's actual login shell (detected via getent
            // — see crate::wsl_shell) with `-l -i`, so the user's own rc
            // files load natively. That makes nvm / asdf / fnm / volta /
            // mise all "just work" because the interactive shell sources
            // them as it normally would on terminal launch.
            //
            // No exec-zsh hijack risk here: if the user's actual shell IS
            // zsh, that's exactly what we spawn — zsh sourcing .zshrc
            // doesn't `exec` to anywhere else.
            //
            // The script's filename extension matches the shell family
            // (`.sh` for POSIX, `.fish` for fish), so shell loaders that
            // look at the extension stay happy.
            //
            // `with_claude=false` (the "Open shell instead" path) skips
            // the script and hands the user a bare interactive shell.
            let shell_path: &str = detected_shell
                .map(|s| s.path.as_str())
                .unwrap_or("/bin/bash");
            let mut c = CommandBuilder::new("wsl.exe");
            c.arg("-d");
            c.arg(&project.shell_value);
            c.arg("--cd");
            c.arg(&project.cwd);
            c.arg("--");
            c.arg(shell_path);
            c.arg("-l");
            c.arg("-i");
            if with_claude && let Some(script) = wsl_script_path {
                c.arg(script);
            }
            c
        }
    };

    // CWD only applies to native shells — for WSL we passed --cd above.
    if matches!(project.shell_kind, ShellKind::Native) {
        cmd.cwd(&project.cwd);
    }

    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    cmd
}

#[derive(Serialize, Clone)]
struct ExitPayload {
    code: Option<u32>,
}

/// Output of [`spawn_pty_tasks`] — everything the caller needs to assemble a
/// `PtyHandle`.
struct SpawnedPty {
    pid: u32,
    master: Box<dyn MasterPty + Send>,
    write_tx: UnboundedSender<Vec<u8>>,
    /// Host-side path of the per-session `.sh` we wrote to bypass the
    /// wsl.exe quoting issue. `None` for non-WSL sessions and for sessions
    /// where `with_claude=false`. Stored on the [`PtyHandle`] so its
    /// `Drop` impl can clean the file up.
    script_path: Option<std::path::PathBuf>,
    /// Watcher for the Claude Code JSONL transcript — populates the
    /// session's `claude_id` + `claude_version` once intercepted.
    /// `None` when `with_claude=false`.
    claude_watcher: Option<ClaudeWatcherHandle>,
}

/// Open a fresh PTY for `project`, spawn the provider command inside it, and
/// kick off the reader / writer / waiter background tasks. Caller is
/// responsible for inserting the resulting handle into the `PtyManager` and
/// persisting / refreshing the corresponding row in `sessions`.
fn spawn_pty_tasks(
    app: AppHandle,
    db_arc: Arc<Mutex<Connection>>,
    project: &Project,
    session_id: &str,
    with_claude: bool,
) -> AppResult<SpawnedPty> {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: DEFAULT_ROWS,
            cols: DEFAULT_COLS,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| AppError::Pty(format!("openpty failed: {e}")))?;

    // Detect (or recall) the user's WSL login shell. None for native
    // sessions. The cache lives on the app's managed state so a single
    // probe per distro per process is enough.
    let detected_shell: Option<DetectedShell> = if matches!(project.shell_kind, ShellKind::Wsl) {
        let cache: tauri::State<'_, WslShellCache> = app.state();
        let db_state: tauri::State<'_, DbState> = app.state();
        Some(cache.detect(&db_state, &project.shell_value))
    } else {
        None
    };

    let script_path: Option<std::path::PathBuf> =
        if matches!(project.shell_kind, ShellKind::Wsl) && with_claude {
            let family: ShellFamily = detected_shell
                .as_ref()
                .map(|s| s.family)
                .unwrap_or(ShellFamily::Posix);
            match prepare_wsl_script(&app, session_id, family) {
                Ok(p) => Some(p),
                Err(err) => {
                    tracing::warn!(
                        session = %session_id,
                        %err,
                        "prepare_wsl_script failed — spawning bare shell",
                    );
                    None
                }
            }
        } else {
            None
        };
    let wsl_script_arg: Option<String> = script_path.as_deref().and_then(windows_to_wsl_path);

    let cmd: CommandBuilder = build_command(
        project,
        with_claude,
        wsl_script_arg.as_deref(),
        detected_shell.as_ref(),
    );
    let mut child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| AppError::Pty(format!("spawn_command failed: {e}")))?;
    let pid: u32 = child.process_id().unwrap_or(0);

    // The slave fd stays open inside the child only — drop our handle here so
    // the master is the sole keeper. Closing master later signals SIGHUP.
    drop(pair.slave);

    let reader: Box<dyn Read + Send> = pair
        .master
        .try_clone_reader()
        .map_err(|e| AppError::Pty(format!("clone reader failed: {e}")))?;
    let writer: Box<dyn Write + Send> = pair
        .master
        .take_writer()
        .map_err(|e| AppError::Pty(format!("take writer failed: {e}")))?;

    let (write_tx, mut write_rx) = unbounded_channel::<Vec<u8>>();

    // Reader: blocking I/O on a blocking-tokio thread; each chunk emitted as
    // a `pty:data:<id>` event.
    //
    // The user-visible symptom we are chasing: child PID is alive, no exit
    // event, but the frontend terminal stays blank. That can mean (a) the
    // read() call never returns, (b) Tauri's emit() fails silently, or
    // (c) the event fires before the frontend's listener registers (race).
    // We log task start, every chunk (with a small preview), EOF, errors,
    // and emit failures, so the rolling log has a complete sequence.
    {
        let data_event: String = format!("pty:data:{session_id}");
        let app_handle: AppHandle = app.clone();
        let session_id_log: String = session_id.to_owned();
        tokio::task::spawn_blocking(move || {
            let mut reader = reader;
            let mut buf: Vec<u8> = vec![0u8; READ_BUFFER_BYTES];
            let mut total: usize = 0;
            let mut chunks: usize = 0;
            tracing::info!(session = %session_id_log, "pty reader task started");
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => {
                        tracing::info!(
                            session = %session_id_log,
                            total_bytes = total,
                            chunks,
                            "pty reader EOF",
                        );
                        break;
                    }
                    Ok(n) => {
                        total += n;
                        chunks += 1;
                        // First-bytes preview helps spot e.g. "command not
                        // found" output that would otherwise look like a
                        // healthy data stream until the user squints at
                        // the terminal.
                        let preview: String =
                            String::from_utf8_lossy(&buf[..n.min(40)]).to_string();
                        tracing::debug!(
                            session = %session_id_log,
                            bytes = n,
                            total_bytes = total,
                            chunks,
                            preview = %preview,
                            "pty read chunk",
                        );
                        let chunk: Vec<u8> = buf[..n].to_vec();
                        if let Err(err) = app_handle.emit(&data_event, chunk) {
                            tracing::warn!(
                                %err,
                                session = %session_id_log,
                                "pty data emit failed",
                            );
                            break;
                        }
                    }
                    Err(err) => {
                        tracing::warn!(
                            %err,
                            session = %session_id_log,
                            total_bytes = total,
                            chunks,
                            "pty reader errored",
                        );
                        break;
                    }
                }
            }
        });
    }

    // Writer: drains the channel into the PTY's writer fd. Closes when the
    // sender is dropped (i.e. PtyHandle removed).
    tokio::task::spawn_blocking(move || {
        let mut writer = writer;
        while let Some(chunk) = write_rx.blocking_recv() {
            if let Err(err) = writer.write_all(&chunk) {
                tracing::debug!(%err, "pty write ended");
                break;
            }
            let _ = writer.flush();
        }
    });

    // Waiter: blocks until child exits, persists `status=stopped` in SQL,
    // emits `pty:exit:<id>`. We clone `db_arc` here so the claude watcher
    // spawned below can still own its own ref — without the clone, the
    // waiter's move would consume the only handle.
    {
        let exit_event: String = format!("pty:exit:{session_id}");
        let app_handle: AppHandle = app.clone();
        let session_id_wait: String = session_id.to_owned();
        let db_arc_for_waiter: Arc<Mutex<Connection>> = Arc::clone(&db_arc);
        tokio::task::spawn_blocking(move || {
            let status = child.wait();
            let code: Option<u32> = status.ok().map(|s| s.exit_code());

            match db_arc_for_waiter.lock() {
                Ok(conn) => {
                    if let Err(err) = sessions::mark_stopped(&conn, &session_id_wait, now_millis())
                    {
                        tracing::warn!(%err, session = %session_id_wait, "mark_stopped failed");
                    }
                }
                Err(_) => {
                    tracing::warn!(
                        session = %session_id_wait,
                        "db mutex poisoned; cannot mark session stopped",
                    );
                }
            }

            if let Err(err) = app_handle.emit(&exit_event, ExitPayload { code }) {
                tracing::warn!(%err, "pty exit emit failed");
            }
        });
    }

    // Watch for Claude's JSONL transcript so we can capture its
    // sessionId + version. Skipped when with_claude=false — no transcript
    // will appear.
    let claude_watcher: Option<ClaudeWatcherHandle> = if with_claude {
        Some(claude_watch::spawn(
            app.clone(),
            db_arc.clone(),
            project.clone(),
            session_id.to_owned(),
            now_millis(),
        ))
    } else {
        None
    };

    Ok(SpawnedPty {
        pid,
        master: pair.master,
        write_tx,
        script_path,
        claude_watcher,
    })
}

// ----- commands -------------------------------------------------------------

#[tauri::command]
pub async fn session_create(
    app: AppHandle,
    db: State<'_, DbState>,
    manager: State<'_, PtyManager>,
    project_id: String,
    name: Option<String>,
    with_claude: Option<bool>,
) -> AppResult<SessionMeta> {
    let with_claude: bool = with_claude.unwrap_or(true);
    let (project, session_name): (Project, String) = {
        let conn = db.lock()?;
        let project: Project = project::get_by_id(&conn, &project_id)?;
        let session_name: String = match name.as_ref().map(|s| s.trim()) {
            Some(trimmed) if !trimmed.is_empty() => trimmed.to_owned(),
            _ => sessions::next_default_name(&conn, &project_id)?,
        };
        (project, session_name)
    };

    let session_id: String = Uuid::new_v4().to_string();
    let started_at: i64 = now_millis();

    let spawned: SpawnedPty = spawn_pty_tasks(app, db.arc(), &project, &session_id, with_claude)?;

    let meta = SessionMeta {
        id: session_id.clone(),
        project_id: project.id.clone(),
        name: session_name,
        claude_id: String::new(),
        claude_version: String::new(),
        status: SessionStatus::Running,
        pid: spawned.pid,
        started_at,
        ended_at: None,
    };

    {
        let conn = db.lock()?;
        sessions::insert(&conn, &meta)?;
    }

    manager.insert(PtyHandle {
        meta: meta.clone(),
        master: spawned.master,
        write_tx: spawned.write_tx,
        script_path: spawned.script_path,
        _claude_watcher: spawned.claude_watcher,
    })?;

    tracing::info!(
        session = %session_id,
        project = %project.id,
        name = %meta.name,
        pid = spawned.pid,
        shell_kind = ?project.shell_kind,
        shell_value = %project.shell_value,
        with_claude,
        "session created",
    );

    Ok(meta)
}

#[tauri::command]
pub async fn session_restart(
    app: AppHandle,
    db: State<'_, DbState>,
    manager: State<'_, PtyManager>,
    session_id: String,
    with_claude: Option<bool>,
) -> AppResult<SessionMeta> {
    let with_claude: bool = with_claude.unwrap_or(true);
    if manager.contains(&session_id)? {
        return Err(AppError::Validation(
            "session is already running; kill it before restarting".into(),
        ));
    }

    let (project, existing): (Project, SessionMeta) = {
        let conn = db.lock()?;
        let existing: SessionMeta = sessions::get_by_id(&conn, &session_id)?;
        let project: Project = project::get_by_id(&conn, &existing.project_id)?;
        (project, existing)
    };

    let started_at: i64 = now_millis();
    let spawned: SpawnedPty = spawn_pty_tasks(app, db.arc(), &project, &session_id, with_claude)?;

    {
        let conn = db.lock()?;
        sessions::mark_running(&conn, &session_id, spawned.pid, started_at)?;
    }

    let meta = SessionMeta {
        id: session_id.clone(),
        project_id: existing.project_id,
        name: existing.name.clone(),
        claude_id: existing.claude_id,
        claude_version: existing.claude_version,
        status: SessionStatus::Running,
        pid: spawned.pid,
        started_at,
        ended_at: None,
    };

    manager.insert(PtyHandle {
        meta: meta.clone(),
        master: spawned.master,
        write_tx: spawned.write_tx,
        script_path: spawned.script_path,
        _claude_watcher: spawned.claude_watcher,
    })?;

    tracing::info!(
        session = %session_id,
        project = %project.id,
        name = %meta.name,
        pid = spawned.pid,
        with_claude,
        "session restarted",
    );

    Ok(meta)
}

#[tauri::command]
pub async fn pty_write(
    manager: State<'_, PtyManager>,
    session_id: String,
    data: Vec<u8>,
) -> AppResult<()> {
    let sender: UnboundedSender<Vec<u8>> = manager.write_sender(&session_id)?;
    sender
        .send(data)
        .map_err(|_| AppError::Pty("session writer channel closed".into()))
}

#[tauri::command]
pub async fn pty_resize(
    manager: State<'_, PtyManager>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> AppResult<()> {
    let size = PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    };
    manager.resize(&session_id, size)
}

#[tauri::command]
pub async fn session_kill(
    db: State<'_, DbState>,
    manager: State<'_, PtyManager>,
    session_id: String,
) -> AppResult<()> {
    // Drop the PtyHandle first so the master closes (the waiter will mark the
    // session stopped on its own), then explicitly mark stopped synchronously
    // so the SQL state is consistent before this command returns even if the
    // waiter is slow.
    let removed: bool = manager.remove(&session_id)?;
    {
        let conn = db.lock()?;
        sessions::mark_stopped(&conn, &session_id, now_millis())?;
    }
    if !removed {
        // The PTY was already gone (e.g. natural exit) — still report success
        // since the SQL state is now consistent.
        tracing::debug!(session = %session_id, "session_kill: pty handle already gone");
    } else {
        tracing::info!(session = %session_id, "session killed");
    }
    Ok(())
}

#[tauri::command]
pub async fn session_delete(
    db: State<'_, DbState>,
    manager: State<'_, PtyManager>,
    session_id: String,
) -> AppResult<()> {
    // First drop the PtyHandle if any — closes the master fd, SIGHUPs the
    // child. The waiter would normally race in and `UPDATE status='stopped'`
    // but since we're about to DELETE the row anyway, that update lands on
    // zero rows and that's fine.
    let removed: bool = manager.remove(&session_id)?;
    let deleted: bool = {
        let conn = db.lock()?;
        sessions::delete(&conn, &session_id)?
    };
    if !deleted {
        return Err(AppError::NotFound);
    }
    tracing::info!(
        session = %session_id,
        had_pty = removed,
        "session deleted",
    );
    Ok(())
}

#[tauri::command]
pub async fn session_list(manager: State<'_, PtyManager>) -> AppResult<Vec<SessionMeta>> {
    manager.list()
}
