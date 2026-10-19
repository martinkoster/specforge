---
id: US-005
title: Create hardened Electron shell with three-process layout
status: done
size: M
epic: Foundation & spikes
---

## Business Value
Provides the runtime skeleton (renderer, main, core utilityProcess) that keeps the UI responsive while agents run (ADR-002) and meets Electron security hardening.

## Description
As a **SpecForge user**, I want **a desktop window whose UI stays responsive and secure while background work runs** so that **long-running agent tasks never freeze the application**.

## Acceptance Criteria
- [x] AC-1: App starts a sandboxed renderer (contextIsolation, no nodeIntegration, strict CSP, navigation and window.open blocked), a main process and a core `utilityProcess`.
- [x] AC-2: Renderer and core exchange a ping/pong over a MessagePort brokered by main.
- [x] AC-3: If the core process crashes, main restarts it and the UI shows "reconnecting" and recovers without restarting the window.
- [x] AC-4: Electron fuses disable RunAsNode and enable ASAR integrity in packaged builds.

## Technical Notes
- Related design document: `spec/03_design/technical_design/c4_architecture.md` — ADR-002
- Related design document: spec/03_design/technical_design/technical_decisions.md §4
- Related requirements: FR-030, NFR-001, NFR-017
- Release: R1

## Dependencies
- US-004 Set up monorepo, tooling and layering rules

## Implementation Details
Files created / modified:
- `packages/main/src/security.ts` — secure webPreferences, CSP, navigation and window-open guards
- `packages/main/src/core-supervisor.ts` — forks the core, brokers a fresh MessagePort pair per (re)start, restarts after crashes (limit), status reporting
- `packages/main/src/fuses.ts` — fuse configuration (RunAsNode off, NODE_OPTIONS and inspect arguments off, cookie encryption, embedded ASAR integrity, only load app from ASAR) and `applyFuses()` for the packaging step
- `packages/main/src/main.ts` (Electron entry), `packages/main/src/preload.cts` (sandboxed CommonJS preload)
- `packages/core/src/core-handler.ts`, `packages/core/src/main.ts` (utilityProcess entry)
- `packages/ui/src/core-connection.ts`, `packages/ui/src/renderer.ts`, `packages/ui/static/index.html`
- tsconfig updates (DOM/Node types, `.cts`), `eslint.config.js` (CommonJS rules for `.cts`), `vitest.config.ts` (entry points excluded from unit coverage), `pnpm-workspace.yaml` (`allowBuilds` for electron)
- Dev dependencies: electron 44, @electron/fuses, playwright-core

Decisions:
- MessagePorts are transferred to the renderer via `window.postMessage` from the preload (ports cannot cross the context bridge).
- The UI is a minimal static page for now; React follows with the UI stories (US-022 ff.).
- The crash trigger is honoured by the core only with `SPECFORGE_TEST=1` and the button is visible only in test mode.
- Fuses are verified by flipping a copy of the Electron binary; applying them in packaged builds is wired into the packaging step (US-009).

## Test Coverage
- Coverage (unit, `packages/main/src`, `packages/core/src`, `packages/ui/src` without entry points): 100 % of security, supervisor, fuses, core handler and connection logic; entry points verified end-to-end
- Test files: `packages/main/test/security.test.ts`, `core-supervisor.test.ts`, `fuses.test.ts`, `e2e.test.ts` (Playwright for Electron, real app), `packages/core/test/core-handler.test.ts`, `packages/ui/test/core-connection.test.ts`
- 22 tests (19 unit, 3 end-to-end); end-to-end run ≈ 15 s on Windows
