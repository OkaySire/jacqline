-- Captured from the JSONL transcript Claude Code writes to
-- ~/.claude/projects/<encoded-cwd>/<claude-session-id>.jsonl on spawn.
-- The watcher in `claude_watch.rs` polls that directory for ~30 s after
-- each PTY spawn and persists the first line's `sessionId` (into the
-- existing `claude_id` column) + `version` (this new column).
ALTER TABLE sessions ADD COLUMN claude_version TEXT NOT NULL DEFAULT '';
