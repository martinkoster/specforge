---
id: US-079
title: Adopt an existing code folder
status: done
size: M
epic: Brownfield onboarding
---

## Business Value
Users with existing code can bring it under SpecForge without starting from an empty folder — the most requested missing capability from Release 1 (FR-079, D14).

## Description
As a **SpecForge user**, I want to **adopt a folder that already contains code as a SpecForge project** so that **I can use specification-driven development on my existing projects**.

## Acceptance Criteria
- [x] AC-1: The start screen offers *Adopt existing code*; opening a non-empty folder without metadata offers *Adopt this folder* (replacing the Release 1 "arrives in Release 2" note of US-068).
- [x] AC-2: `project.inspectFolder` additionally returns the Git state (`none` / `root` / `subfolder`) and a suggested specification folder (`spec`, or `docs/spec` when `spec/` exists).
- [x] AC-3: The adopt dialog shows folder path, project name (pre-filled from the folder name), specification folder (editable, validated: relative, inside the workspace, not inside `.specforge/`, not an existing non-empty folder) and *Initialise Git repository* (only when no repository exists).
- [x] AC-4: *Adopt* writes `.specforge/project.yaml` (incl. `specRoot`) and the empty specification structure, registers the project and opens it; with *Initialise Git* it runs `git init` and commits only the SpecForge files — existing files stay untracked; in an existing repository nothing is committed. No existing file is modified (verified by comparing file hashes in the test).
- [x] AC-5: A subfolder of a Git repository is rejected with "Choose the repository root"; a folder that meanwhile contains `.specforge/project.yaml` is opened as an existing project.

## Technical Notes
- Related design document: spec/03_design/functional_design/use_cases.md UC-029, UC-030; user_flows.md UF-01b; business_processes.md BP-05; service_design.md ProjectService
- Related requirements: FR-079, FR-077, FR-001
- Release: R2
- Reuse the D24 create dialog components; IPC `projects.adopt({path, name, specRoot, initGit})`.

## Dependencies
- US-078 Per-project specification root

## Implementation Details
Files created / modified:
- `packages/application/src/projects/project-service.ts` — `adopt({name, path, specRoot, initGit})`: opens a folder that holds `.specforge/project.yaml` meanwhile (AC-5), rejects a subfolder of a repository (`NOT_REPOSITORY_ROOT`, "Choose the repository root"), validates the root (`specRootProblem`: domain `specRootError` + not an existing non-empty folder → `INVALID_SPEC_ROOT`), writes descriptor + structure, `git init` + `commitPaths(['.specforge', <root>])` only without a repository, registers and opens; `inspectFolder` returns `git` (`none`/`root`/`subfolder`) and `suggestedSpecRoot` (`spec`, then `docs/spec`, then `specforge/spec`) for non-empty folders; `VcsPort.location` / `commitPaths`; `ADOPT_HINT` replaces the Release 1 "arrives in Release 2" texts (create and open errors)
- `packages/application/src/projects/project-registry.ts` — error code `NOT_REPOSITORY_ROOT`
- `packages/adapters/git/src/vcs.ts` — `location()` via `git rev-parse --show-prefix`, `commitPaths()` (`git add -- <paths>`), shared commit with fallback identity
- `packages/ipc-contract/src/contract.ts` — command `projects.adopt`, query `projects.checkSpecRoot`, `projects.inspectFolder` output extended (optional `git`, `suggestedSpecRoot`)
- `packages/core/src/composition.ts` — handlers for `projects.adopt` and `projects.checkSpecRoot`
- `packages/ui/src/projects/AdoptProjectDialog.tsx` (new) — folder (*Change…*), project name from the folder name, *Specification folder* with immediate local validation (domain `specRootError`) and core check (existing non-empty folder), hint "spec/ already exists and is left untouched", *Initialise Git repository* only without a repository and with Git installed, "Choose the repository root" for subfolders (Adopt disabled)
- `packages/ui/src/projects/StartWizard.tsx` — third card *Adopt existing code*; `packages/ui/src/App.tsx` — start-card flow (project folder → open, empty folder → create dialog, other → adopt dialog), *Open existing project* on a non-empty folder offers *Adopt this folder* (region "Folder with existing code"); adopted projects open at Intent; `CreateProjectDialog.tsx` — `ADOPT_HINT`
- Spec: `service_design.md` (`project.checkSpecRoot`)

Decisions / deviations:
- Field validation of the specification folder uses a separate query `projects.checkSpecRoot` (the renderer cannot inspect the file system); the core re-validates on *Adopt*.
- An empty folder picked via *Adopt existing code* goes to the create dialog (nothing to adopt).
- *Analyse the codebase now* is added with US-080.

## Test Coverage
- Coverage (lines): `project-service.ts` 100 %, `CreateProjectDialog.tsx` 100 %, `vcs.ts` 95.5 %, `composition.ts` 94.1 %, `StartWizard.tsx` 90.6 %, `AdoptProjectDialog.tsx` 90 %, `App.tsx` 84 %; overall 95.5 %
- Test files: `packages/application/test/project-service.test.ts` (+8), `packages/adapters/git/test/vcs.test.ts` (2, new), `packages/core/test/project-lifecycle.test.ts` (+2: real Git, file hashes unchanged, existing files untracked; subfolder rejection, metadata folder opened), `packages/ui/test/adopt-project-dialog.test.tsx` (6, new), `packages/ui/test/app.test.tsx` (+2, one US-068 test replaced by the adopt offer), `packages/ui/test/start-wizard.test.tsx` (extended)
- Adapted: Release 1 hint expectations in `project-service.test.ts`, `app.test.tsx`, `main/test/projects.e2e.test.ts` (E2E green)
- Full suite: 1122 passed; lint, build and layering green
- 20 new tests
