import { invoke } from "@tauri-apps/api/core";

export interface OsInfo {
  readonly name: string;
  readonly arch: string;
  readonly family: string;
}

export interface DbStats {
  readonly projectsCount: number;
  readonly sessionsTotal: number;
  readonly sessionsRunning: number;
  readonly sessionsIdle: number;
  readonly sessionsStopped: number;
}

export interface RecentExit {
  readonly sessionId: string;
  readonly projectId: string;
  readonly name: string;
  readonly status: string;
  readonly startedAt: number;
  readonly endedAt: number | null;
}

export interface UpdaterState {
  readonly lastSeenPublishedAtMs: number | null;
}

export interface DebugSnapshot {
  readonly appVersion: string;
  readonly timestampMs: number;
  readonly appDataDir: string;
  readonly logPath: string;
  readonly os: OsInfo;
  readonly wslDistros: readonly string[];
  readonly dbStats: DbStats;
  readonly recentSessionExits: readonly RecentExit[];
  readonly updater: UpdaterState;
  readonly pathPreview: string;
  readonly recentLogs: readonly string[];
}

export async function debugSnapshot(): Promise<DebugSnapshot> {
  return invoke<DebugSnapshot>("debug_snapshot");
}
