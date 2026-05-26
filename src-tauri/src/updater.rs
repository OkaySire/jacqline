//! In-app updater. Pulls the latest nightly Windows installer from the
//! `OkaySire/jacqline` GitHub releases, verifies its SHA-256 against the
//! sidecar published alongside, and offers to spawn the installer.
//!
//! This is intentionally **not** the Tauri-official updater — that one wants
//! Ed25519-signed bundles and a signing key in the build matrix, which is
//! V0.2 territory. The custom flow here works without any signature because
//! we trust GitHub Releases (HTTPS + sidecar SHA-256 verifies integrity) and
//! the user explicitly clicks "Install".

use std::path::PathBuf;
use std::time::Duration;

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager, State};
use tokio::io::AsyncWriteExt;

use crate::db::DbState;
use crate::error::{AppError, AppResult};

const NIGHTLY_TAG: &str = "nightly";
const REPO_OWNER: &str = "OkaySire";
const REPO_NAME: &str = "jacqline";
const REQUEST_TIMEOUT_SECS: u64 = 30;
const SETTING_LAST_SEEN_PUBLISHED_AT: &str = "updater.last_seen_published_at";

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub tag: String,
    pub current_version: String,
    pub published_at: String,
    pub published_at_ms: i64,
    pub last_seen_published_at_ms: Option<i64>,
    pub download_url: String,
    pub download_filename: String,
    pub sha256_url: String,
    pub size_bytes: u64,
    pub html_url: String,
    /// `true` when `published_at` is newer than the last update we offered
    /// (or when the user has never installed an update via the in-app flow).
    pub is_newer: bool,
}

// -------- GitHub API response shapes (subset) -------------------------------

#[derive(Debug, Deserialize)]
struct GhRelease {
    tag_name: String,
    published_at: String,
    html_url: String,
    assets: Vec<GhAsset>,
}

#[derive(Debug, Deserialize)]
struct GhAsset {
    name: String,
    browser_download_url: String,
    size: u64,
}

// -------- HTTP client -------------------------------------------------------

fn build_client() -> AppResult<reqwest::Client> {
    let user_agent: String = format!("jacqline-updater/{}", env!("CARGO_PKG_VERSION"));
    reqwest::Client::builder()
        .user_agent(user_agent)
        .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECS))
        .build()
        .map_err(|e| AppError::Other(format!("http client init failed: {e}")))
}

fn parse_published_at_ms(input: &str) -> i64 {
    // GitHub uses ISO 8601 in UTC, e.g. "2026-05-26T05:00:00Z". Avoid pulling
    // chrono just for one parse — slice the digits manually and let any
    // mismatch fall back to 0 so the diff logic still works (older release
    // would then look newer, which is the safe default).
    fn part(s: &str, start: usize, len: usize) -> Option<i64> {
        s.get(start..start + len)?.parse::<i64>().ok()
    }
    let year = part(input, 0, 4);
    let month = part(input, 5, 2);
    let day = part(input, 8, 2);
    let hour = part(input, 11, 2);
    let minute = part(input, 14, 2);
    let second = part(input, 17, 2);
    let (Some(y), Some(mo), Some(d), Some(h), Some(mi), Some(se)) =
        (year, month, day, hour, minute, second)
    else {
        return 0;
    };
    // Days since civil epoch — Howard Hinnant's algorithm (good for any y/m/d).
    let ya: i64 = if mo <= 2 { y - 1 } else { y };
    let era: i64 = ya.div_euclid(400);
    let yoe: i64 = ya - era * 400;
    let mp: i64 = if mo > 2 { mo - 3 } else { mo + 9 };
    let doy: i64 = (153 * mp + 2) / 5 + d - 1;
    let doe: i64 = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days_since_epoch: i64 = era * 146097 + doe - 719468;
    let secs: i64 = days_since_epoch * 86400 + h * 3600 + mi * 60 + se;
    secs.saturating_mul(1000)
}

