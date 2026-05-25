# Jacqline

Cross-platform desktop app to drive Claude (and other CLI agent) sessions, with
native [JacqCloud](https://jacqcloud.com) bus integration.

> **Status:** V0.1 (pre-release scaffold). MVP scope: create a project, open a
> Claude session in a terminal, browse / preview / quick-edit files. See
> [`docs/mvp-plan.md`](./docs/mvp-plan.md) and [`docs/architecture.md`](./docs/architecture.md).

## Features (V0.1 MVP)

- **Projects** — name, working directory, shell target (native shell or WSL distro)
- **Terminal sessions** — spawn `claude` (or other provider CLIs) in an embedded PTY
  rendered by xterm.js
- **File panel** — browse the project's `cwd`, preview Markdown/JSON/images, quick
  edit with save, diff vs git `HEAD`, open in external editor

Out of scope for V0.1 — coming in later releases: JacqCloud bus integration,
multi-provider picker, plugin SDK (Extism), auto-update, code signing.

## Try Jacqline on Windows (no setup)

Want to try the app without installing a Rust/Bun toolchain?

1. Open the [Actions tab](https://github.com/OkaySire/jacqline/actions/workflows/build-windows.yml) on GitHub.
2. Click the most recent **Build Windows MSI** run on `main`.
3. Scroll to **Artifacts** and download `jacqline-windows-msi-<sha>`.
4. Unzip and double-click the `.msi`.

> The installer is **unsigned** in pre-V0.1, so Windows SmartScreen will show a
> warning on first run — click _More info_ → _Run anyway_. Code signing lands
> at Phase 8 (release CI).

## Stack

- **Tauri 2** (Rust shell) + **React 19 + TypeScript + Vite** (renderer)
- **xterm.js** + `portable-pty` for terminal sessions
- **CodeMirror 6** for preview / quick edit / diff
- **Tailwind v4** + **shadcn/ui** for styling
- **SQLite** via `tauri-plugin-sql` for local persistence

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

### Lint / format / type-check

```bash
bun run lint        # ESLint
bun run fmt         # Prettier --write
bun run fmt:check   # Prettier --check
bunx tsc --noEmit   # TypeScript type-check
cd src-tauri && cargo fmt && cargo clippy
```

### Production build

```bash
bun run tauri build
```

Artifacts land in `src-tauri/target/release/bundle/`.

## Project layout

```
.
├── docs/                      Architecture, MVP plan, design mockup
├── src/                       React renderer (TS)
│   ├── lib/                   utils (cn, etc.)
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css              Tailwind v4 entry + theme
├── src-tauri/                 Rust shell
│   ├── src/                   lib.rs, main.rs, eventually pty_manager / fs / etc.
│   ├── capabilities/          Tauri allowlist (strict by default)
│   ├── Cargo.toml
│   └── tauri.conf.json
├── tasks/                     Local task tracking (todo.md, lessons.md)
├── components.json            shadcn/ui config
├── eslint.config.js
└── .prettierrc.json
```

## Contributing

V0.1 is being built in lockstep on the
[Jacquouille agent bus](https://github.com/OkaySire/jacquouille). External
contributions welcome once we hit V0.2 — meanwhile feel free to file issues with
ideas, bugs, or design feedback.

## License

[Apache 2.0](./LICENSE) — see [`NOTICE`](./NOTICE) for attribution.
