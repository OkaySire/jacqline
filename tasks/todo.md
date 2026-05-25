# Jacqline — Suivi MVP V0.1

Plan complet : `docs/mvp-plan.md` (local). Archi de référence : `docs/architecture.md`.
Leçons : `tasks/lessons.md`.

## En cours

(rien — Phase 0 terminée localement, en attente que orchestrator crée `OkaySire/jacqline` pour push + push CI)

## Phase 0 — Scaffold ✅ (local, non poussé)

- [x] `bun create tauri-app` scaffold (Tauri 2 + React 19 + TS + Vite) — fait dans `/tmp` puis sync pour préserver `CLAUDE.md`, `docs/`, `tasks/`, `.jacq/`
- [x] Setup Tailwind v4 (`@tailwindcss/vite` + `@theme` dans `src/index.css`)
- [x] Setup shadcn/ui squelette (`components.json`, `src/lib/utils.ts` avec `cn`)
- [x] Frontend deps : xterm + addons, codemirror 6 + merge, zustand, react-markdown, rehype-highlight, lucide-react, `@tauri-apps/plugin-{sql,dialog}`
- [x] Rust deps (`src-tauri/Cargo.toml`) : tauri-plugin-{sql,dialog}, portable-pty, notify, tokio, serde, uuid, anyhow, thiserror, tracing + tracing-subscriber
- [x] Tauri allowlist strict (`capabilities/default.json` = `core:default` only)
- [x] Tauri identifier `com.okaysire.jacqline`, window 1400x900 (min 1024x640)
- [x] Tooling : `.editorconfig`, ESLint v9 flat config (TS + react-hooks + type-check), Prettier, rustfmt.toml (edition 2024)
- [x] LICENSE Apache 2.0 + NOTICE + README minimal (sections Install/Build/Layout)
- [x] `.gitignore` racine + src-tauri
- [x] CI matrix GitHub Actions (`ci.yml`) : mac-arm64, mac-x64, win-x64, linux-x64 — type-check, lint, fmt, clippy, `tauri build --no-bundle`
- [x] git init + commit local
- [ ] **Bloqué** : push sur `OkaySire/jacqline` (orchestrator crée le repo, puis on push)

## Phase 1 — Projects CRUD

- [ ] Migration SQL initiale (projects + settings) via `tauri-plugin-sql`
- [ ] Commands Rust : `project_list` / `project_create` / `project_update` / `project_delete` + `setting_get` / `setting_set`
- [ ] TS bindings (specta auto-gen ou manuel)
- [ ] Zustand store `useProjects()` avec hydration

## Phase 2 — UI shell

- [ ] Layout 3-pane (sidebar + main + right)
- [ ] Sidebar : liste projets + kebab menu
- [ ] Dialog "New project" (name, cwd file picker, shell dropdown)
- [ ] Brand init (Geist embedded + variation warm vs zinc — **décision orchestrator**)
- [ ] Empty state

## Phase 3 — Shell detection

- [ ] Rust helper `detect_shells()` — Unix `/etc/shells` + Windows pwsh/cmd + WSL distros
- [ ] Dropdown shell populé dynamiquement

## Phase 4 — PTY + xterm

- [ ] `pty_manager` Rust (HashMap<SessionId, PtyHandle>)
- [ ] Commands `session_create` / `pty_write` / `pty_resize` / `session_kill` / `session_list`
- [ ] Events `pty:data:*` + `pty:exit:*`
- [ ] Component `<Terminal sessionId=...>` avec FitAddon

## Phase 5 — File browser

- [ ] Right panel tabs (Files / Inspector placeholder)
- [ ] Commands `fs_list` / `fs_read` / `fs_write` / `fs_watch` (scoped au `cwd`, refuse `..`)
- [ ] FileTree React (lazy expand + icons Lucide)

## Phase 6 — Preview / edit / diff CodeMirror 6

- [ ] Preview Markdown / JSON / images
- [ ] Quick edit (Ctrl+S → `fs_write`)
- [ ] Diff vs HEAD (spawn `git diff`, parse, `@codemirror/merge`)
- [ ] Bouton "Open in external editor" + setting `external_editor`

## Phase 7 — Polish

- [ ] Keyboard shortcuts (Cmd+N, Cmd+1-9, Cmd+W, Cmd+R)
- [ ] About / Settings dialogs
- [ ] Crash handler + logs OS app data dir
- [ ] First-run experience

## Phase 8 — Build + release V0.1

- [ ] `tauri.conf.json` (icons à générer)
- [ ] GH Actions `release.yml` sur tag `v*`
- [ ] CHANGELOG initial
- [ ] README sections Install / Build / Contributing détaillées

## Décisions de design en attente (orchestrator)

- [ ] **Brand variation** : warm (`#0a0a0a`, `#1f1d1c`) ou zinc strict JacqCloud ? — Phase 2 baseline = warm placeholder dans `src/index.css`, à confirmer
- [ ] **Icon app** : nouveau mark Jacqline ou wordmark JacqCloud ?
- [ ] **First terminal** : auto-spawn au switch projet ou bouton "Start session" explicite ?

## Setup machine restant (dev local seulement)

- [ ] **WSL** : `sudo apt install libwebkit2gtk-4.1-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev libxdo-dev pkg-config build-essential curl wget file` avant premier `bun run tauri dev`. La CI a déjà les deps.
