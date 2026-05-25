#!/usr/bin/env bash
# One-shot macOS setup for Jacqline development.
#
# Installs Xcode CLT, Rust (via rustup), Bun, then `bun install` and optionally
# launches `bun run tauri dev`. Uses Homebrew if available, plain curl otherwise.

set -euo pipefail

# ----------------------------------------------------------------------- styling
if [ -t 1 ]; then
    YELLOW=$'\033[33m'; GREEN=$'\033[32m'; RED=$'\033[31m'; DIM=$'\033[2m'; RESET=$'\033[0m'
else
    YELLOW=""; GREEN=""; RED=""; DIM=""; RESET=""
fi
step() { printf '%s→ %s%s\n' "$YELLOW" "$*" "$RESET"; }
ok()   { printf '%s✓ %s%s\n' "$GREEN"  "$*" "$RESET"; }
fail() { printf '%s✗ %s%s\n' "$RED"    "$*" "$RESET" >&2; }
info() { printf '%s  %s%s\n' "$DIM"    "$*" "$RESET"; }

# ----------------------------------------------------------------------- args
NO_RUN=0
for arg in "$@"; do
    case "$arg" in
        --no-run|-n) NO_RUN=1 ;;
        --help|-h)
            cat <<USAGE
Usage: $0 [--no-run]

Options:
  --no-run, -n    Skip the final prompt to launch 'bun run tauri dev'.
USAGE
            exit 0
            ;;
        *) fail "unknown argument: $arg"; exit 2 ;;
    esac
done

echo
echo "Jacqline — macOS setup"
echo "======================"
echo

# ----------------------------------------------------------------------- Xcode CLT
if xcode-select -p >/dev/null 2>&1; then
    ok "Xcode Command Line Tools detected"
else
    step "Installing Xcode Command Line Tools (a system dialog will appear)…"
    xcode-select --install || true
    info "Re-run this script after the install completes."
    exit 0
fi

# ----------------------------------------------------------------------- Rust
if ! command -v rustup >/dev/null 2>&1; then
    step "Installing Rust via rustup…"
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
    # shellcheck disable=SC1091
    . "$HOME/.cargo/env"
    ok "Rust installed: $(rustc --version)"
else
    ok "rust: $(rustc --version)"
fi

# ----------------------------------------------------------------------- Bun
if ! command -v bun >/dev/null 2>&1; then
    if command -v brew >/dev/null 2>&1; then
        step "Installing Bun via Homebrew…"
        brew install oven-sh/bun/bun
    else
        step "Installing Bun via official installer…"
        curl -fsSL https://bun.sh/install | bash
        export PATH="$HOME/.bun/bin:$PATH"
    fi
    ok "Bun installed: $(bun --version)"
else
    ok "bun: $(bun --version)"
fi

# ----------------------------------------------------------------------- project deps
PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
step "Installing JS dependencies (bun install) in $PROJECT_ROOT…"
( cd "$PROJECT_ROOT" && bun install )
ok "JS dependencies installed"

echo
ok "Setup complete."
echo

if [ "$NO_RUN" -eq 1 ]; then
    info "Skipping auto-launch (--no-run)."
    info "When ready: bun run tauri dev"
    exit 0
fi

read -r -p "Launch the app now with 'bun run tauri dev'? [Y/n] " response
if [ -z "$response" ] || [[ "$response" =~ ^[Yy] ]]; then
    ( cd "$PROJECT_ROOT" && bun run tauri dev )
else
    info "When ready: bun run tauri dev"
fi
