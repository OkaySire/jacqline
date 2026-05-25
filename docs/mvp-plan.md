# Jacqline — MVP V0.1

**Goal**: app desktop fonctionnelle où on peut **créer un projet**, **ouvrir une session Claude** dans un terminal, et **naviguer/visualiser/éditer les fichiers** du projet. **Pas** d'intégration jacqcloud/channel dans ce MVP — c'est la V0.2.

**Stack** : Tauri 2 + React 19 + TypeScript + Vite + Tailwind v4 + shadcn/ui + xterm.js + portable-pty (Rust) + CodeMirror 6 + SQLite (tauri-plugin-sql)

**Repo** : `OkaySire/jacqline` (à créer)

**Reference design system** : `/home/jadei/Projects/Jacqcouille/maquette/` (Jacqline = même brand JacqCloud, primary oklch(0.55 0.2 265), Geist + Geist Mono, mais possiblement variation dark warm comme dans le mockup standalone)

---

## Phase 0 — Scaffold

- [ ] `bun create tauri-app jacqline --template react-ts --manager bun`
- [ ] Add Vite + Tailwind v4 + shadcn/ui CLI init
- [ ] Add deps frontend : `xterm @xterm/addon-fit @xterm/addon-web-links @codemirror/state @codemirror/view @codemirror/lang-* @codemirror/merge zustand`
- [ ] Add deps Rust (Cargo.toml) : `portable-pty`, `tauri-plugin-sql`, `notify` (fs watch), `tokio`, `serde`, `anyhow`, `uuid`
- [ ] Setup `.editorconfig`, `eslint`, `prettier`, `rustfmt`
- [ ] CI matrix GitHub Actions : build mac-arm64, mac-x64, win-x64, linux-x64
- [ ] License `LICENSE` (Apache 2.0) + `NOTICE`
- [ ] `README.md` minimal (build + run instructions)
- [ ] Tauri allowlist strict (par défaut tout fermé, on ouvre au cas par cas)

---

## Phase 1 — Persistence + Projects CRUD

- [ ] SQLite schema initial via tauri-plugin-sql migration :
  ```sql
  CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    cwd TEXT NOT NULL,
    shell_kind TEXT NOT NULL,            -- 'native' | 'wsl'
    shell_value TEXT NOT NULL,           -- 'bash'/'zsh'/'pwsh' OR distro name
    provider TEXT NOT NULL DEFAULT 'claude-code',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  ```
- [ ] Rust commands :
  - `project_list() -> Vec<Project>`
  - `project_create(name, cwd, shell) -> Project`
  - `project_update(id, patch) -> Project`
  - `project_delete(id) -> ()`
  - `setting_get(key) -> Option<String>`, `setting_set(key, value)`
- [ ] TypeScript bindings auto-générés (specta ou typeshare) ou typés manuellement
- [ ] Zustand store : `useProjects()` avec hydration au mount

---

## Phase 2 — UI shell (sidebar + main + right panel)

- [ ] Layout 3-pane :
  ```
  ┌─ Sidebar (240px) ─┬─ Main (flex) ──────┬─ Right (380px) ─┐
  │ Projects list     │ Terminal area      │ Tabs            │
  │ [+ New project]   │                    │  Files | Inspect│
  │                   │                    │                 │
  └───────────────────┴────────────────────┴─────────────────┘
  ```
- [ ] Sidebar component : liste projets, click = active, kebab menu (rename, delete, change shell)
- [ ] "+ New project" : dialog shadcn avec :
  - Champ `name` (free text)
  - Champ `cwd` (file picker natif via `tauri-plugin-dialog`)
  - Select `shell` (auto-détecter les options dispo par OS)
- [ ] Brand : import `colors_and_type.css` depuis maquette, font Geist via embed (pas CDN — offline-first)
- [ ] Empty states : "No projects yet" + CTA "Create your first project"
- [ ] Theme dark seul en MVP (light viendra plus tard)

---