fn get_last_seen_ms(db: &DbState) -> AppResult<Option<i64>> {
    let conn = db.lock()?;
    let value: rusqlite::Result<String> = conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        [SETTING_LAST_SEEN_PUBLISHED_AT],
        |row| row.get(0),
    );
    match value {
        Ok(s) => Ok(s.parse::<i64>().ok()),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(AppError::from(e)),
    }
}

fn set_last_seen_ms(db: &DbState, ms: i64) -> AppResult<()> {
    let conn = db.lock()?;
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2) \
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        rusqlite::params![SETTING_LAST_SEEN_PUBLISHED_AT, ms.to_string()],
    )?;
    Ok(())
}

// -------- commands ----------------------------------------------------------

#[tauri::command]
pub async fn updater_check(db: State<'_, DbState>) -> AppResult<UpdateInfo> {
    let url: String = format!(
        "https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}/releases/tags/{NIGHTLY_TAG}"
    );
    let client: reqwest::Client = build_client()?;

    let resp = client
        .get(&url)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| AppError::Other(format!("github fetch failed: {e}")))?;

    if !resp.status().is_success() {
        let status = resp.status();
        tracing::warn!(%status, %url, "updater check: github returned non-success");
        return Err(AppError::Other(format!(
            "github releases/tags/{NIGHTLY_TAG} returned {status}",
        )));
    }

    let release: GhRelease = resp
        .json()
        .await
        .map_err(|e| AppError::Other(format!("github response parse failed: {e}")))?;

    let msi: &GhAsset = release
        .assets
        .iter()
        .find(|a: &&GhAsset| a.name.to_lowercase().ends_with(".msi"))
        .ok_or_else(|| AppError::Other("nightly release has no .msi asset yet".into()))?;
    let sidecar: &GhAsset = release
        .assets
        .iter()
        .find(|a: &&GhAsset| a.name.to_lowercase().ends_with(".msi.sha256"))
        .ok_or_else(|| AppError::Other("nightly release has no .sha256 sidecar yet".into()))?;

    let published_at_ms: i64 = parse_published_at_ms(&release.published_at);
    let last_seen_ms: Option<i64> = get_last_seen_ms(&db)?;
    let is_newer: bool = match last_seen_ms {
        Some(seen) => published_at_ms > seen,
        None => true,
    };

    tracing::info!(
        tag = %release.tag_name,
        published_at = %release.published_at,
        published_at_ms,
        last_seen_ms = ?last_seen_ms,
        is_newer,
        msi_size = msi.size,
        "updater check completed",
    );

    Ok(UpdateInfo {
        tag: release.tag_name,
        current_version: env!("CARGO_PKG_VERSION").to_owned(),
        published_at: release.published_at,
        published_at_ms,
        last_seen_published_at_ms: last_seen_ms,
        download_url: msi.browser_download_url.clone(),
        download_filename: msi.name.clone(),
        sha256_url: sidecar.browser_download_url.clone(),
        size_bytes: msi.size,
        html_url: release.html_url,
        is_newer,
    })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadedUpdate {
    pub local_path: String,
    pub sha256: String,
    pub size_bytes: u64,
}

