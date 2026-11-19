#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# start.sh - Build and start SpecForge (desktop app) from the source code on macOS or Linux.
#
# Usage (from the project folder):
#   ./scripts/start.sh             # normal start, your own profile
#   ./scripts/start.sh --demo      # scripted test agent, throwaway profile
#   ./scripts/start.sh --fresh     # throwaway profile, starts with the setup wizard
#   ./scripts/start.sh --skip-build
# (First time: chmod +x scripts/start.sh)
#
# Stop the app by closing its window (or press Ctrl+C in this terminal).

set -euo pipefail
cd "$(dirname "$0")/.."

DEMO=0; FRESH=0; SKIP_BUILD=0
for arg in "$@"; do
  case "$arg" in
    --demo) DEMO=1 ;;
    --fresh) FRESH=1 ;;
    --skip-build) SKIP_BUILD=1 ;;
    -h|--help) sed -n '3,12p' "$0"; exit 0 ;;
    *) echo "Unknown option: $arg (try --help)"; exit 1 ;;
  esac
done

fail() { echo; echo "ERROR: $1" >&2; exit 1; }
step() { echo; echo "==> $1"; }

# --- Prerequisites check ---
step "Checking prerequisites"
command -v node >/dev/null || fail "Node.js is not installed. Install Node.js 24 or newer from https://nodejs.org."
NODE_MAJOR="$(node -v | sed 's/^v//; s/\..*//')"
[ "$NODE_MAJOR" -ge 24 ] || fail "Node.js $(node -v) is too old. Install Node.js 24 or newer from https://nodejs.org."
echo "Node.js $(node -v)"
command -v corepack >/dev/null || fail "corepack was not found (it ships with Node.js). Reinstall Node.js 24."
command -v git >/dev/null || fail "Git is not installed. SpecForge needs Git 2.30 or newer: https://git-scm.com/downloads"
git --version

# --- Install dependencies (only when needed) ---
if [ ! -d node_modules ] || [ pnpm-lock.yaml -nt node_modules/.modules.yaml ]; then
  step "Installing dependencies (first time takes a few minutes)"
  corepack pnpm install
fi

# --- Build ---
if [ "$SKIP_BUILD" -eq 0 ]; then
  step "Building SpecForge"
  corepack pnpm build
fi
[ -f packages/main/dist/main.js ] || fail "No build found. Run again without --skip-build."

# --- Environment variables (only for this start) ---
# SPECFORGE_TEST=1        test mode: allows a separate profile folder (and enables test-only commands)
# SPECFORGE_USER_DATA     profile folder used in test mode
# SPECFORGE_MOCK_AGENT=1  scripted test agent instead of Claude Code (test mode only)
unset SPECFORGE_TEST SPECFORGE_USER_DATA SPECFORGE_MOCK_AGENT
PROFILE_DIR="${TMPDIR:-/tmp}/specforge-try"
if [ "$DEMO" -eq 1 ] || [ "$FRESH" -eq 1 ]; then
  [ "$FRESH" -eq 1 ] && rm -rf "$PROFILE_DIR"
  export SPECFORGE_TEST=1 SPECFORGE_USER_DATA="$PROFILE_DIR"
  [ "$DEMO" -eq 1 ] && export SPECFORGE_MOCK_AGENT=1
  echo "Profile folder: $PROFILE_DIR"
fi

# --- Start ---
step "Starting SpecForge"
[ "$DEMO" -eq 1 ] && echo "Demo mode: runs use the scripted test agent (no Claude Code, no API credit)."
echo "The SpecForge window opens in a moment. Close it to stop the app."

ARGS=(dist/main.js)
# Linux without a display (e.g. over SSH): start with  xvfb-run -a ./scripts/start.sh
exec corepack pnpm --filter @specforge/main exec electron "${ARGS[@]}"
