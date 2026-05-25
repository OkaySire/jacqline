CREATE TABLE IF NOT EXISTS projects (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    cwd         TEXT NOT NULL,
    shell_kind  TEXT NOT NULL CHECK (shell_kind IN ('native', 'wsl')),
    shell_value TEXT NOT NULL,
    provider    TEXT NOT NULL DEFAULT 'claude-code',
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_projects_updated_at ON projects (updated_at DESC);

CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
