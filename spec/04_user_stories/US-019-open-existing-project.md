---
id: US-019
title: Open an existing project and detect VCS mode
status: done
size: S
epic: Projects & workspace
---

## Business Value
Allows reopening projects, including cloned repositories, with full state (FR-077, FR-002, FR-004).

## Description
As a **SpecForge user**, I want **to open a folder containing SpecForge metadata** so that **I can continue where I or my team left off**.

## Acceptance Criteria
- [x] AC-1: Selecting a folder with `.specforge/project.yaml` registers (if needed) and opens it; without metadata an explanation is shown.
- [x] AC-2: Git/non-git mode is detected on every open and shown as a badge; non-git mode shows the isolation warning.
- [x] AC-3: Reopening after restart restores artifacts, board state and run history.

## Technical Notes
- Related design document: `spec/03_design/functional_design/use_cases.md` — UC-002
- Related design document: `spec/03_design/functional_design/use_cases.md` — UC-029
- Related requirements: FR-002, FR-004, FR-077
- Release: R1

## Dependencies
- US-017 Start wizard with project registry and recent projects
- US-020 Parse workspace artifacts into the index

## Implementation Details
Files created / modified:
- `packages/application/src/projects/project-service.ts` — `ProjectService.open(path)` / `openById(id)`: reads `.specforge/project.yaml`, registers unregistered folders (e.g. clones) under the descriptor id, relocates moved projects, re-detects the VCS mode on every open, indexes and records the open; ports `ProjectWorkspace`, `VcsPort`, `ProjectStore`
- `packages/domain/src/execution/run-isolation.ts` — `NON_GIT_PROJECT_WARNING`
- `packages/adapters/git/src/vcs.ts` — `GitVcs` (availability, `rev-parse --is-inside-work-tree`, current branch via `symbolic-ref`)
- `packages/adapters/workspace-fs/src/project-folders.ts` — `readDescriptor`; `packages/adapters/sqlite/src/repositories.ts` — `findByPath`, `updateVcs`
- `packages/ipc-contract/src/contract.ts` — `projects.open`, `projects.openById`, `projects.close`; `shell.state` now reports the open project, VCS badge, story count and run counts
- Shared infrastructure of this wave: core composition root `packages/core/src/composition.ts` (opens the SQLite database in the app-data directory — better-sqlite3 13 ships N-API prebuilds that load unchanged in Electron — reopens the last project at startup and wires all handlers), per-project workspace context `packages/core/src/project-context.ts` (files, indexer, file watcher + reconciler of US-021), core "ready" handshake in `packages/main/src/core-supervisor.ts` (the renderer gets its port only once the core has started)
- `packages/main/src/main.ts`, `preload.cts` — native folder picker (`dialog.showOpenDialog`, answered only for the app page) exposed as `specforgeShell.pickFolder`
- `packages/ui/src/App.tsx` — *Open existing project*, reopen recent, *Locate*, project switcher and *Close project* wired to the core; non-git warning banner

Decisions / deviations:
- AC-3 "restores artifacts, board state and run history": the index is rebuilt from the files and DB-only state (board order, sub-states, runs, queue) persists in SQLite; the last opened project is reopened at startup.
- The renderer now waits for the core's "ready" signal: on a slow first start (Windows on-access scanning of freshly built files) the 5 s handshake previously timed out and left the UI "failed".

## Test Coverage
- Coverage: `project-service.ts` 100.0 % lines, `vcs.ts` 93.3 %, `project-folders.ts` 94.4 %, `composition.ts` 89.9 %, `project-context.ts` 83.3 %, `App.tsx` 96.8 % (workspace total 97.4 % lines)
- Test files: `packages/application/test/project-service.test.ts` (5 of 9), `packages/core/test/project-lifecycle.test.ts` (3 of 4, real Git/SQLite, restart), `packages/ui/test/app.test.tsx` (4 project-flow tests), `packages/main/test/projects.e2e.test.ts` (Electron e2e, shared with US-018), `packages/main/test/core-supervisor.test.ts` (2 new ready-handshake tests)
- 15 tests
