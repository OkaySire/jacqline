export interface SessionMeta {
  readonly id: string;
  readonly projectId: string;
  readonly pid: number;
  readonly startedAt: number;
}

/**
 * Payload of the `pty:exit:<sessionId>` event. `code` is `null` when the wait
 * failed (process killed by signal on Unix, etc.).
 */
export interface PtyExitPayload {
  readonly code: number | null;
}
