# Jacqline — Architecture v1

App desktop cross-platform pour piloter des sessions Claude (et autres providers) connectées au bus JacqCloud. Open source. Extensible via plugins style VSCode.

## Goals

1. **Cross-platform** : Windows (WSL + natif), macOS, Linux. Une build par OS.
2. **Terminal-first** : sessions Claude (ou autre CLI agent) tournent dans un PTY rendu par xterm.js.
3. **Bus-native** : intégration jacqcloud built-in (sidebar agents live, inspector CLAUDE.md, summary auto-restore).
4. **Extensible** : SDK plugin façon VSCode — providers (LLM CLIs), commands, panels right-side, file contributions.
5. **Open source** : Apache 2.0, contributions communautaires sur providers et panels.

---

## Stack technique

| Couche | Choix | Pourquoi |
|---|---|---|
| Shell desktop | **Tauri 2** | 10MB footprint, security-by-default, IPC sandboxée |
| UI renderer | **React 19 + Vite + TypeScript** | Écosystème mature, mêmes patterns que jacqcloud-front |
| Terminal | **xterm.js + xterm-addon-fit + xterm-addon-web-links** | Standard de fait (VSCode, Hyper, Wave) |
| PTY backend | **portable-pty** (Rust crate) | Gère ConPTY/Unix nativement, async-friendly |
| State global | **Zustand** | Léger, pas de boilerplate Redux |
| Style | **Tailwind v4 + shadcn/ui** | Cohérent avec jacqcloud-front |
| Storage local | **SQLite via tauri-plugin-sql** | Projets, sessions, settings, extension state |
| Bus client | **Reuse `jacqcloud-channel` BusClient en TS** | Code partagé |
| Plugin runtime | **Extism 1.21+ (WASM, in-process Rust crate)** | Sandboxé, multi-langage PDK, zero overhead process |

---

## Modèle de données

### Projet
```ts
{
  id: string,                    // uuid
  name: string,                  // "jacqcloud-front"
  cwd: string,                   // path absolu (côté host OS, pas WSL)
  shell: ShellTarget,            // wsl-ubuntu | native-bash | native-zsh | native-pwsh
  provider: string,              // id du provider (claude-code, codex, gemini-cli, ...)
  busAgent?: string,             // nom de l'agent sur jacqcloud (optionnel)
  busId?: string,                // bus jacqcloud (hérité du global si absent)
  createdAt, updatedAt
}
```

### ShellTarget
```ts
type ShellTarget =
  | { kind: 'native', shell: 'bash' | 'zsh' | 'pwsh' | 'cmd' }
  | { kind: 'wsl',    distro: string }              // ex: 'Ubuntu', 'Debian'
  | { kind: 'ssh',    host: string, user: string }  // futur
```

### Session
```ts
{
  id: string,
  projectId: string,
  pid: number,
  status: 'running' | 'exited' | 'killed',
  startedAt: Date,
  exitCode?: number,
  scrollback: string,   // optionnel : persister N derniers KB pour resume visuel
}
```

### Settings (global)
```ts
{
  theme: 'jacqline-dark' | 'jacqline-light' | string,    // string = thème custom plugin
  defaultBus: { busId, url, tokenRef },
  defaultProvider: string,
  fontFamily: 'Geist Mono' | string,
  fontSize: number,
  installedPlugins: PluginRef[],
}
```

---

## Architecture runtime

### Processus

```
┌─ Tauri main (Rust) ─────────────────────────┐
│  - Fenêtre + IPC                            │
│  - PTY manager (portable-pty)               │
│  - SQLite (tauri-plugin-sql)                │
│  - Filesystem watcher (CLAUDE.md, etc.)     │
│  - Plugin host (WASM ou sidecar)            │
│  - Bus client mirror (SSE pour la sidebar)  │
└─────────────────────────────────────────────┘
          ↕ IPC (invoke / events)
┌─ Renderer (React) ──────────────────────────┐
│  - Sidebar : projets + agents bus live      │
│  - Terminal area : xterm.js per session     │
│  - Right panel : tabs (Inspector + plugins) │
│  - Command palette (Ctrl+K)                 │
│  - Settings UI                              │
└─────────────────────────────────────────────┘
```

