import { invoke } from "@tauri-apps/api/core";

export interface UpdateInfo {
  readonly tag: string;
  readonly currentVersion: string;
  readonly publishedAt: string;
  readonly publishedAtMs: number;
  readonly lastSeenPublishedAtMs: number | null;
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
    publishedAtMs: info.publishedAtMs,
  });
}

export async function updaterInstall(localPath: string): Promise<void> {
  await invoke<void>("updater_install", { localPath });
}
