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

fn build_command(project: &Project) -> CommandBuilder {
    let mut cmd: CommandBuilder = match project.shell_kind {
        ShellKind::Native => {
            let shell: &str = project.shell_value.as_str();
            match shell {
                "pwsh" | "powershell" => {
                    let mut c = CommandBuilder::new(shell);
                    c.arg("-NoExit");
                    c.arg("-Command");
                    c.arg("claude");
                    c
                }
                "cmd" => {
                    let mut c = CommandBuilder::new("cmd");
                    c.arg("/k");
                    c.arg("claude");
                    c
                }
                _ => {
                    // bash / zsh / fish / dash / ash / etc. — login shell so
                    // ~/.bashrc / ~/.zshrc / fish config get sourced and the
                    // user's PATH (where `claude` lives) is on it.
                    let mut c = CommandBuilder::new(shell);
                    c.arg("-l");
                    c.arg("-c");
                    c.arg("claude");
                    c
                }
            }
        }
        ShellKind::Wsl => {
            // wsl.exe -d <distro> --cd <cwd> -- bash -lc 'claude'
            let mut c = CommandBuilder::new("wsl.exe");
            c.arg("-d");
            c.arg(&project.shell_value);
            c.arg("--cd");
            c.arg(&project.cwd);
            c.arg("--");
            c.arg("bash");
            c.arg("-lc");
            c.arg("claude");
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

// ----- commands -------------------------------------------------------------

#[tauri::command]
pub async fn session_create(
    app: AppHandle,
    db: State<'_, DbState>,
    manager: State<'_, PtyManager>,
    project_id: String,
    name: Option<String>,
) -> AppResult<SessionMeta> {
    let (project, session_name): (Project, String) = {
        let conn = db.lock()?;
        let project: Project = project::get_by_id(&conn, &project_id)?;
        let session_name: String = match name.as_ref().map(|s| s.trim()) {
            Some(trimmed) if !trimmed.is_empty() => trimmed.to_owned(),
            _ => sessions::next_default_name(&conn, &project_id)?,
        };
        (project, session_name)
    };

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: DEFAULT_ROWS,
            cols: DEFAULT_COLS,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| AppError::Pty(format!("openpty failed: {e}")))?;

    let cmd: CommandBuilder = build_command(&project);
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

    let session_id: String = Uuid::new_v4().to_string();
    let started_at: i64 = now_millis();
    let meta = SessionMeta {
        id: session_id.clone(),
        project_id: project.id.clone(),
        name: session_name,
        claude_id: String::new(),
        status: SessionStatus::Running,
        pid,
        started_at,
        ended_at: None,
    };

    // Persist before we expose the session anywhere — if the INSERT fails we
    // haven't yet started any background tasks and the spawned child will be
    // killed when we drop the master at function exit.
    {
        let conn = db.lock()?;
        sessions::insert(&conn, &meta)?;
    }

    let (write_tx, mut write_rx) = unbounded_channel::<Vec<u8>>();

    // Reader: blocking I/O lives on a blocking-tokio thread; each chunk is
    // emitted as a `pty:data:<id>` event with `Vec<u8>` payload.
    {
        let data_event: String = format!("pty:data:{session_id}");
        let app_handle: AppHandle = app.clone();
        let session_id_for_log: String = session_id.clone();
        tokio::task::spawn_blocking(move || {
            let mut reader = reader;
            let mut buf: Vec<u8> = vec![0u8; READ_BUFFER_BYTES];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let chunk: Vec<u8> = buf[..n].to_vec();
                        if let Err(err) = app_handle.emit(&data_event, chunk) {
                            tracing::warn!(%err, "pty data emit failed");
                            break;
                        }
                    }
                    Err(err) => {
                        tracing::debug!(%err, session = %session_id_for_log, "pty read ended");
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

    // Waiter: blocks until child exits, then persists `status=stopped` in SQL
    // and emits `pty:exit:<id>`.
    {
        let exit_event: String = format!("pty:exit:{session_id}");
        let app_handle: AppHandle = app.clone();
        let session_id_for_wait: String = session_id.clone();
        let db_arc: Arc<Mutex<Connection>> = db.arc();
        tokio::task::spawn_blocking(move || {
            let status = child.wait();
            let code: Option<u32> = status.ok().map(|s| s.exit_code());

            match db_arc.lock() {
                Ok(conn) => {
                    if let Err(err) =
                        sessions::mark_stopped(&conn, &session_id_for_wait, now_millis())
                    {
                        tracing::warn!(%err, session = %session_id_for_wait, "mark_stopped failed");
                    }
                }
                Err(_) => {
                    tracing::warn!(
                        session = %session_id_for_wait,
                        "db mutex poisoned; cannot mark session stopped",
                    );
                }
            }

            if let Err(err) = app_handle.emit(&exit_event, ExitPayload { code }) {
                tracing::warn!(%err, "pty exit emit failed");
            }
        });
    }

    manager.insert(PtyHandle {
        meta: meta.clone(),
        master: pair.master,
        write_tx,
    })?;

    tracing::info!(
        session = %session_id,
        project = %project.id,
        name = %meta.name,
        pid,
        shell_kind = ?project.shell_kind,
        shell_value = %project.shell_value,
        "session created",
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
pub async fn session_list(manager: State<'_, PtyManager>) -> AppResult<Vec<SessionMeta>> {
    manager.list()
}
