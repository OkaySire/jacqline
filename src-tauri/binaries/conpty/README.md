# Bundled ConPTY

Pinned copy of Microsoft's ConPTY runtime, shipped alongside `Jacqline.exe`
to avoid the stale system ConPTY's WSL interactive-PTY hang
([microsoft/WSL#11465](https://github.com/microsoft/WSL/issues/11465)).

WezTerm + Alacritty use the same workaround for the same reason.

## Files (x64)

| File              | Purpose                                                       |
| ----------------- | ------------------------------------------------------------- |
| `conpty.dll`      | Client-side ConPTY runtime — preloaded by Jacqline at startup |
| `OpenConsole.exe` | Console host that ConPTY spawns to drive the PTY              |
| `VERSION`         | Pinned upstream version                                       |
| `checksums.txt`   | SHA-256 of the two binaries (sha256sum-compatible)            |
| `LICENSE`         | MIT, verbatim from microsoft/terminal                         |

## Current pin

**`v1.24.11321.0`** — released 2026-05-13. See
<https://github.com/microsoft/terminal/releases/tag/v1.24.11321.0>.

Binaries extracted from `Microsoft.Windows.Console.ConPTY.1.24.260512001.nupkg`,
asset of that release.

## Bumping

```bash
# 1. Pick a new release from microsoft/terminal.
gh release download <new-tag> -R microsoft/terminal \
  --pattern 'Microsoft.Windows.Console.ConPTY.*.nupkg' \
  -O /tmp/conpty.nupkg

# 2. Extract the x64 binaries.
mkdir -p /tmp/conpty && cd /tmp/conpty
unzip -j /tmp/conpty.nupkg \
  'runtimes/win-x64/native/conpty.dll' \
  'build/native/runtimes/x64/OpenConsole.exe'

# 3. Update files in src-tauri/binaries/conpty/x64/.
cp conpty.dll OpenConsole.exe <repo>/src-tauri/binaries/conpty/x64/
sha256sum conpty.dll OpenConsole.exe \
  > <repo>/src-tauri/binaries/conpty/x64/checksums.txt
echo '<new-tag>' > <repo>/src-tauri/binaries/conpty/x64/VERSION

# 4. Refresh LICENSE if the upstream license file changed.
curl -sSL -o <repo>/src-tauri/binaries/conpty/x64/LICENSE \
  https://raw.githubusercontent.com/microsoft/terminal/<new-tag>/LICENSE
```

The CI pre-build step in `.github/workflows/build-windows.yml` copies these
files next to `Jacqline.exe` before `tauri build` packages the MSI.
