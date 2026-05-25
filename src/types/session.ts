export type SessionStatus = "running" | "idle" | "stopped";

export interface SessionMeta {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly claudeId: string;
  readonly status: SessionStatus;
  readonly pid: number;
  readonly startedAt: number;
  readonly endedAt: number | null;
}

/**
 * Payload of the `pty:exit:<sessionId>` event. `code` is `null` when the wait
 * failed (process killed by signal on Unix, etc.).
 */
export interface PtyExitPayload {
  readonly code: number | null;
}