## Phase 3 — Shell detection + WSL

- [ ] Rust : helper `detect_shells() -> Vec<ShellOption>` qui retourne :
  - **macOS/Linux** : énumère `/etc/shells`, filtre ceux qui existent (`bash`, `zsh`, `fish`, etc.)
  - **Windows** : check existence de `pwsh.exe`, `powershell.exe`, `cmd.exe`, et toutes les **distros WSL** via `wsl.exe --list --quiet --running` puis `wsl.exe --list --quiet`
- [ ] UI : dropdown shell dans le dialog "New project" populé dynamiquement
- [ ] Persister le choix dans `projects.shell_kind` + `projects.shell_value`

---

## Phase 4 — PTY + xterm.js

- [ ] Rust : module `pty_manager` qui gère N sessions concurrentes via `HashMap<SessionId, PtyHandle>`
- [ ] Commands :
  - `session_create(project_id) -> SessionId`
    - Lookup project, build spawn command :
      - native bash/zsh : `<shell> -lc 'claude'`
      - native pwsh : `pwsh -Command claude`
      - native cmd : `cmd /c claude`
      - wsl : `wsl.exe -d <distro> --cd <cwd> -- bash -lc 'claude'`
    - portable-pty `CommandBuilder::new(...)` + `pair.slave.spawn_command(cmd)?`
    - Spawn 2 tokio tasks : reader stdout → emit event, writer (channel) → pty stdin
  - `pty_write(session_id, data: Vec<u8>) -> ()`
  - `pty_resize(session_id, cols, rows) -> ()`
  - `session_kill(session_id) -> ()`
  - `session_list() -> Vec<SessionMeta>`
- [ ] Events emit :
  - `pty:data:<session_id>` (bytes)
  - `pty:exit:<session_id>` (exit code)
- [ ] Frontend : `<Terminal sessionId={...} />` :
  - Mount xterm avec FitAddon + WebLinksAddon
  - Subscribe `listen('pty:data:...')` → `term.write(bytes)`
  - `term.onData(d => invoke('pty_write', { sessionId, data: d }))`
  - `term.onResize(({cols, rows}) => invoke('pty_resize', { sessionId, cols, rows }))`
  - Cleanup à l'unmount (close listeners, NE PAS kill la session par défaut)
- [ ] Persistence : si l'utilisateur ferme un projet et le rouvre, **NE PAS** garder la session précédente (V0.1 simple), juste spawn une nouvelle
- [ ] Settings → "Provider command override" : par défaut `claude`, mais peut être customisé (préparation V0.2 où ce sera un vrai picker de provider)

---

## Phase 5 — File browser + preview

- [ ] Right panel : tabs en haut (Files / Inspector — Inspector vide en MVP, juste un placeholder), Files par défaut
- [ ] Rust commands :
  - `fs_list(project_id, rel_path) -> Vec<DirEntry>` (scoped au project.cwd, refuse `..`)
  - `fs_read(project_id, rel_path) -> Vec<u8>`
  - `fs_write(project_id, rel_path, data: Vec<u8>) -> ()`
  - `fs_watch(project_id, rel_path) -> WatchId` (via crate `notify`)
  - `fs_unwatch(watch_id) -> ()`
