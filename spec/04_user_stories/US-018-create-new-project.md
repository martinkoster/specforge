---
id: US-018
title: Create a new project with folder and Git
status: done
size: S
epic: Projects & workspace
---

## Business Value
Lets users start a new SpecForge project in seconds with the recommended Git setup (FR-078, FR-001).

## Description
As a **SpecForge user**, I want **to create a project folder with Git and the SpecForge structure** so that **I can start writing my intent immediately**.

## Acceptance Criteria
- [x] AC-1: Dialog asks for name, parent location and folder name (pre-filled from name) with "Initialise Git" checked by default.
- [x] AC-2: Creation makes the folder, runs `git init`, writes `.specforge/project.yaml` and `spec/` structure and an initial commit; an existing non-empty folder is rejected.
- [x] AC-3: Without Git installed the checkbox is disabled with an explanation and the project is created in non-git mode.
- [x] AC-4: The project opens at the Intent phase.

## Technical Notes
- Related design document: `spec/03_design/functional_design/use_cases.md` — UC-029
- Related requirements: FR-001, FR-078
- Release: R1

## Dependencies
- US-017 Start wizard with project registry and recent projects

## Implementation Details
Files created / modified:
- `packages/application/src/projects/project-service.ts` — `ProjectService.create`: validates name and folder name, rejects non-empty folders, writes the structure, `git init` + initial commit (non-git when Git is missing or unticked), registers, indexes and opens; `gitAvailable()`
- `packages/adapters/workspace-fs/src/project-folders.ts` — `createStructure` (`.specforge/project.yaml`, `spec/01_intent` … `spec/05_test_concepts` with `.gitkeep`), `isEmptyOrMissing`
- `packages/adapters/git/src/vcs.ts` — `init`, `commitAll` (uses a local SpecForge identity only when no Git identity is configured)
- `packages/ipc-contract/src/contract.ts` — `projects.create`, `projects.gitAvailable`
- `packages/ui/src/projects/CreateProjectDialog.tsx` — name, location (folder picker), folder name pre-filled from the name (`folderNameFor`), *Initialise Git* checked by default, disabled with explanation without Git; errors shown
- `packages/ui/src/App.tsx` — opens the created project at the Intent phase

Decisions / deviations:
- Folder names are restricted to one path segment without Windows-invalid or control characters.

## Test Coverage
- Coverage: `project-service.ts` 100.0 % lines, `CreateProjectDialog.tsx` 100.0 %, `project-folders.ts` 94.4 %, `vcs.ts` 93.3 % (workspace total 97.4 % lines)
- Test files: `packages/application/test/project-service.test.ts` (4 of 9), `packages/core/test/project-lifecycle.test.ts` (1 of 4, real Git), `packages/ui/test/create-project-dialog.test.tsx` (6), `packages/ui/test/app.test.tsx` (1), `packages/main/test/projects.e2e.test.ts` (1, Electron e2e: create → restart → restored)
- 13 tests
