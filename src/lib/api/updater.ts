import { invoke } from "@tauri-apps/api/core";

export interface UpdateInfo {
  readonly tag: string;
  readonly currentVersion: string;
  readonly currentSha: string;
  readonly releaseSha: string;
  readonly lastSeenSha: string | null;
  readonly publishedAt: string;
  readonly publishedAtMs: number;
  readonly downloadUrl: string;
  readonly downloadFilename: string;
  readonly sha256Url: string;
  readonly sizeBytes: number;
  readonly htmlUrl: string;
  readonly isNewer: boolean;
}

export interface DownloadedUpdate {
  readonly localPath: string;
  readonly sha256: string;
  readonly sizeBytes: number;
}

export interface UpdateProgressPayload {
  readonly downloaded: number;
  readonly total: number;
}

export async function updaterCheck(): Promise<UpdateInfo> {
  return invoke<UpdateInfo>("updater_check");
}

export async function updaterDownload(info: UpdateInfo): Promise<DownloadedUpdate> {
  return invoke<DownloadedUpdate>("updater_download", {
    downloadUrl: info.downloadUrl,
    sha256Url: info.sha256Url,
    downloadFilename: info.downloadFilename,
    releaseSha: info.releaseSha,
  });
}

export async function updaterInstall(localPath: string): Promise<void> {
  await invoke<void>("updater_install", { localPath });
}
