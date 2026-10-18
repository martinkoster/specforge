---
id: US-017
title: Start wizard with project registry and recent projects
status: done
size: M
epic: Projects & workspace
---

## Business Value
Provides the entry point to create or open projects and switch between them (FR-076, FR-003).

## Description
As a **SpecForge user**, I want **a start screen to open, create or reopen recent projects** so that **I get to my work in one click**.

## Acceptance Criteria
- [x] AC-1: When no project is open, the start wizard shows *Open existing project*, *Create new project* and recent projects (name, path, last opened, phase).
- [x] AC-2: Projects can be renamed and removed (unlinked without deleting files); removal is blocked while runs are active.
- [x] AC-3: A recent project whose folder is missing offers *Locate* or *Remove from list*.

## Technical Notes
- Related design document: `spec/03_design/functional_design/use_cases.md` — UC-029
- Related design document: `spec/03_design/functional_design/use_cases.md` — UC-003
- Related design document: `spec/03_design/functional_design/user_flows.md` — uf-01b-start-wizard
- Related requirements: FR-003, FR-076
- *Adopt existing code* is Release 2 (FR-079).
- Release: R1

## Dependencies
- US-006 Implement typed, validated IPC contract
- US-007 Set up SQLite persistence with migrations

## Implementation Details
Files created / modified:
- `packages/domain/src/project/phase.ts` — PhaseStatus derivation: `phaseState`, `currentPhase` (first phase not approved; Kanban when all approved), `phaseLabel`
- `packages/application/src/projects/project-registry.ts` — `ProjectRegistry` (`recent` sorted by last opened with phase and missing-folder flag, `rename`, `remove` blocked while runs are active, `locate` requires `.specforge/project.yaml`), ports `ProjectRecords`, `ProjectFolders`, `ProjectActivity`, `ProjectRegistryError`
- `packages/adapters/sqlite/src/repositories.ts` — `ProjectRepository.touch`, `relocate`; `index-repository.ts` — `phaseInputs` (artifact kinds → phases, impact flags)
- `packages/adapters/workspace-fs/src/project-folders.ts` — `ProjectFolderProbe`
- `packages/ipc-contract/src/contract.ts` — query `projects.recent`, commands `projects.rename` / `projects.remove` / `projects.locate`
- `packages/core/src/handlers/project-handlers.ts` — `createProjectHandlers` (registry errors mapped to IPC error codes)
- `packages/ui/src/projects/StartWizard.tsx` — start screen (Open existing / Create new, recent list with path, phase chip, last opened; inline rename; remove with confirmation; missing folder → Locate / Remove from list); shown by `App.tsx` while no project is open

Decisions / deviations:
- *Open existing*, *Create new*, reopening a recent project and *Locate* need the native folder picker and the open/create flows of US-018/US-019; until then the wizard shows these actions disabled ("Not available yet"). The registry operation behind *Locate* is implemented and tested.
- Active runs and generating phases come from ports; the execution store does not exist yet, so the core passes them in.

## Test Coverage
- Coverage: `phase.ts` 100.0 % lines, `project-registry.ts` 100.0 %, `project-handlers.ts` 91.7 %, `project-folders.ts` 100.0 %, `StartWizard.tsx` 93.5 % (workspace total 98.2 % lines)
- Test files: `packages/domain/test/project-phase.test.ts` (4), `packages/application/test/project-registry.test.ts` (7), `packages/core/test/project-registry-ipc.test.ts` (3), `packages/ui/test/start-wizard.test.tsx` (8), `packages/ui/test/app.test.tsx` (4, shared with US-022)
- 26 tests
