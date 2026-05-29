import { invoke } from "@tauri-apps/api/core";

export interface EnvVar {
  readonly name: string;
  readonly value: string;
  readonly redacted: boolean;
}

export interface SessionEnvSnapshot {
  readonly sessionId: string;
  readonly projectId: string;
  readonly sessionName: string;
  readonly pid: number;
  readonly shell: string;
  readonly cwd: string;
  readonly captureMethod: string;
  readonly generatedAt: number;
  readonly vars: readonly EnvVar[];
  readonly error: string | null;
}

export async function sessionEnvSnapshot(sessionId: string): Promise<SessionEnvSnapshot> {
  return invoke<SessionEnvSnapshot>("session_env_snapshot", { sessionId });
}
