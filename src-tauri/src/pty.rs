use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};

use portable_pty::{CommandBuilder, MasterPty, PtySize, native_pty_system};
use rusqlite::Connection;
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::mpsc::{UnboundedSender, unbounded_channel};
use uuid::Uuid;

use crate::db::{DbState, now_millis};
use crate::error::{AppError, AppResult};
use crate::project::{self, Project, ShellKind};
use crate::sessions::{self, SessionMeta, SessionStatus};

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

/// Shell-script preamble we inject before `claude` for POSIX shells
/// (bash / zsh / WSL bash).
///
/// **Currently in DIAGNOSTIC MODE (option C from the bug brief):** the
/// real preamble exited with `0xC000013A` (STATUS_CONTROL_C_EXIT) within
/// milliseconds, with no `printf` output ever reaching the frontend —
/// strongly suggesting the long `-c` arg is being mangled somewhere in
/// the Rust → wsl.exe → bash chain (single quotes, double quotes, `;`,
/// `||`, octal escapes, multibyte UTF-8 in one big arg = quoting
/// minefield).
///
/// This minimal preamble proves the chain: if we see `HELLO_FROM_PREAMBLE`
/// followed (5 s later) by `DONE` then the shell-exec path is healthy
/// and the bug is in `claude` itself, not the quoting. If `HELLO` never
/// shows up we've confirmed the quoting hypothesis and the next step is
/// to write the preamble to a temp `.sh` file (option A) and run
/// `bash /path/to/file.sh` instead.
const POSIX_CLAUDE_PREAMBLE: &str = "echo HELLO_FROM_PREAMBLE; sleep 5; echo DONE; exec bash -i";

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

fn build_command(project: &Project, with_claude: bool) -> CommandBuilder {
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
            // wsl.exe -d <distro> --cd <cwd> -- bash -l -i -c <preamble>
            let mut c = CommandBuilder::new("wsl.exe");
            c.arg("-d");
            c.arg(&project.shell_value);
            c.arg("--cd");
            c.arg(&project.cwd);
            c.arg("--");
            c.arg("bash");
            c.arg("-l");
            c.arg("-i");
            if with_claude {
                c.arg("-c");
                c.arg(POSIX_CLAUDE_PREAMBLE);
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

    let cmd: CommandBuilder = build_command(project, with_claude);
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
    // emits `pty:exit:<id>`.
    {
        let exit_event: String = format!("pty:exit:{session_id}");
        let app_handle: AppHandle = app.clone();
        let session_id_wait: String = session_id.to_owned();
        tokio::task::spawn_blocking(move || {
            let status = child.wait();
            let code: Option<u32> = status.ok().map(|s| s.exit_code());

            match db_arc.lock() {
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

    Ok(SpawnedPty {
        pid,
        master: pair.master,
        write_tx,
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
        status: SessionStatus::Running,
        pid: spawned.pid,
        started_at,
        ended_at: None,
    };

    manager.insert(PtyHandle {
        meta: meta.clone(),
        master: spawned.master,
        write_tx: spawned.write_tx,
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
