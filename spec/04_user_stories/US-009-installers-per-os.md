---
id: US-009
title: Build unsigned installers for all three OSes
status: in progress
size: M
epic: Foundation & spikes
---

## Business Value
Makes SpecForge installable as a desktop application (FR-058) and verifies the packaging pipeline early.

## Description
As a **SpecForge user**, I want **to install SpecForge with a native installer on my OS** so that **I can run it like any desktop application**.

## Acceptance Criteria
- [ ] AC-1: electron-builder produces a per-user NSIS installer (Windows), dmg (macOS) and AppImage + deb (Linux) in CI. _(CI steps added; first CI run pending — not pushed yet. Locally on Windows the unpacked app builds; the NSIS step is blocked on this machine because the 7-Zip electron-builder downloads to %LOCALAPPDATA% cannot start (AppLocker policy))_
- [x] AC-2: Installers include `LICENSE`, `NOTICE` and a generated `THIRD_PARTY_NOTICES`. _(verified in the Windows package 2026-10-21)_
- [x] AC-3: The Agent SDK's optional bundled Claude Code binary is excluded from the package. _(verified in the Windows package 2026-10-21; the packaging step fails if one is found)_
- [ ] AC-4: On a clean VM per OS the installed app launches to the setup wizard (or empty shell until US-012 exists). _(packaged-app smoke test with a fresh profile passes on Windows 2026-10-21; CI on macOS/Linux and the manual clean-VM check per OS are open)_

## Technical Notes
- Related design document: spec/03_design/technical_design/technical_decisions.md §6–7
- Related requirements: FR-058, NFR-026, CON-015
- Code signing is handled separately in US-067.
- Release: R1

## Dependencies
- US-005 Create hardened Electron shell with three-process layout
- US-008 Set up CI pipeline on Windows, macOS and Linux

## Implementation Details
Files created / modified:
- `tooling/src/cli/package-app.ts` — `pnpm package` (`--dir`: unpacked app only): bundles `packages/main/dist/main.js` and `packages/core/dist/main.js` with esbuild (ESM, `createRequire` banner), stages them with `preload.cjs`, the renderer (`ui/`) and the two external modules in `build/stage`, generates `THIRD_PARTY_NOTICES` (fails if a bundled package has no entry), runs electron-builder with the staged folder as project directory, flips the US-005 fuses in `afterPack` and finally fails if a Claude Code binary package or Electron's default app is in the package
- `tooling/src/packaging/builder-config.ts` — electron-builder configuration: NSIS per-user without elevation (oneClick off, LICENSE page), dmg (unsigned, `identity: null`), AppImage + deb; asar with `better-sqlite3` unpacked; no npm rebuild; `LICENSE`, `NOTICE`, `THIRD_PARTY_NOTICES` as resources; locates the packed / unpacked executables
- `tooling/src/packaging/stage.ts` — staged files per external module (better-sqlite3: `lib/` + the prebuild of the target platform; Agent SDK without nested `node_modules`), staged `package.json`, bundled package names from esbuild metafiles, scan for Claude Code binary packages
- `tooling/src/packaging/notices.ts` — THIRD_PARTY_NOTICES from `pnpm -r licenses list --prod --json` (with license texts; workspace packages excluded; the Agent SDK marked proprietary, not Apache-2.0)
- `tooling/src/licenses.ts` — keeps package paths; SDK note updated (D23); `tooling/src/cli/pnpm.ts` — shared pnpm runner (also used by `check-licenses.ts`)
- `packages/main/src/app-paths.ts`, `main.ts` — preload / core / page paths for the workspace and the packaged layout (`app.isPackaged`)
- `packages/main/test/packaged.smoke.test.ts`, `vitest.packaged.config.ts`, `pnpm test:packaged` — starts the unpacked app with a fresh per-user profile and checks the setup wizard over the DevTools protocol (the fuses disable the Node inspector Playwright's Electron launcher needs)
- `.github/workflows/ci.yml` — build job: package, packaged smoke test (xvfb on Linux), installers uploaded as `installers-<os>` artifacts (14 days); job timeout 45 min
- `tooling/package.json` (electron-builder, esbuild, @electron/asar, @electron/fuses, playwright-core), `pnpm-workspace.yaml` (electron-winstaller build script not allowed), `package.json` scripts, `vitest.config.ts` (smoke tests excluded), `eslint.config.js` (`build/`, `release/` ignored)

Decisions / deviations:
- Product-owner decision D23 (2026-10-21): the Agent SDK's JavaScript is bundled; legal confirmation of Anthropic's terms before any public release (recorded in intent §13, CON-015, technical_decisions §7).
- The staged app is a standalone npm project (`packageManager: npm`, the two external modules as dependencies): electron-builder's pnpm collector cannot read a folder inside the pnpm workspace, and electron-builder only packs `node_modules` its collector reports.
- Version comes from the root `package.json` (currently 0.0.0); no application icon yet (Electron default).
- Unsigned (US-067). `--dir` lets developers build the unpacked app where installer tools cannot run.

## Test Coverage
- New / changed modules (`tooling/src/packaging/**`, `tooling/src/licenses.ts`, `packages/main/src/app-paths.ts`): 97.9 % statements, 92.1 % branches, 98.7 % lines; the CLI (`tooling/src/cli/**`) is excluded from coverage like the other CLIs and verified by running it
- `tooling/test/packaging.test.ts` (17), `packages/main/test/app-paths.test.ts` (2), `packages/main/test/packaged.smoke.test.ts` (1, `pnpm test:packaged`, after `pnpm package`)
- Full suite: 981 passed; 3 failed only under load and pass in isolation (`approve-reject-ipc.test.ts` ×2, `watcher.test.ts` — still timing-sensitive)
