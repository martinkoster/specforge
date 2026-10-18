---
id: US-024
title: Detect branches merged by the user
status: done
size: S
epic: Projects & workspace
---

## Business Value
Lets SpecForge track merge state although it never merges itself (FR-115, CON-008).

## Description
As a **SpecForge user**, I want **SpecForge to notice when I merged an approved story branch** so that **epic status, dashboard and stacking stay accurate**.

## Acceptance Criteria
- [x] AC-1: Merge check (`git merge-base --is-ancestor`) runs on project open, window focus, after SpecForge Git operations, every 60 s (configurable) and via *Refresh*.
- [x] AC-2: A merged story gets `merged_at` within 5 s of window focus; overlap records for it are removed.
- [x] AC-3: Later dependent stories branch from the base branch once their predecessors are merged.

## Technical Notes
- Related design document: `spec/03_design/functional_design/use_cases.md` — UC-049
- Related requirements: FR-115
- Release: R1

## Dependencies
- US-019 Open an existing project and detect VCS mode
- US-046 Prepare isolated worktree execution spaces

## Implementation Details
Files created / modified:
- `packages/application/src/board/merge-detector.ts` — `MergeDetector`: one check per project at a time, marks merged Done stories (`merged_at`), removes their overlap records, notifies; `every()` for the periodic check
- `packages/adapters/git/src/execution-spaces.ts` — `mergedInto` (one `for-each-ref --merged` call for all candidate branches)
- `packages/adapters/sqlite/src/index-repository.ts` — `unmergedDoneStories`, `setMergedAt`, `mergedAt`; `execution-store.ts` — `clearTouches`
- `packages/domain/src/settings/agent-settings.ts` — `ExecDefaults.mergeCheckIntervalS` (default 60 s, ≥ 10 s); `ExecDefaultsForm.tsx` — field
- `packages/core/src/composition.ts` — triggers: project open, interval (restarted when the setting changes), after runs and spec commits, `merge.check` (window focus, *Refresh*); next step "Merge n approved branches" counts unmerged Done stories; `core/src/execution.ts` — merged predecessors are not stacked on
- `packages/ui/src/App.tsx` — merge check on window focus (git mode); `board/KanbanArea.tsx` — *Refresh*

Decisions / deviations:
- Deviation: instead of one `git merge-base --is-ancestor` per branch, a single `git for-each-ref --merged=<base>` answers the same question for all candidates (Git calls cost ~0.4 s each on Windows).
- Only ancestry is detected; squash or rebase merges by the user are not recognised.

## Test Coverage
- Coverage: `merge-detector.ts` 100.0 % lines, `execution-spaces.ts` 100.0 %, `index-repository.ts` 100.0 % (workspace total 96.6 % lines)
- Test files: `packages/adapters/git/test/execution-spaces.test.ts` (1 new), `packages/adapters/sqlite/test/execution-store.test.ts` (1 new), `packages/application/test/merge-detector.test.ts` (4), `packages/core/test/merge-detection-ipc.test.ts` (1, real Git), `packages/ui/test/merge-check.test.tsx` (3)
- 10 tests