### Flow démarrage d'un projet

```
User clic projet "jacqcloud-front"
  → Renderer demande session via IPC invoke('session.create', {projectId})
  → Main alloue un PTY via portable-pty
       - kind=wsl   → spawn "wsl.exe -d Ubuntu --cd <cwd> -- bash -lc 'claude'"
       - kind=native → spawn "<shell> -lc 'claude'"
  → Main retourne {sessionId, pid}
  → Renderer monte un <Terminal sessionId={...}/>
       - Subscribe à event 'pty.data:<sessionId>' → xterm.write(bytes)
       - sendInput via invoke('pty.write', {sessionId, data})
       - sendResize via invoke('pty.resize', {sessionId, cols, rows})
  → Inspector côté droit charge CLAUDE.md du cwd
  → Sidebar bus interroge get_summary, list_services pour cet agent
```

---

## Système de plugins (extensibilité VSCode-like)

### Plugin manifest (`plugin.json`)

```json
{
  "name": "jacqline-openai-provider",
  "version": "0.1.0",
  "displayName": "OpenAI Codex Provider",
  "description": "Run OpenAI Codex sessions inside Jacqline",
  "publisher": "okaysire",
  "engines": { "jacqline": "^0.1.0" },
  "main": "dist/extension.js",
  "contributes": {
    "providers": [
      {
        "id": "openai-codex",
        "label": "OpenAI Codex",
        "icon": "icon.svg",
        "command": "codex",
        "args": ["--interactive"],
        "envHint": ["OPENAI_API_KEY"]
      }
    ],
    "panels": [
      {
        "id": "openai.usage",
        "title": "OpenAI Usage",
        "icon": "$/icons/chart.svg",
        "when": "project.provider == 'openai-codex'"
      }
    ],
    "commands": [
      { "id": "openai.openDocs", "title": "Open OpenAI Docs" }
    ],
    "themes": [
      { "id": "openai-dim", "label": "OpenAI Dim", "path": "themes/dim.json" }
    ]
  },
  "activationEvents": [
    "onProvider:openai-codex",
    "onCommand:openai.openDocs"
  ]
}
```

### Contribution points (extensible)

| Point | Permet de... |
|---|---|
| `providers` | Ajouter un binaire/CLI à spawn dans un PTY (Claude, Codex, Gemini, Aider, Cursor CLI, local llama.cpp...) |
| `panels` | Ajouter un onglet dans le right panel (file browser, web preview, usage charts, MCP inspector, custom) |
| `commands` | Ajouter une entrée dans la command palette (Ctrl+K) |
| `themes` | Ajouter un thème xterm + UI |
| `statusBarItems` | Ajouter des items en bas (token count, model, cost...) |
| `keybindings` | Définir des raccourcis clavier |
| `views` | Ajouter une view dans la sidebar (ex: "Branches Git", "Linear Tickets") |
| `fileContributions` | Hook sur ouverture de fichier (ex: Markdown preview) |

### Plugin API (TypeScript)

```ts
import { jacqline } from '@jacqline/api';

// Activation hook
export function activate(ctx: jacqline.Context) {
  // Register a right-panel provider
  ctx.panels.register('openai.usage', {
    title: 'OpenAI Usage',
    render: async (host) => {
      const usage = await fetch('https://api.openai.com/v1/usage', ...);
      host.render(<UsageChart data={usage}/>);
    },
  });

  // Open a file from current project in a new editor pane (host action)
  ctx.commands.register('openai.openDocs', () => {
    ctx.window.openExternal('https://platform.openai.com/docs');
  });

  // Subscribe to bus events from inside the plugin
  ctx.bus.subscribe('agent_status_changed', (evt) => {
    if (evt.agent === ctx.project.busAgent) ctx.statusBar.update('online');
  });

  // Read a file from the project's cwd
  const claudemd = await ctx.fs.read('CLAUDE.md');

  // Open URL in embedded webview (right panel)
  ctx.panels.openWebview('https://docs.openai.com', { title: 'OpenAI Docs' });
}

export function deactivate() { /* cleanup */ }
```

