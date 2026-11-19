---
id: US-068
title: Folder-first project creation
status: done
size: S
epic: Projects & workspace
---

## Business Value
Creating a project becomes "pick a folder, confirm": no parent location, folder name or slug to understand. Opening an empty folder no longer ends in a dead end (FR-078, FR-077, D24). Rework of the done story US-018 (done stories are not reopened).

## Description
As a **SpecForge user**, I want **to choose (or create) a folder and turn it into a SpecForge project** so that **I don't have to fill in project name, location and folder name separately**.

## Acceptance Criteria
- [x] AC-1: *Create new project* opens the native folder picker first (creating a new folder in the picker is allowed). After a folder is picked, a short dialog shows the folder path (*Change…*), *Project name* pre-filled from the folder name (editable, required) and *Initialise Git* checked by default (disabled with an explanation without Git, as before). The *Location* and *Folder name* fields are gone.
- [x] AC-2: *Create* writes `.specforge/project.yaml` (with the entered name) and the `spec/` structure into the picked folder, runs `git init` + an initial commit (unless unticked or Git is missing) and opens the project at the Intent phase.
- [x] AC-3: A picked folder that already holds `.specforge/project.yaml` is opened as an existing project (no dialog). A non-empty folder without metadata is rejected with: "Choose an empty folder — adopting existing code arrives in Release 2." Nothing is written to it.
- [x] AC-4: *Open existing project* on an empty folder without metadata offers *Create new project here*, which continues with the AC-1 dialog for that folder; a non-empty folder without metadata keeps the explanation and says that adopting existing code arrives in Release 2.
- [x] AC-5: Unit, UI and Electron E2E tests (`stubFolderPicker`) cover creation in a new folder, the metadata folder, the non-empty rejection and *Create new project here*; existing US-018/US-019 tests are adapted.

## Technical Notes
- Related design document: `spec/03_design/functional_design/use_cases.md` — UC-029 (B, A-1a, B-1a/b)
- Related design document: `spec/03_design/functional_design/user_flows.md` — UF-01b
- Related requirements: FR-077, FR-078; intent D24
- Release: R1
- Touch points: see Implementation Details.
- Brownfield adoption of non-empty folders stays Release 2 (FR-079).

## Dependencies
- US-018 Create a new project with folder and Git
- US-019 Open an existing project and detect VCS mode

## Implementation Details
Files created / modified:
- `packages/ipc-contract/src/contract.ts` — `projects.create` takes `{ name, path, initGit }` (the picked folder instead of parent + folder name); new query `projects.inspectFolder` → `{ kind: 'project' | 'empty' | 'notEmpty' }`
- `packages/application/src/projects/project-service.ts` — `ProjectService.create` writes into the given absolute folder (must be empty or missing; `INVALID_FOLDER` for relative paths, `FOLDER_NOT_EMPTY` with the Release 2 hint `ADOPT_IN_RELEASE_2`); `inspectFolder(path)`; the `NOT_A_PROJECT` message mentions that adopting existing code arrives in Release 2; dependency `join` replaced by `isAbsolute`; folder-name validation removed
- `packages/core/src/composition.ts` — wires `projects.inspectFolder` and `isAbsolute`
- `packages/ui/src/projects/CreateProjectDialog.tsx` — folder-first dialog: picked folder with *Change…*, *Project name* pre-filled from the folder name (`folderBaseName`, re-filled on *Change…* until edited), *Initialise Git*; *Location* / *Folder name* and `folderNameFor` removed
- `packages/ui/src/App.tsx` — *Create new project* opens the picker first (`pickCreateFolder`: SpecForge folder → opened, non-empty → error, empty → dialog); *Open existing project* on an empty folder shows the *Empty folder* banner with *Create new project here*
- `packages/main/test/e2e-support.ts` — `createProject` creates `parent/<slug of name>` and picks it folder-first (callers unchanged)
- Tests adapted to the new `projects.create` input: 23 core IPC test files, `packages/main/test/accessibility.e2e.test.ts`
- Spec: `service_design.md` (`project.inspectFolder`), US-018 note (superseded parts)

Decisions / deviations:
- The core classifies folders (`projects.inspectFolder`) so the renderer needs no file-system access; the renderer decides what to show.
- `ADOPT_IN_RELEASE_2` exists in the application layer (core messages) and in the UI (the renderer may not import the application layer).
- A missing folder is still accepted by `create` (created on demand), which keeps scripted/test callers simple; the UI always passes a picked, existing folder.

## Test Coverage
- Coverage: `project-service.ts` 100 % lines (96.4 % branches), `CreateProjectDialog.tsx` 100 %, `composition.ts` 94.1 %, `App.tsx` 80.4 % (workspace total 95.4 % lines; full suite 997 passed)
- Test files: `packages/application/test/project-service.test.ts` (4 new, 4 adapted), `packages/core/test/project-lifecycle.test.ts` (1 new, real Git/SQLite), `packages/ui/test/create-project-dialog.test.tsx` (rewritten, 8), `packages/ui/test/app.test.tsx` (4 new, 2 adapted), `packages/main/test/projects.e2e.test.ts` (1 new Electron e2e, 1 adapted), `packages/main/test/accessibility.e2e.test.ts` (adapted)
- 18 new tests
