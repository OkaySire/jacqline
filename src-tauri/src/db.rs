use std::path::Path;
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::Connection;

use crate::error::{AppError, AppResult};

/// Connection pool of one — SQLite is single-writer anyway. WAL mode + a `Mutex` gives us
/// concurrent reads from async Tauri commands without bringing in a full pool crate.
///
/// The connection is wrapped in an `Arc<Mutex<…>>` (not just `Mutex<…>`) so that long-lived
/// background tasks — most notably the PTY waiter that records `status=stopped` on session
/// exit — can hold their own owned reference instead of borrowing the Tauri-managed state
/// (which is `'_` bound and not `Send`).
pub struct DbState {
    conn: Arc<Mutex<Connection>>,
}

const MIGRATIONS: &[(&str, &str)] = &[
    ("001_init", include_str!("../migrations/001_init.sql")),
    (
        "002_sessions",
        include_str!("../migrations/002_sessions.sql"),
    ),
    (
        "003_claude_metadata",
        include_str!("../migrations/003_claude_metadata.sql"),
    ),
];

impl DbState {
    /// Open (or create) the local SQLite database at `db_path`, enable WAL + foreign keys,
    /// then apply pending migrations.
    pub fn new(db_path: &Path) -> AppResult<Self> {
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let conn: Connection = Connection::open(db_path)?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        Self::migrate(&conn)?;
        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    fn migrate(conn: &Connection) -> AppResult<()> {
        conn.execute(
            "CREATE TABLE IF NOT EXISTS _migrations (\
                 name TEXT PRIMARY KEY,\
                 applied_at INTEGER NOT NULL\
             )",
            [],
        )?;

        for (name, sql) in MIGRATIONS {
            let applied: i64 = conn.query_row(
                "SELECT COUNT(*) FROM _migrations WHERE name = ?1",
                [name],
                |row| row.get(0),
            )?;
            if applied == 0 {
                conn.execute_batch(sql)?;
                conn.execute(
                    "INSERT INTO _migrations(name, applied_at) VALUES (?1, ?2)",
                    rusqlite::params![name, now_millis()],
                )?;
                tracing::info!(migration = %name, "applied migration");
            }
        }

        Ok(())
    }

    /// Borrow the underlying connection. Callers should keep the guard scoped to a single command.
    pub fn lock(&self) -> AppResult<MutexGuard<'_, Connection>> {
        self.conn
            .lock()
            .map_err(|_| AppError::Other("db connection mutex poisoned".into()))
    }

    /// Hand out an owned `Arc` to the connection mutex. Use this from background tasks
    /// (PTY waiter, etc.) that need to outlive a Tauri command and therefore can't borrow
    /// `State<'_, DbState>`.
    pub fn arc(&self) -> Arc<Mutex<Connection>> {
        Arc::clone(&self.conn)
    }
}

/// Milliseconds since the Unix epoch. Stored as `INTEGER` in SQLite for sortability.
pub fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| {
            let ms: u128 = d.as_millis();
            i64::try_from(ms).unwrap_or(i64::MAX)
        })
        .unwrap_or(0)
}