- [ ] DirEntry = `{ name, kind: 'file' | 'dir', size, modified }`
- [ ] Frontend Files tree :
  - Lazy expand des folders (click chevron → fs_list)
  - Filter `.gitignore` patterns ? **NON en MVP**, on affiche tout (ajout en V0.2 si l'utilisateur râle)
  - Icons par extension (Lucide + fileicons mapping)
  - Click fichier = open in preview ci-dessous

---

## Phase 6 — Preview/edit/diff (CodeMirror 6)

- [ ] Preview viewer en dessous de la file tree, OU full-pane si l'utilisateur clic sur "Open"
- [ ] Modes :
  - **Preview** (default) : `.md` rendu (react-markdown + rehype-highlight), `.json` pretty + collapsible, images, `.txt`/`.log` mono
  - **Code view** (read-only) : CodeMirror avec syntax highlighting selon extension
  - **Edit mode** : toggle via bouton "Edit", switch CodeMirror en editable, Ctrl+S → `fs_write`, Esc → cancel (re-read disk)
  - **Diff view** : bouton "Diff vs HEAD" → spawn `git diff -- <path>` côté Rust, parse unified diff, render avec `@codemirror/merge`
- [ ] Bouton "Open in external editor" : invoke `shell_open_external_editor(path)` côté Rust :
  - Lit `settings.external_editor` (default = `code` si dispo)
  - Spawn process
- [ ] Settings → External editor : free text avec template `{path}` (ex: `code {path}`, `cursor {path}`, `vim {path}`)

---

## Phase 7 — Polish MVP

- [ ] Keyboard shortcuts :
  - Ctrl/Cmd + N : new project dialog
  - Ctrl/Cmd + 1..9 : switch project N
  - Ctrl/Cmd + W : close current terminal (kill session)
  - Ctrl/Cmd + R : restart current terminal
- [ ] About dialog (version, license, GitHub link)
- [ ] Settings dialog (font size, font family, external editor, theme)
- [ ] Crash handler : panic Rust catch + display dans la fenêtre au lieu de mourir silencieusement
- [ ] Logs : `~/.jacqline/logs/main.log` (Rust tracing → file)
- [ ] First-run experience : si DB vide, redirige vers "Create your first project"

---

## Phase 8 — Build + distribution V0.1

- [ ] `tauri.conf.json` :
  - Identifier `com.okaysire.jacqline`
  - Window default size 1400x900
  - Icons (générer depuis le mark JacqCloud)
- [ ] GitHub Actions workflow `release.yml` :
  - Trigger sur tag `v*`
  - Matrix mac-arm64, mac-x64, win-x64, linux-x64
  - Build avec `tauri build`
  - Upload artifacts vers GitHub Release
- [ ] **Pas de code signing en V0.1** (l'utilisateur acceptera les warnings OS). Code signing en V0.5.
- [ ] README : sections Install, Build from source, Contributing
- [ ] `CHANGELOG.md` initial

---

## Hors scope V0.1 (= V0.2+)

- ❌ Intégration jacqcloud (BusClient, SSE, agents sidebar, get_summary, get_transcript)
- ❌ Auto-restore session (Resume dialog)
- ❌ Plugin SDK Extism
- ❌ Multi-providers picker (claude-code only, en dur)
- ❌ Code signing / notarisation
- ❌ Telemetry
- ❌ Auto-update
- ❌ Themes custom
- ❌ Multi-window / split panes
- ❌ Plugin marketplace

---

## Décisions de design à prendre tôt

- [ ] **Brand variation** : on garde le dark warm du mockup standalone (#0a0a0a, #1f1d1c, #181614 + accent purple) ou on aligne strict sur le design system JacqCloud (zinc base + primary purple plus clair) ? Probablement variation Jacqline = plus warm, plus terminal-friendly.
- [ ] **Icon app** : nouveau mark Jacqline (carré purple + check style mockup) ou wordmark JacqCloud ?
- [ ] **First terminal** : spawn auto au switch projet, ou bouton "Start session" explicite ? Auto plus user-friendly, mais peut surprendre.

---

## Coordination agents

Quand on attaque ce MVP, l'agent dédié sera **`jacqline`** (role `rust-engineer` ou `typescript-pro` selon zone). Il bossera depuis `/home/jadei/Projects/Jacqcouille/jacqline` (repo à créer).

Pour le brand/UI, coordination avec **`redesign`** (déjà connecté au bus) qui peut prototyper les écrans Jacqline dans `maquette/ui_kits/jacqline/` avant que `jacqline` les implémente.

Pour le BusClient TS partageable, à terme on reuse celui de `jacqcloud-channel` — coordination avec **`channel`**. Mais pour MVP : pas besoin.
