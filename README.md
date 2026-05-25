# Jacqline

Cross-platform desktop app to drive Claude (and other CLI agent) sessions, with
native [JacqCloud](https://jacqcloud.com) bus integration.

> **Status:** V0.1. See [`CHANGELOG.md`](./CHANGELOG.md) for what shipped, and
> [`docs/mvp-plan.md`](./docs/mvp-plan.md) + [`docs/architecture.md`](./docs/architecture.md)
> for what's planned next.

## Features (V0.1 MVP)

- **Projects** — name, working directory, shell target (native shell or WSL distro)
- **Terminal sessions** — spawn `claude` (or other provider CLIs) in an embedded PTY
  rendered by xterm.js, with multi-project scrollback preserved across switches
- **File panel** — browse the project's `cwd`, preview Markdown / JSON / images,
  quick edit with `Cmd/Ctrl+S`, diff vs git `HEAD`, open in your external editor
- **Keyboard-first** — `Cmd/Ctrl+N` new project, `Cmd/Ctrl+1..9` switch project,
  `Cmd/Ctrl+W` kill / `Cmd/Ctrl+R` restart the active session

Out of scope for V0.1 — coming in later releases: JacqCloud bus integration,
multi-provider picker, plugin SDK (Extism), auto-update, code signing, light
theme.

## Install

| Channel                  | How                                                                                                                                                                                                             |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Stable** (recommended) | Download the installer for your OS from the [latest GitHub Release](https://github.com/OkaySire/jacqline/releases/latest). `.dmg` (macOS), `.msi` (Windows), `.AppImage` / `.deb` (Linux).                      |
| **Nightly Windows MSI**  | Grab the latest `jacqline-windows-msi-<sha>` artifact from the [Build Windows MSI workflow](https://github.com/OkaySire/jacqline/actions/workflows/build-windows.yml) (14-day retention, every push to `main`). |
| **From source**          | See [Build from source](#build-from-source) below.                                                                                                                                                              |

> Pre-V0.1 installers are **unsigned**. Windows SmartScreen and macOS Gatekeeper
> will warn on first launch — choose _More info_ → _Run anyway_ on Windows, or
> right-click → _Open_ on macOS. Code signing + notarization land in V0.2.

## Stack

- **Tauri 2** (Rust shell) + **React 19 + TypeScript + Vite** (renderer)
- **xterm.js** + `portable-pty` for terminal sessions
- **CodeMirror 6** for preview / quick edit / diff
- **Tailwind v4** + **shadcn/ui** for styling
- **SQLite** via `rusqlite` for local persistence

## Build from source

### Prerequisites

| Platform        | Required                                                                                                                                                                                                                                                                                            |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **All**         | [Bun](https://bun.sh) ≥ 1.3, [Rust](https://rustup.rs) ≥ 1.85 (edition 2024)                                                                                                                                                                                                                        |
| **macOS**       | Xcode Command Line Tools (`xcode-select --install`)                                                                                                                                                                                                                                                 |
| **Windows**     | [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/), [WebView2](https://developer.microsoft.com/microsoft-edge/webview2/) (preinstalled on Win 11)                                                                                                              |
| **Linux / WSL** | `webkit2gtk-4.1`, `libssl-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`, `libxdo-dev`, `pkg-config`, `build-essential`. On Debian/Ubuntu: `sudo apt install libwebkit2gtk-4.1-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev libxdo-dev pkg-config build-essential curl wget file` |

### Quick start (one-shot setup script)

Each platform ships a script that detects what's missing, installs it (via
`winget` / `apt` / Homebrew), runs `bun install`, and offers to launch
`bun run tauri dev`. All three are idempotent — safe to re-run.

| Platform                          | Command                                                                                                        |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Windows**                       | `pwsh -File .\scripts\setup-windows.ps1` (may need `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once) |
| **macOS**                         | `./scripts/setup-macos.sh`                                                                                     |
| **Linux / WSL (Debian / Ubuntu)** | `./scripts/setup-linux.sh`                                                                                     |

Pass `-NoRun` (Windows) or `--no-run` (macOS / Linux) to skip the dev-server
launch prompt.

### Manual install

```bash
bun install
bun run tauri dev
```

### Production build

```bash
bun run tauri build
```

Artifacts land in `src-tauri/target/release/bundle/`.

## Project layout

```
.
├── assets/                    Brand source assets (Jacqline mark SVG)
├── docs/                      Architecture, MVP plan, design mockup
├── scripts/                   One-shot setup scripts (Windows / macOS / Linux)
├── src/                       React renderer (TS)
│   ├── components/            UI components (file tree, terminal, dialogs, …)
│   ├── hooks/                 useKeyboardShortcuts, etc.
│   ├── lib/                   utils + typed `invoke` wrappers
│   ├── stores/                Zustand stores (projects, sessions, ui, settings)
│   ├── types/                 Shared TS types
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css              Tailwind v4 entry + @theme tokens
├── src-tauri/                 Rust shell
│   ├── src/                   db, project, project_fs, pty, shell, external, …
│   ├── migrations/            SQL migrations applied at boot
│   ├── capabilities/          Tauri allowlist (strict by default)
│   ├── icons/                 Generated by `bunx tauri icon`
│   ├── Cargo.toml
│   └── tauri.conf.json
├── tasks/                     Local agent task tracking (todo.md, lessons.md)
└── .github/workflows/         ci.yml + build-windows.yml + release.yml
```

## Contributing

The V0.1 cycle is being built in lockstep on the
[Jacquouille agent bus](https://github.com/OkaySire/jacquouille). External
contributions are welcome from V0.2 onwards — meanwhile please file issues for
bugs, design feedback, or feature ideas.

### Branch + PR conventions

- One feature per branch: `feat/<scope>` for new work, `fix/<scope>` for fixes,
  `chore/<scope>` for tooling / CI.
- Branch from `main`; open a PR back to `main`. CI must be green before merge.
- Merge strategy is **squash** so `main` stays linear and each PR is one commit.

### Code style + checks

```bash
bun run lint        # ESLint (TypeScript + react-hooks, strict)
bun run fmt         # Prettier --write
bun run fmt:check   # Prettier --check
bunx tsc --noEmit   # TypeScript type-check
cd src-tauri && cargo fmt --all && cargo clippy --all-targets -- -D warnings
```

The CI workflow at `.github/workflows/ci.yml` runs the same checks on every PR.

## License

[Apache 2.0](./LICENSE) — see [`NOTICE`](./NOTICE) for attribution.
