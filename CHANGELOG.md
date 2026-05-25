# Changelog

All notable changes to Jacqline are documented in this file. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
project tries to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

(nothing yet)

## [0.1.0] — 2026-05-25

The first MVP cut. Three things work end-to-end: create a project, drive a
Claude session in an embedded terminal, browse and quickly edit files in the
project's working directory.

### Added — application

- **Projects** — name + working directory + shell target (native or WSL
  distro). Persisted in SQLite at `<app_data_dir>/jacqline.db`. CRUD
  exposed through scoped Rust commands; the renderer never touches the DB
  directly.
- **Runtime shell detection** — `/etc/shells` on Unix, `pwsh` / `powershell`
  / `cmd` on Windows, WSL distros via `wsl.exe --list --quiet`. Drops into
  the New Project dialog. Fallback hardcoded list if detection fails.
- **3-pane UI shell** — sidebar (projects) | main (terminal) | inspector
  (files). Warm dark brand validated against `docs/mockup.html`: `#0a0a0a`
  canvas, `#181614` popover, `#1f1d1c` card, `#7c3aed` purple accent. Geist
  Sans + Geist Mono embedded via `@fontsource-variable` (offline-first).
- **PTY-backed terminals** (`portable-pty` + xterm.js) — auto-spawn when a
  project becomes active, `bash -l -c claude` / `pwsh -NoExit -Command
  claude` / `cmd /k claude` / `wsl.exe -d <distro> --cd <cwd> -- bash -lc
  claude` per shell kind. Multi-project sessions stay alive in the
  background; switching projects preserves scrollback (CSS `display:none`,
  not unmount). Restart banner on `pty:exit`.
- **Scoped file browser** — lazy-loaded tree in the inspector. Every
  command canonicalizes the project's `cwd` + the requested target and
  refuses anything that escapes (absolute, `..`, symlinks pointing out).
- **File preview** — Markdown (react-markdown + rehype-highlight), JSON
  pretty-printed, inline images via Blob URL, plain-text fallback.
- **Code view + quick edit** — CodeMirror 6 with language routing
  (Markdown / JSON / Rust / TS+TSX+JS+JSX). Editable variant binds
  `Cmd/Ctrl+S` to `fs_write` with saving / saved / error footer.
- **Git diff vs working tree** — `git -C <cwd> diff --no-color -- <path>`,
  unified output rendered line-by-line with +/-/hunk coloring.
- **Open in external editor** — configurable template (default `code
  {path}`), tokenized with `shlex`, spawned in the project cwd.
- **Keyboard shortcuts** — `Cmd/Ctrl+N` (new project), `Cmd/Ctrl+1..9`
  (switch project), `Cmd/Ctrl+W` (kill active session), `Cmd/Ctrl+R`
  (restart active session).
- **Settings dialog** — font family + font size + external editor template,
  persisted via `setting_set`. Font changes apply on the next terminal /
  editor mount.
- **About dialog** — version badge, license, GitHub link.
- **First-run experience** — auto-opens the New Project dialog when the
  local DB is empty.

### Added — operations

- **Strict Tauri allowlist** — only `core:default` + `dialog:allow-open`.
  Every FS / PTY / git / external-editor call goes through a Rust command.
- **Persistent logs** — `tracing-appender` daily rolling file at
  `<app_data_dir>/logs/jacqline.log` + tee to stderr.
- **Rust panic hook** — captures panic location + payload to the log file.
- **Frontend ErrorBoundary** — class boundary catches React errors, shows
  a recovery page with the stack and a "Reload window" button.
- **CI** — windows-only matrix (`linux-x64` / `macos-*` commented in
  `.github/workflows/ci.yml` until V0.1 stabilizes) running type-check,
  ESLint, Prettier, `cargo fmt`, `cargo clippy`, `tauri build --no-bundle`.
- **MSI artifact workflow** — `.github/workflows/build-windows.yml`
  produces an unsigned `.msi` on every `main` push, downloadable from the
  Actions tab (14-day retention).
- **Release workflow** — `.github/workflows/release.yml` triggered on tag
  `v*`, builds all four OS bundles via `tauri-apps/tauri-action`, drafts a
  GitHub Release with the artifacts attached.
- **One-shot setup scripts** for Windows / macOS / Linux at
  `scripts/setup-*.{ps1,sh}`. Idempotent.
- **App icon** — purple rounded square with a white corner stroke,
  generated from `assets/jacqline-mark.svg` (source) via
  `bunx tauri icon` for every target format.

### Known limitations (deferred)

- No code signing or notarization. SmartScreen + Gatekeeper warn on first
  launch.
- No light theme — warm dark only.
- No JacqCloud bus integration yet (V0.2).
- No plugin SDK (Extism — V0.4).
- No multi-provider picker (`claude` is hardcoded).
- No `.gitignore` filtering in the file tree.
- No live theme/font reactivity — Settings apply on next mount.
- No session persistence across app restarts. The transcript backup
  feature in the JacqCloud bus will be used for resume in V0.2.

[Unreleased]: https://github.com/OkaySire/jacqline/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/OkaySire/jacqline/releases/tag/v0.1.0