#[tauri::command]
pub async fn updater_download(
    app: AppHandle,
    db: State<'_, DbState>,
    download_url: String,
    sha256_url: String,
    download_filename: String,
    published_at_ms: i64,
) -> AppResult<DownloadedUpdate> {
    let client: reqwest::Client = build_client()?;

    // Fetch the sidecar first — small, lets us fail fast on a bad release
    // before pulling the whole MSI.
    let expected: String = {
        let resp = client
            .get(&sha256_url)
            .send()
            .await
            .map_err(|e| AppError::Other(format!("sidecar fetch failed: {e}")))?;
        if !resp.status().is_success() {
            return Err(AppError::Other(format!(
                "sidecar fetch returned {}",
                resp.status()
            )));
        }
        let body: String = resp
            .text()
            .await
            .map_err(|e| AppError::Other(format!("sidecar body read failed: {e}")))?;
        // `Get-FileHash` PowerShell output is "<hash>  <filename>" or just
        // "<hash>" — take the first 64 hex chars either way.
        body.split_whitespace()
            .next()
            .ok_or_else(|| AppError::Other("sidecar is empty".into()))?
            .to_ascii_lowercase()
    };

    if expected.len() != 64 || !expected.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err(AppError::Other(format!(
            "malformed sidecar hash: {expected}"
        )));
    }

    // Stream the MSI into <app_data_dir>/updates/<filename>, hashing on the fly.
    let updates_dir: PathBuf = app.path().app_data_dir()?.join("updates");
    tokio::fs::create_dir_all(&updates_dir).await?;
    let local_path: PathBuf = updates_dir.join(&download_filename);

    let resp = client
        .get(&download_url)
        .send()
        .await
        .map_err(|e| AppError::Other(format!("MSI fetch failed: {e}")))?;
    if !resp.status().is_success() {
        return Err(AppError::Other(format!(
            "MSI fetch returned {}",
            resp.status()
        )));
    }
    let total_bytes: u64 = resp.content_length().unwrap_or(0);

    let mut file = tokio::fs::File::create(&local_path)
        .await
        .map_err(|e| AppError::Other(format!("create update file failed: {e}")))?;
    let mut hasher = Sha256::new();
    let mut downloaded: u64 = 0;
    let mut stream = resp.bytes_stream();

    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|e| AppError::Other(format!("MSI chunk failed: {e}")))?;
        hasher.update(&chunk);
        file.write_all(&chunk)
            .await
            .map_err(|e| AppError::Other(format!("MSI write failed: {e}")))?;
        downloaded += chunk.len() as u64;
        // Emit a progress event so the frontend can render a bar without
        // polling. Errors here are intentionally swallowed.
        let _ = tauri::Emitter::emit(
            &app,
            "updater:progress",
            ProgressPayload {
                downloaded,
                total: total_bytes,
            },
        );
    }
    file.flush()
        .await
        .map_err(|e| AppError::Other(format!("MSI flush failed: {e}")))?;
    drop(file);

    let actual: String = hex::encode(hasher.finalize());
    if actual != expected {
        // Don't keep a corrupted MSI around.
        let _ = tokio::fs::remove_file(&local_path).await;
        return Err(AppError::Validation(format!(
            "SHA-256 mismatch: expected {expected}, got {actual}",
        )));
    }

    set_last_seen_ms(&db, published_at_ms)?;
    tracing::info!(
        path = %local_path.display(),
        bytes = downloaded,
        sha256 = %actual,
        "update downloaded",
    );

    Ok(DownloadedUpdate {
        local_path: local_path.to_string_lossy().into_owned(),
        sha256: actual,
        size_bytes: downloaded,
    })
}

#[derive(Debug, Clone, Serialize)]
struct ProgressPayload {
    downloaded: u64,
    total: u64,
}

#[tauri::command]
pub async fn updater_install(app: AppHandle, local_path: String) -> AppResult<()> {
    let path: PathBuf = PathBuf::from(&local_path);
    if !path.is_file() {
        return Err(AppError::Validation(format!(
            "downloaded MSI not found: {local_path}",
        )));
    }

    // On Windows, double-clicking an MSI hands it to `msiexec`. Invoking
    // `msiexec /i <path>` directly preserves the same UAC dance and lets the
    // installer take over while we exit cleanly so it can overwrite our exe.
    #[cfg(windows)]
    {
        std::process::Command::new("msiexec")
            .args(["/i", &local_path])
            .spawn()
            .map_err(|e| AppError::Other(format!("msiexec spawn failed: {e}")))?;
    }
    #[cfg(not(windows))]
    {
        // Non-Windows builds shouldn't be calling this; surface a clear error.
        return Err(AppError::Validation(
            "in-app updater is Windows-only in V0.1".into(),
        ));
    }

    tracing::info!("update installer launched; exiting jacqline");
    // Give the spawned installer a beat to attach + come to the foreground
    // before we close our own window.
    let app_handle: AppHandle = app.clone();
    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_millis(800)).await;
        app_handle.exit(0);
    });
    Ok(())
}
