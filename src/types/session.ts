export type SessionStatus = "running" | "idle" | "stopped";

export interface SessionMeta {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  /**
   * Claude Code's own session UUID, intercepted from
   * `~/.claude/projects/<encoded-cwd>/<uuid>.jsonl` on spawn. Empty
   * string until the backend watcher (see `src-tauri/src/claude_watch.rs`)
   * fires `session_meta_updated:<sessionId>`.
   */
  readonly claudeId: string;
  /** Claude CLI semver string, intercepted from the same JSONL. */
  readonly claudeVersion: string;
  readonly status: SessionStatus;
  readonly pid: number;
  readonly startedAt: number;
  readonly endedAt: number | null;
}

/** Payload of `session_meta_updated:<sessionId>` events. */
export interface ClaudeMetadataPayload {
  readonly claudeSessionId: string;
  readonly claudeVersion: string;
}

/**
 * Payload of the `pty:exit:<sessionId>` event. `code` is `null` when the wait
 * failed (process killed by signal on Unix, etc.).
 */
export interface PtyExitPayload {
  readonly code: number | null;
}
