# Third-party licenses

Jacqline (Apache-2.0) ships pre-compiled artifacts from the following
upstream projects. Each is distributed under its own license, in addition
to (not in place of) Jacqline's main license.

## microsoft/terminal — ConPTY runtime

- **Files**: `src-tauri/binaries/conpty/x64/{conpty.dll, OpenConsole.exe}`
- **Bundled at**: `<install>/resources/conpty/`
- **Upstream**: <https://github.com/microsoft/terminal>
- **Version**: see `src-tauri/binaries/conpty/x64/VERSION`
- **License**: MIT (`src-tauri/binaries/conpty/x64/LICENSE` — shipped verbatim from upstream)
- **Why bundled**: Jacqline preloads this newer ConPTY at startup so the
  stale system ConPTY (the one that hangs interactive PTYs over WSL —
  [microsoft/WSL#11465](https://github.com/microsoft/WSL/issues/11465))
  is never reached. WezTerm and Alacritty use the same workaround.
- **Tampering check**: SHA-256 of each binary is committed in
  `src-tauri/binaries/conpty/x64/checksums.txt`.
