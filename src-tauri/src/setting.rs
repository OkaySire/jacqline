use tauri::State;

use crate::db::DbState;
use crate::error::{AppError, AppResult};

#[tauri::command]
pub async fn setting_get(db: State<'_, DbState>, key: String) -> AppResult<Option<String>> {
    let conn = db.lock()?;
    let result: rusqlite::Result<String> =
        conn.query_row("SELECT value FROM settings WHERE key = ?1", [&key], |row| {
            row.get(0)
        });
    match result {
        Ok(v) => Ok(Some(v)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(AppError::from(e)),
    }
}

#[tauri::command]
pub async fn setting_set(db: State<'_, DbState>, key: String, value: String) -> AppResult<()> {
    let conn = db.lock()?;
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2) \
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        rusqlite::params![key, value],
    )?;
    Ok(())
}
