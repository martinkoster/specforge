# SPDX-License-Identifier: Apache-2.0
# start.ps1 - Build and start SpecForge (desktop app) from the source code.
#
# Usage (from the project folder):
#   powershell -ExecutionPolicy Bypass -File scripts\start.ps1            # normal start, your own profile
#   powershell -ExecutionPolicy Bypass -File scripts\start.ps1 -Demo      # scripted test agent, throwaway profile
#   powershell -ExecutionPolicy Bypass -File scripts\start.ps1 -Fresh     # throwaway profile, starts with the setup wizard
#   powershell -ExecutionPolicy Bypass -File scripts\start.ps1 -Packaged  # build and start the packaged app (like the installer)
#   Add -SkipBuild to start the last build without rebuilding.
#
# Stop the app by closing its window (or press Ctrl+C in this window).

param(
  [switch]$Demo,      # Use the scripted test agent: runs work without Claude Code and without API credit.
  [switch]$Fresh,     # Start with an empty throwaway profile (the setup wizard appears again).
  [switch]$Packaged,  # Run the packaged app from release\ instead of the development build.
  [switch]$SkipBuild  # Do not rebuild; start what was built last time.
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Fail([string]$message) {
  Write-Host ""
  Write-Host "ERROR: $message" -ForegroundColor Red
  exit 1
}

function Step([string]$message) {
  Write-Host ""
  Write-Host "==> $message" -ForegroundColor Cyan
}

# --- Prerequisites check ---------------------------------------------------------------------------
Step 'Checking prerequisites'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Fail 'Node.js is not installed. Install Node.js 24 or newer from https://nodejs.org and open a new PowerShell window.'
}
$nodeMajor = [int]((node -v).TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 24) {
  Fail "Node.js $(node -v) is too old. Install Node.js 24 or newer from https://nodejs.org."
}
Write-Host "Node.js $(node -v)"

if (-not (Get-Command corepack -ErrorAction SilentlyContinue)) {
  Fail 'corepack was not found (it ships with Node.js). Reinstall Node.js 24 from https://nodejs.org.'
}

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Fail 'Git is not installed. SpecForge needs Git 2.30 or newer: https://git-scm.com/downloads'
}
Write-Host (git --version)

# --- Install dependencies (only when needed) -------------------------------------------------------
$needInstall = -not (Test-Path 'node_modules')
if (-not $needInstall -and (Test-Path 'node_modules\.modules.yaml')) {
  $needInstall = (Get-Item 'pnpm-lock.yaml').LastWriteTime -gt (Get-Item 'node_modules\.modules.yaml').LastWriteTime
}
if ($needInstall) {
  Step 'Installing dependencies (first time takes a few minutes)'
  corepack pnpm install
  if ($LASTEXITCODE -ne 0) { Fail 'Installing the dependencies failed (see the messages above).' }
}

# --- Build -----------------------------------------------------------------------------------------
if ($Packaged) {
  $exe = Join-Path $Root 'release\win-unpacked\SpecForge.exe'
  if (-not $SkipBuild) {
    Step 'Building the packaged app (release\win-unpacked)'
    corepack pnpm package -- --dir
    if ($LASTEXITCODE -ne 0) { Fail 'Packaging failed (see the messages above).' }
  }
  if (-not (Test-Path $exe)) { Fail "No packaged app at $exe. Run again without -SkipBuild." }
} else {
  if (-not $SkipBuild) {
    Step 'Building SpecForge'
    corepack pnpm build
    if ($LASTEXITCODE -ne 0) { Fail 'The build failed (see the messages above).' }
  }
  if (-not (Test-Path 'packages\main\dist\main.js')) { Fail 'No build found. Run again without -SkipBuild.' }
}

# --- Environment variables (only for this start) ---------------------------------------------------
# SPECFORGE_TEST=1        test mode: allows a separate profile folder (and enables test-only commands)
# SPECFORGE_USER_DATA     profile folder used in test mode (settings, database, stored provider secret)
# SPECFORGE_MOCK_AGENT=1  scripted test agent instead of Claude Code (test mode only)
$profileDir = Join-Path $env:TEMP 'specforge-try'
$saved = @{}
foreach ($name in 'SPECFORGE_TEST', 'SPECFORGE_USER_DATA', 'SPECFORGE_MOCK_AGENT') {
  $saved[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
  [Environment]::SetEnvironmentVariable($name, $null, 'Process')
}

if ($Demo -or $Fresh) {
  if ($Fresh -and (Test-Path $profileDir)) {
    Remove-Item -Recurse -Force $profileDir
  }
  $env:SPECFORGE_TEST = '1'
  $env:SPECFORGE_USER_DATA = $profileDir
  if ($Demo) { $env:SPECFORGE_MOCK_AGENT = '1' }
}

# --- Start -----------------------------------------------------------------------------------------
Step 'Starting SpecForge'
if ($Demo) { Write-Host 'Demo mode: runs use the scripted test agent (no Claude Code, no API credit).' -ForegroundColor Yellow }
if ($Demo -or $Fresh) { Write-Host "Profile folder: $profileDir" }
Write-Host 'The SpecForge window opens in a moment. Close it to stop the app.'

try {
  if ($Packaged) {
    & $exe
  } else {
    corepack pnpm --filter @specforge/main exec electron dist/main.js
  }
} finally {
  foreach ($name in $saved.Keys) { [Environment]::SetEnvironmentVariable($name, $saved[$name], 'Process') }
}