### Plugin sandbox / runtime — Extism 1.21+ dès V0.4

État de l'art en 2026 : Extism est mature (v1.0 fin 2023, v1.21 en mars 2026, 21 minor releases stables, wasmtime 41). Adopté en production par Hyper MCP, moonrepo, Otoroshi.

**Avantages pour Jacqline**
- **In-process** : pas de sidecar Node, pas de IPC overhead, pas de +80MB binaire Node embarqué
- **Intégration native Rust** : crate `extism` s'insère directement dans le main Tauri
- **Sandbox fort by default** : pas de FS direct, pas de réseau direct — tout passe par des **host functions** capability-gated
- **Multi-langage PDK** : un dev de plugin peut écrire en Rust, Go, JS, AssemblyScript, Python, Zig, C++ — choisit selon son confort
- **Distribution OCI** : pattern marketplace via registry OCI (`oci://ghcr.io/jacqline/plugin-x:v1`)
- **Cold start négligeable** : <50ms typique pour un plugin compilé en release

**Capabilities exposées par Jacqline aux plugins** (host functions Rust)
```rust
// FS scoped to project.cwd
host_fn!(pub fs_read(path: String) -> Result<Vec<u8>>);
host_fn!(pub fs_list(path: String) -> Result<Vec<DirEntry>>);
host_fn!(pub fs_watch(path: String) -> Result<u64 /* watchId */>);

// Bus proxy — token jamais exposé, tout passe par main
host_fn!(pub bus_invoke(method: String, path: String, body: Option<Vec<u8>>) -> BusResult);
host_fn!(pub bus_subscribe(event_type: String) -> Result<u64>);

// UI registration (panels, commands, status bar, themes)
host_fn!(pub ui_register_panel(spec: PanelSpec));
host_fn!(pub ui_open_webview(url: String, opts: WebviewOpts));
host_fn!(pub ui_show_notification(text: String, level: NotificationLevel));

// Window / shell
host_fn!(pub shell_open_external(url: String));
host_fn!(pub window_open_file(path: String));

// Plugin-scoped storage (SQLite namespace)
host_fn!(pub storage_get(key: String) -> Option<Vec<u8>>);
host_fn!(pub storage_set(key: String, value: Vec<u8>));

// Project context (read-only)
host_fn!(pub project_cwd() -> String);
host_fn!(pub project_meta() -> ProjectMeta);
```

**Manifest des capabilities** dans `plugin.json` :
```json
{
  "capabilities": {
    "fs:read": ["**/*.md", "**/*.json"],
    "fs:list": ["**"],
    "bus": ["get_context", "list_services"],
    "ui": ["panels", "notifications"],
    "network": ["api.openai.com", "*.anthropic.com"]
  }
}
```

Au premier install, l'utilisateur valide les capabilities demandées (style permissions Android/VSCode).

**Trade-offs assumés**
- Plugins ne peuvent pas utiliser npm directement → ils compilent leur PDK (Rust → wasm32-wasi, JS via Javy/AssemblyScript)
- Debugging WASM moins ergonomique que Node — atténué par le PDK JS pour les contributors qui préfèrent
- Pas d'accès direct au DOM dans le main UI — les panels custom passent par la primitive `ui_register_panel` qui rend du HTML déclaratif côté renderer (sécurisé par CSP par plugin)

### Activation events

Comme VSCode :
- `onProvider:<id>` — quand un projet utilise ce provider
- `onCommand:<id>` — quand la command palette appelle la commande
- `onView:<id>` — quand une view du plugin est ouverte
- `onStartup` — au démarrage (à utiliser parcimonieusement)
- `onFile:**/*.{ext}` — quand un fichier matching ext est ouvert

---

## Right panel (extensible)

Layout : tabs en haut, contenu dessous. Tabs = panels enregistrés. Built-in :

