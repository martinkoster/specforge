---
id: US-022
title: Application shell and primary navigation
status: done
size: S
epic: Projects & workspace
---

## Business Value
Provides the consistent frame of the app with navigation, run indicator and pending-decision counter (FR-054).

## Description
As a **SpecForge user**, I want **a clear navigation with status indicators visible everywhere** so that **I always know where I am and what needs my attention**.

## Acceptance Criteria
- [x] AC-1: Left navigation: Dashboard, Projects, Intent, Specifications, Kanban (disabled until stories exist), Executions, Settings.
- [x] AC-2: Top bar shows project switcher, git/non-git badge, run indicator ("2 running · 1 queued") and pending-decisions counter.
- [x] AC-3: All areas are reachable by keyboard and one click.

## Technical Notes
- Related design document: `spec/03_design/functional_design/user_flows.md` — uf-00-application-shell-always-visible
- Related requirements: FR-054, FR-088, NFR-020
- Release: R1

## Dependencies
- US-006 Implement typed, validated IPC contract

## Implementation Details
Files created / modified:
- `packages/ui/src/shell/AppShell.tsx` — primary navigation (7 areas, Kanban disabled with reason until stories exist, `aria-current`), top bar (project switcher, Git/no-Git badge, run indicator, pending-decisions button, core status), Ctrl+1…7 shortcuts with `aria-keyshortcuts`
- `packages/ui/src/core/core-session.ts` — `CoreSession` (contract handshake via `connectClient`, survives core restarts, status listeners)
- `packages/ui/src/App.tsx`, `src/main.tsx`, `index.html`, `vite.config.ts`, `src/styles.css` — React 19 renderer built with Vite 8 (relative base, `crossorigin` stripped for `file://`); test-mode diagnostics (ping / crash) for the e2e test
- `packages/core/src/handlers/system-handlers.ts` — `system.ping`, `system.info`, `system.crash` (test mode only), `shell.state`; `packages/core/src/main.ts` now serves the IPC contract
- `packages/ipc-contract/src/contract.ts` / `protocol.ts` — `system.crash`, `shell.state`; handlers may throw `IpcError` to report their own error code
- `packages/main/src/main.ts` loads `packages/ui/dist/app/index.html`; removed the ad-hoc `core-handler.ts`, `core-connection.ts`, `renderer.ts`, `static/index.html`
- Build/test tooling: root `build` runs `vite build packages/ui`; `vitest.setup.ts` (jest-dom matchers); UI tests use happy-dom; Electron e2e moved to `shell.e2e.test.ts` with its own sequential run `pnpm test:e2e` (`vitest.e2e.config.ts`, CI step under xvfb on Linux)

Decisions / deviations:
- `shell.state` returned empty defaults at first; since US-018/US-019 (2026-10-15) the core opens the database and reports the open project, VCS mode, story and run counts. (Correction: better-sqlite3 13 ships N-API prebuilds that load unchanged in Electron — no ABI rebuild is needed, as assumed earlier.)
- jsdom replaced by happy-dom: jsdom took ~16 s per file to start and exceeded Vitest's fixed 60 s worker-start timeout in the full parallel run.

## Test Coverage
- Coverage: `AppShell.tsx` 100.0 % lines, `core-session.ts` 100.0 %, `App.tsx` 88.6 %, `system-handlers.ts` 100.0 % (workspace total 98.2 % lines)
- Test files: `packages/ui/test/app-shell.test.tsx` (11), `packages/ui/test/core-session.test.ts` (4), `packages/ui/test/app.test.tsx` (4, shared with US-017), `packages/core/test/system-handlers.test.ts` (3), `packages/main/test/shell.e2e.test.ts` (3, Electron e2e)
- 25 tests
