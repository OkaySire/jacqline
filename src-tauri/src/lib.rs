mod conpty_preload;
mod db;
mod debug;
mod error;
mod external;
mod project;
mod project_fs;
mod pty;
mod sessions;
mod setting;
mod shell;
mod updater;
mod wsl_shell;

use std::path::PathBuf;

use tauri::Manager;
use tracing_appender::non_blocking::WorkerGuard;
use tracing_subscriber::EnvFilter;
use tracing_subscriber::fmt::writer::MakeWriterExt;

fn init_logging(log_dir: &PathBuf) -> Result<WorkerGuard, std::io::Error> {
    std::fs::create_dir_all(log_dir)?;
    let file_appender = tracing_appender::rolling::daily(log_dir, "jacqline.log");
    let (non_blocking, guard) = tracing_appender::non_blocking(file_appender);

    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("info,jacqline=debug,jacqline_lib=debug")),
        )
        .with_writer(non_blocking.and(std::io::stderr))
        .with_target(false)
        .with_ansi(false)
        .init();

    Ok(guard)
}

fn install_panic_hook() {
    let default_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let location: String = match info.location() {
            Some(loc) => format!("{}:{}:{}", loc.file(), loc.line(), loc.column()),
            None => "<unknown>".to_owned(),
        };
        let payload: &str = info
            .payload()
            .downcast_ref::<&str>()
            .copied()
            .or_else(|| info.payload().downcast_ref::<String>().map(String::as_str))
            .unwrap_or("<non-string panic payload>");

        // tao's Windows event loop occasionally panics on shutdown
        // (`cannot move state from Destroyed` in `tao-*/.../runner.rs`).
        // It's harmless — fires after the user closed the window — but
        // it lights up the log file in red. Demote to debug.
        let is_tao_shutdown: bool = location.contains("tao-")
            && location.contains("runner.rs")
            && payload.contains("cannot move state from Destroyed");
        if is_tao_shutdown {
            tracing::debug!(
                %location,
                payload = %payload,
                "tao shutdown panic (harmless, filtered)",
            );
        } else {
            tracing::error!(%location, payload = %payload, "rust panic");
        }
        default_hook(info);
    }));
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            // Logs go to Tauri's app_log_dir() — on Windows that resolves to
            // `%LOCALAPPDATA%\com.okaysire.jacqline\logs`, which is where we
            // tell users to look in the docs and the Debug panel. Older builds
            // used `app_data_dir/logs` (Roaming) by mistake; users who hit
            // that path won't find logs there anymore.
            let log_dir = app.path().app_log_dir()?;
            let guard: WorkerGuard = init_logging(&log_dir)?;
            // Mirror tracing's first "starting" line to stderr so a user
            // launching jacqline from a terminal can see the resolved log
            // path even if the rolling appender failed to flush.
            eprintln!("[jacqline] log_dir = {}", log_dir.display());
            // Keep the appender's worker thread alive for the lifetime of the
            // process. Without this the file writes drop silently.
            Box::leak(Box::new(guard));

            install_panic_hook();
            tracing::info!(path = %log_dir.display(), "Jacqline starting");

            // Preload our bundled ConPTY before anything touches portable-pty.
            // No-op on non-Windows. Best-effort: missing DLL just falls back
            // to the (broken) system ConPTY with a WARN in the log.
            if let Ok(resource_dir) = app.path().resource_dir() {
                conpty_preload::preload(&resource_dir);
            } else {
                tracing::warn!("conpty preload skipped: resource_dir unavailable");
            }

            let db_path = data_dir.join("jacqline.db");
            let db_state = db::DbState::new(&db_path)?;
            app.manage(db_state);
            app.manage(pty::PtyManager::new());
            app.manage(wsl_shell::WslShellCache::new());
            tracing::info!(path = %db_path.display(), "db initialized");

            // Nothing owns yesterday's per-session .sh scripts — the
            // PtyManager is in-memory only, so anything on disk now is
            // an orphan from a previous (possibly crashed) run.
            pty::cleanup_orphan_session_scripts(app.handle());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            project::project_list,
            project::project_create,
            project::project_update,
            project::project_delete,
            setting::setting_get,
            setting::setting_set,
            shell::detect_shells,
            pty::session_create,
            pty::session_restart,
            pty::session_list,
            pty::session_kill,
            pty::session_delete,
            pty::pty_write,
            pty::pty_resize,
            sessions::session_list_by_project,
            sessions::session_update_meta,
            project_fs::fs_list,
            project_fs::fs_read,
            project_fs::fs_write,
            external::git_diff,
            external::shell_open_external,
            updater::updater_check,
            updater::updater_download,
            updater::updater_install,
            debug::debug_snapshot,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
