---
id: US-016
title: Configure project settings
status: done
size: S
epic: Setup & configuration
---

## Business Value
Gives each project its instructions, Git settings and concurrency (FR-050, FR-053, FR-027).

## Description
As a **SpecForge user**, I want **to set project instructions, base branch, branch pattern, worktree root, snapshot exclusions and parallel runs** so that **agents follow my conventions and runs use the right Git setup**.

## Acceptance Criteria
- [x] AC-1: Project instructions & conventions are edited in-app and stored in `.specforge/instructions.md`.
- [x] AC-2: Base branch, branch pattern, worktree root (default short app-data path) and snapshot exclusions are configurable and validated.
- [x] AC-3: Parallel-runs limit (default 3) is editable; in non-git mode it is fixed at 1 with an explanation.

## Technical Notes
- Related design document: `spec/03_design/functional_design/use_cases.md` — UC-026
- Related requirements: FR-027, FR-050, FR-053
- Release: R1

## Dependencies
- US-019 Open an existing project and detect VCS mode

## Implementation Details
Files created / modified:
- `packages/domain/src/settings/project-settings.ts` — `ProjectSettings`, defaults (branch pattern `specforge/{storyId}`, exclusions, 3 parallel runs), `effectiveConcurrency` (1 without Git), `isValidBranchName` (git check-ref-format rules), `validateProjectSettings`
- `packages/application/src/settings/project-settings-service.ts` — `ProjectSettingsService` (`get`, `save` with base-branch existence check, `saveInstructions` with optimistic concurrency, synchronous `limit()` for the Scheduler, `LimitChanged` on change)
- `packages/adapters/sqlite/src/settings-repository.ts` — `projectSettings` / `setProjectSettings` (project_settings); `repositories.ts` — `setBaseBranch`, `updateVcs` keeps a configured base branch
- `packages/adapters/git/src/vcs.ts` — `branchExists`; `execution-spaces.ts` — `branchPattern` in `PrepareRequest`
- `packages/ipc-contract/src/contract.ts` — `projectSettings.get`, `projectSettings.save`, `projectSettings.saveInstructions`
- `packages/core/src/composition.ts` — wiring; the Scheduler's limit comes from the project settings
- `packages/ui/src/settings/ProjectSettingsForm.tsx` — instructions editor, base branch, branch pattern, worktree folder, snapshot exclusions, parallel runs (locked to 1 with explanation without Git); shown in Settings when a project is open

Decisions / deviations:
- The worktree folder must be outside the workspace (run worktrees must never be indexed); default `<appdata>/wt/<first 8 id characters>` (short Windows paths, ADR-010).
- `project.base_branch` is now set from the detected branch only on first detection; a base branch chosen in the settings is kept across reopens.
- The worktree folder is named after the story regardless of the branch pattern.

## Test Coverage
- Coverage: `project-settings.ts` 96.6 % lines, `project-settings-service.ts` 96.3 %, `ProjectSettingsForm.tsx` 96.9 %, `vcs.ts` 93.8 % (workspace total 97.3 % lines)
- Test files: `packages/domain/test/project-settings.test.ts` (5), `packages/application/test/project-settings-service.test.ts` (5), `packages/core/test/project-settings-ipc.test.ts` (2, real Git, restart), `packages/adapters/git/test/execution-spaces.test.ts` (1 new branch-pattern test), `packages/ui/test/project-settings-form.test.tsx` (5), `packages/ui/test/app.test.tsx` (1)
- 19 tests
