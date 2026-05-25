#Requires -Version 5.1
<#
.SYNOPSIS
    One-shot Windows setup for Jacqline development.

.DESCRIPTION
    Detects which prerequisites are already installed (git, Rust, Bun, MSVC
    build tools, WebView2), installs the missing ones via `winget`, refreshes
    PATH in the current shell, runs `bun install`, and optionally launches
    `bun run tauri dev`.

    Idempotent: re-running this on an already-set-up machine just prints a
    summary and exits cleanly.

.PARAMETER NoRun
    Skip the final prompt to launch the dev server.

.EXAMPLE
    .\scripts\setup-windows.ps1
    Run interactively from a normal PowerShell prompt.

.EXAMPLE
    .\scripts\setup-windows.ps1 -NoRun
    Install dependencies but don't launch the app.

.NOTES
    First run may need `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`
    once. The MSVC Build Tools install typically requires admin elevation —
    the script will warn and offer a manual link if winget can't proceed.
#>
[CmdletBinding()]
param(
    [switch]$NoRun
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# ----------------------------------------------------------------------- logging

function Write-Step([string]$Message) { Write-Host "→ $Message" -ForegroundColor Yellow }
function Write-OK([string]$Message)   { Write-Host "✓ $Message" -ForegroundColor Green }
function Write-Fail([string]$Message) { Write-Host "✗ $Message" -ForegroundColor Red }
function Write-Info([string]$Message) { Write-Host "  $Message" -ForegroundColor DarkGray }

# ----------------------------------------------------------------------- probes

function Test-Command([string]$Name) {
    return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Test-WebView2 {
    # WebView2 Runtime registry key (both 64-bit and 32-bit hives).
    $keys = @(
        'HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}',
        'HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}',
        'HKCU:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}'
    )
    foreach ($key in $keys) {
        if (Test-Path $key) { return $true }
    }
    return $false
}

function Test-MsvcBuildTools {
    if (Test-Command 'cl.exe') { return $true }
    $vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
    if (Test-Path $vswhere) {
        $path = & $vswhere -latest -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>$null
        return -not [string]::IsNullOrWhiteSpace($path)
    }
    return $false
}

function Update-CurrentPath {
    # Pull the latest System + User PATH from the registry into this shell so
    # newly installed tools become visible without restarting PowerShell.
    $machine = [System.Environment]::GetEnvironmentVariable('Path', 'Machine')
    $user    = [System.Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = "$machine;$user"
}

function Install-WingetPackage {
    param(
        [Parameter(Mandatory)] [string]$Id,
        [string]$OverrideArgs = $null
    )
    Write-Step "Installing $Id via winget…"
    $wingetArgs = @(
        'install', '--id', $Id, '-e',
        '--accept-source-agreements',
        '--accept-package-agreements',
        '--disable-interactivity'
    )
    if ($OverrideArgs) {
        $wingetArgs += @('--override', $OverrideArgs)
    }
    & winget @wingetArgs
    $exit = $LASTEXITCODE
    if ($exit -ne 0) {
        Write-Fail "winget install $Id exited with $exit"
        return $false
    }
    Update-CurrentPath
    return $true
}

# ----------------------------------------------------------------------- main

Write-Host ""
Write-Host "Jacqline — Windows setup" -ForegroundColor Cyan
Write-Host "========================" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Command 'winget')) {
    Write-Fail "winget not found."
    Write-Info "Install 'App Installer' from the Microsoft Store, then re-run this script."
    exit 1
}

# --- git ---------------------------------------------------------------------
if (Test-Command 'git') {
    Write-OK "git: $((& git --version) -replace '^git version ','')"
} else {
    [void](Install-WingetPackage -Id 'Git.Git')
}

# --- rust --------------------------------------------------------------------
$hasRust = (Test-Command 'rustup') -and (Test-Command 'cargo')
if ($hasRust) {
    Write-OK "rust: $((& rustc --version))"
} else {
    if (Install-WingetPackage -Id 'Rustlang.Rustup') {
        & rustup default stable | Out-Null
        Write-OK "rust toolchain set to stable"
    }
}

# --- bun ---------------------------------------------------------------------
if (Test-Command 'bun') {
    Write-OK "bun: $((& bun --version))"
} else {
    [void](Install-WingetPackage -Id 'Oven-sh.Bun')
}

# --- WebView2 ----------------------------------------------------------------
if (Test-WebView2) {
    Write-OK "WebView2 Runtime detected"
} else {
    [void](Install-WingetPackage -Id 'Microsoft.EdgeWebView2Runtime')
}

# --- MSVC Build Tools (large; may require elevation) -------------------------
if (Test-MsvcBuildTools) {
    Write-OK "MSVC Build Tools detected"
} else {
    Write-Info "MSVC Build Tools is a multi-GB download and typically requires admin."
    $overrideArgs = '--quiet --wait --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended'
    $ok = Install-WingetPackage -Id 'Microsoft.VisualStudio.2022.BuildTools' -OverrideArgs $overrideArgs
    if (-not $ok) {
        Write-Fail "MSVC Build Tools install failed (admin required?). Install manually:"
        Write-Info "  https://visualstudio.microsoft.com/visual-cpp-build-tools/"
        Write-Info "  Then re-run this script to finish setup."
        exit 1
    }
}

# --- project deps ------------------------------------------------------------
$projectRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Write-Step "Installing JS dependencies (bun install) in $projectRoot…"
Push-Location $projectRoot
try {
    & bun install
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "bun install exited with $LASTEXITCODE"
        exit 1
    }
    Write-OK "JS dependencies installed"
} finally {
    Pop-Location
}

Write-Host ""
Write-OK "Setup complete."
Write-Host ""

if ($NoRun) {
    Write-Info "Skipping auto-launch (-NoRun)."
    Write-Info "When ready: bun run tauri dev"
    exit 0
}

$response = Read-Host "Launch the app now with 'bun run tauri dev'? [Y/n]"
if ($response -eq '' -or $response -match '^[Yy]') {
    Push-Location $projectRoot
    try {
        & bun run tauri dev
    } finally {
        Pop-Location
    }
} else {
    Write-Info "When ready: bun run tauri dev"
}
