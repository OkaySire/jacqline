# Jacqline — Leçons apprises

Patterns à suivre et erreurs à éviter — relire au début de chaque session et chaque nouvelle tâche.

## Setup / scaffold

- **`bun create tauri-app` ne scaffold pas dans un dossier non-vide** (par défaut il crée un sous-dossier). Solution : scaffold dans `/tmp/jacqline-scaffold` puis `cp -r --no-target-directory . <projet>/` — préserve `CLAUDE.md`, `docs/`, `tasks/`, `.jacq/` qui pré-existent.
- **WSL Ubuntu** : Tauri demande `libwebkit2gtk-4.1-dev` + co. Pas bloquant pour Phase 0 (scaffold/configs only), mais obligatoire avant `bun run tauri dev` / `cargo check`. Documenté dans `README.md` (prerequisites) et `tasks/todo.md` (Setup machine).
- **Vite ESM + path alias** : `__dirname` n'est pas défini en ESM strict (`"type": "module"`). Utiliser `fileURLToPath(new URL("./src", import.meta.url))` plutôt que `path.resolve(__dirname, …)`. Requiert `@types/node` en devDep + `"types": ["node"]` dans `tsconfig.node.json`.
- **ESLint flat config + recommendedTypeChecked** : exige `parserOptions.project` pointant vers `tsconfig.json` + `tsconfig.node.json`, sinon les fichiers de config root (`vite.config.ts`, `eslint.config.js`) ne sont pas type-aware.
- **Tauri scaffold async sans await** : le `defineConfig(async () => …)` du template viole `@typescript-eslint/require-await`. Retirer l'`async` si pas d'`await` dedans (réactivable à la demande).

## Conventions code

- **TypeScript** : pas de `var`, `const`/`let` typés explicites. `noUncheckedIndexedAccess` activé (force null check sur `arr[i]`).
- **Rust** : `edition = "2024"`, `anyhow::Result` pour les commands, `thiserror` pour les error enums, `tracing` (pas `println!`/`eprintln!`). Pas de `unwrap()` sur input externe — préférer `?` ou `anyhow::bail!`.
- **Tauri** : capabilities allowlist strict par défaut (`core:default` seulement). Tous les accès FS/PTY/bus/shell passent par des commandes Rust explicites scoped (refusent `..`, canonicalisent les paths).
- **Cross-platform** : jamais de code Linux-only ou Win-only sans abstraction. Tester en CI mac+win+linux dès le scaffold.
- **One concern par file** : modules Rust petits et focalisés, composants React idem.

## CI / cross-platform

- **`rustfmt` peut tourner localement même sans webkit2gtk** (il ne link pas). Toujours `cd src-tauri && cargo fmt --all --check` AVANT le commit, pas seulement `cargo check`. Sinon CI rouge sur Linux+Mac avec format diff.
- **Windows runners + `prettier --check endOfLine: "lf"`** = piège classique. `core.autocrlf=true` (défaut Windows) convertit LF→CRLF au checkout, prettier fail. **Fix** : `.gitattributes` à la racine avec `* text=auto eol=lf` + binary markers (`.png` / `.icns` / etc.). À mettre dans tout repo cross-platform dès le scaffold.
- **`concurrency.cancel-in-progress: true`** dans le workflow : un re-push annule le run précédent sur la même ref. Pratique pour ne pas saturer la queue GH Actions.

## Décisions design produit (figées)

- **Brand** = warm sombre (mockup standalone). Palette `#0a0a0a` / `#1f1d1c` / `#181614` / accent purple `#7c3aed`. Pas zinc JacqCloud strict.
- **Icon** = nouveau mark Jacqline (carré purple `#7c3aed` 48px radius 12px + check blanc). Pas wordmark JacqCloud.
- **Terminal** = auto-spawn au switch projet (style VSCode workspace). Pas de bouton "Start session" explicite.

## Workflow agent

- **Toujours** : `get_context()` + lire `tasks/lessons.md` (ce fichier) + `tasks/todo.md` au démarrage. Pas besoin de poller — les messages bus arrivent via `<channel>`.
- **Avant marquer une tâche complete** : prouver que ça fonctionne (lint, fmt, type-check, ou rendu visuel). Ne jamais reporter sur la base de "le code a l'air OK".
- **Avant push** : attendre confirmation de l'orchestrator que `OkaySire/jacqline` existe.
- **Confirmer ce qu'on suppose** : décisions design (brand variation, icon, auto-spawn) restent en attente — implémenter avec un placeholder marqué dans le code + dans `todo.md`, pas figer arbitrairement.