| Panel | Description |
|---|---|
| **Inspector** | CLAUDE.md + agent definitions du projet courant, hot-reload |
| **Files** | File browser du `cwd` (lecture seule, ouvre dans VSCode/editor par double-clic) |
| **Browser** | WebView embedded (par défaut : docs.jacqcloud.com) |
| **Bus** | get_context, list_services, derniers messages |
| **Activity** | Stream `agent_activity` en live (du bus, via SSE) |

Plugins peuvent en ajouter d'autres via `contributes.panels`.

### Panel API
```ts
ctx.panels.register('my.panel', {
  title: 'My Panel',
  icon: 'data:image/svg+xml;base64,...',
  render: (host) => host.renderReact(<MyPanel/>),
  // OU
  openWebview: 'https://example.com',
  // OU
  openFile: 'path/to/file.md',     // ouvre dans le viewer markdown built-in
});
```

---

## Bus integration native

L'app maintient **deux niveaux** de connexion bus :

1. **Per-agent (dans la session Claude)** — via le plugin `jacqcloud-channel` actuel. Aucune modif.
2. **Global (depuis l'app Tauri)** — l'app maintient une SSE `/events/all` (si user est leader) ou polling périodique pour :
   - Afficher dans la sidebar le statut live des autres agents
   - Auto-restore : si user ouvre un projet existant, fetch `get_summary` + `get_transcript_metadata` pour proposer `/restore-transcript`
   - Push notifs OS sur `breaking_change`, `domain_event` important

### Auth token
- Reuse `~/.jacq/credentials.json` (déjà en place)
- UI Settings → Bus connection → "Sign in to jacqcloud" → device flow RFC 8628 (skill `jacquouille:access` réimplémentée native)

---

## IPC contract (Renderer ↔ Main Tauri)

### Commands (invoke)
```
session.create(projectId)       → { sessionId, pid }
session.kill(sessionId)         → void
pty.write(sessionId, data)      → void
pty.resize(sessionId, cols, rows)
project.list()                  → Project[]
project.create(data)            → Project
project.delete(id)
fs.read(projectId, relPath)     → string
fs.list(projectId, relPath)     → DirEntry[]
fs.watch(projectId, relPath)    → watchId
fs.unwatch(watchId)
bus.proxy(method, path, body?)  → BusResult
shell.openExternal(url)
plugin.list()                   → Plugin[]
plugin.install(source)
plugin.invoke(pluginId, cmd, args)
```

### Events (emit)
```
pty.data:<sessionId>           → bytes
pty.exit:<sessionId>           → exitCode
fs.changed:<watchId>           → DirEntry
bus.event                      → SSE event
plugin.message:<pluginId>      → arbitrary
```

---

## Sécurité

- **Tauri allowlist strict** : pas de FS global, juste des helpers scoped à `project.cwd`
- **Plugin sandbox** : par défaut un plugin n'a accès qu'à :
  - Son propre stockage (`ctx.storage`)
  - Le projet courant (`ctx.project`, `ctx.fs.read/list` scoped à cwd)
  - Pas d'accès filesystem hors cwd sans capability explicite (`"capabilities": ["fs:read:**"]`)
- **Bus token** : jamais exposé aux plugins. Plugins passent par `ctx.bus.proxy()` qui inject l'auth côté main.
- **WebView panels** : `webPreferences` strict, CSP par plugin
- **Code signing** : Mac (Apple Developer) + Windows (cert EV) avant publication

---

## Distribution

| Asset | Tooling |
|---|---|
| Build | `bun run tauri build` (matrice GitHub Actions) |
| Auto-update | `tauri-plugin-updater` + manifest hébergé sur GitHub Releases |
| Plugins marketplace | Phase 2 : registry HTTP + `plugin.install("scope/name")` |
| Install | `.dmg` (Mac), `.msi` (Win), `.AppImage` + `.deb` + `.rpm` (Linux) |

---

## Roadmap découpée

### V0.1 — MVP terminal local
- [ ] Tauri 2 scaffold + React 19 + xterm.js
- [ ] portable-pty wiring (spawn shell natif)
- [ ] Sidebar : add project, switch project
- [ ] Inspector : afficher CLAUDE.md du cwd
- [ ] Settings : font, theme dark
- [ ] Build CI matrix (mac/win/linux)

### V0.2 — WSL + providers
- [ ] WSL detection + distro picker
- [ ] Provider abstraction (claude-code built-in)
- [ ] Spawn provider command via PTY
- [ ] Persist projects en SQLite

### V0.3 — Bus integration
- [ ] BusClient TS shared (depuis jacqcloud-channel)
- [ ] SSE listener global
- [ ] Sidebar : agents bus live
- [ ] **Resume detection** : au démarrage d'un projet, `get_transcript_metadata({agentName})` → si présent, modal "Resume previous session? ({{updatedAt}})" → spawn PTY avec `claude --resume {sessionId}` (download + gunzip + write transcript local d'abord, comme le skill `restore-transcript` fait aujourd'hui)

### V0.4 — Plugins SDK (Extism dès le départ)
- [ ] Plugin manifest format + capabilities
- [ ] Extism host integration (crate `extism`, host functions Rust)
- [ ] Capability prompt UI à l'install
- [ ] Contributes : providers + panels + commands
- [ ] Doc + scaffolding `cargo generate jacqline/plugin-rust-template` et `bun create jacqline-plugin-js`

### V0.5 — Polish
- [ ] Themes (xterm + UI)
- [ ] Auto-update
- [ ] Code signing + notarisation
- [ ] First marketplace (statique sur GitHub)

### V1.0 — Public
- [ ] Plugin marketplace dynamic (OCI registry)
- [ ] Telemetry opt-in
- [ ] Landing + docs publiques
- [ ] Plugin certification process (signature, audit capabilities)

---

## Questions ouvertes

1. ~~**Plugin runtime**~~ — tranché : **Extism 1.21+** (in-process, sandboxé, multi-langage PDK, intégration native Rust/Tauri)
2. ~~**Persistence sessions**~~ — tranché : **restart accepté**. Le transcript backup (`PUT/GET /agents/{name}/transcript`) persiste déjà la conversation Claude. Au démarrage, Jacqline détecte une transcript sur le bus pour ce projet → propose "Resume session?" → spawn PTY avec `claude --resume {sessionId}`. Pas de tmux/daemon à gérer, marche sur Windows natif. Le scrollback visuel est perdu mais la conversation reprend exactement.
3. ~~**Multi-window**~~ — tranché : **VSCode-like simple**. Une fenêtre unique avec sidebar projets + 1 terminal actif à la fois (Ctrl+1/2/3 pour switcher). Pas de tabs en V0.x. "Open in new window" et split-editor en V1+ si demandé.
4. ~~**Embedded editor**~~ — tranché : **CodeMirror 6, scope minimal**.
   - **Pas un éditeur** : pas de LSP, pas d'autocomplete, pas de search global, pas de multi-tab
   - **Built-in** :
     - **Preview** : Markdown rendu, JSON pretty-print, images, syntax-highlighted code
     - **Quick edit** : édition inline avec save (Ctrl+S) pour les fix rapides
     - **Diff view** : show what Claude just modified (track les writes de la session courante) + diff git working tree vs HEAD — primitive très demandée
   - **Bouton "Open in external editor"** : spawn `$EDITOR` (configurable Settings → External editor : VSCode / Cursor / Zed / vim / etc.)
   - **Stack** : CodeMirror 6 (~200KB modulaire, vs Monaco ~2MB) + `@codemirror/merge` pour le diff natif
5. ~~**Telemetry**~~ — tranché : **opt-in dès V0.5** (Sentry pour crashs + analytics events anonymes). Option claire dans Settings → Privacy pour désactiver complètement. Prompt explicite au premier lancement (pas d'opt-out caché).
6. ~~**Naming finale**~~ — tranché : **Jacqline**.
7. ~~**License**~~ — tranché : **Apache 2.0** (patent grant + compatibilité GPL).
