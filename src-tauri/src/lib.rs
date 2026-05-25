mod db;
mod error;
mod external;
mod project;
mod project_fs;
mod pty;
mod setting;
mod shell;

use tauri::Manager;
use tracing_subscriber::EnvFilter;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("info,jacqline=debug,jacqline_lib=debug")),
        )
        .with_target(false)
        .init();

    tracing::info!("Jacqline starting");

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            let db_path = data_dir.join("jacqline.db");
            let db_state = db::DbState::new(&db_path)?;
            app.manage(db_state);
            app.manage(pty::PtyManager::new());
            tracing::info!(path = %db_path.display(), "db initialized");
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
            pty::session_list,
            pty::session_kill,
            pty::pty_write,
            pty::pty_resize,
            project_fs::fs_list,
            project_fs::fs_read,
            project_fs::fs_write,
            external::git_diff,
            external::shell_open_external,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
