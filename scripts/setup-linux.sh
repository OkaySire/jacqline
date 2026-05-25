#!/usr/bin/env bash
# One-shot Linux / WSL setup for Jacqline development.
#
# Installs the Tauri 2 system dependencies (webkit2gtk-4.1 + co) on Debian /
# Ubuntu / WSL, then `bun install` and optionally launches `bun run tauri dev`.
#
# Other distros (Fedora, Arch…) get a hint with the package names to install
# manually — patches welcome.

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
        *)
            fail "unknown argument: $arg"; exit 2 ;;
    esac
done

# ----------------------------------------------------------------------- distro
echo
echo "Jacqline — Linux / WSL setup"
echo "============================"
echo

if [ ! -f /etc/os-release ]; then
    fail "/etc/os-release not found — cannot detect distro."
    exit 1
fi
# shellcheck disable=SC1091
. /etc/os-release
DISTRO_FAMILY="${ID_LIKE:-$ID}"

# ----------------------------------------------------------------------- system deps
TAURI_APT_DEPS=(
    libwebkit2gtk-4.1-dev
    libssl-dev
    libayatana-appindicator3-dev
    librsvg2-dev
    libxdo-dev
    pkg-config
    build-essential
    curl
    wget
    file
)

if [[ "$DISTRO_FAMILY" == *debian* ]] || [[ "$ID" == "ubuntu" ]] || [[ "$ID" == "debian" ]]; then
    step "Installing Tauri system dependencies via apt…"
    sudo apt-get update
    sudo apt-get install -y "${TAURI_APT_DEPS[@]}"
    ok "Tauri system dependencies installed"
else
    fail "Automatic install only supports Debian/Ubuntu/WSL today (ID=$ID)."
    info "Install the equivalents of these manually:"
    for pkg in "${TAURI_APT_DEPS[@]}"; do info "  - $pkg"; done
    exit 1
fi

# ----------------------------------------------------------------------- toolchain
if ! command -v rustup >/dev/null 2>&1; then
    step "Installing Rust toolchain via rustup…"
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
    # shellcheck disable=SC1091
    . "$HOME/.cargo/env"
    ok "Rust installed: $(rustc --version)"
else
    ok "rust: $(rustc --version)"
fi

if ! command -v bun >/dev/null 2>&1; then
    step "Installing Bun…"
    curl -fsSL https://bun.sh/install | bash
    export PATH="$HOME/.bun/bin:$PATH"
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
