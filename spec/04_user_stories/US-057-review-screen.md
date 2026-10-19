---
id: US-057
title: Review implementation results and diffs
status: done
size: M
epic: Review
---

## Business Value
Gives users everything to judge an implementation in one place (FR-043, FR-047).

## Description
As a **SpecForge user**, I want **to see the summary, tests, warnings and diffs of a completed story** so that **I can make an informed accept/reject decision**.

## Acceptance Criteria
- [x] AC-1: Review tab shows outcome, agent summary, tests passed/failed, coverage, open issues and overlap/impact warnings.
- [x] AC-2: File list (added/modified/deleted) with Monaco diffs (side-by-side/unified) showing only the story's own changes (vs. base_ref or snapshot).
- [x] AC-3: Tabs Log, Permissions and Context; *Open in editor* for files.

## Technical Notes
- Related design document: `spec/03_design/functional_design/use_cases.md` — UC-022
- Related design document: `spec/03_design/functional_design/user_flows.md` — uf-06-reviewing-results
- Related requirements: FR-043, FR-047, FR-055
- Release: R1

## Dependencies
- US-051 Parse structured results and compute changes
- US-038 Kanban board with drag & drop

## Implementation Details
Files created / modified:
- `packages/ui/src/review/ReviewPanel.tsx` — Review tab (outcome, summary, tests, coverage, open issues, overlap warnings, changed files with *Open in editor*), Log (RunLog), Permissions (permission log), Context; shown in the story drawer for stories in Review
- `packages/ui/src/review/DiffView.tsx` — read-only side-by-side (`MergeView`) and unified (`unifiedMergeView`) diffs with `@codemirror/merge`, CSP nonce
- `packages/core/src/review.ts` — `ReviewFiles`: before/after contents vs. the run's base commit (worktree) or pre-run snapshot (non-git), binary detection, path validation inside the run's worktree
- `packages/core/src/composition.ts` — `review.get` (latest run, overlaps), `review.fileVersions`, `review.openFile`, `runs.permissions`; `ExecutionStore.overlaps`; `GitClient.blob`
- `packages/main/src/open-path.ts`, `main.ts`, `core/src/main.ts` — *Open in editor*: the core sends the validated absolute path to main, which opens it with `shell.openPath`

Decisions / deviations:
- Deviation (product-owner decision 2026-10-16): CodeMirror 6 `@codemirror/merge` instead of the Monaco diff editor — same editor stack and CSP nonce as the artifact editor, no web workers; technical_decisions.md and c4_architecture.md updated.
- Impact warnings (feature intents) are Release 2; the review shows overlap warnings from the touched-file records.

## Test Coverage
- Coverage: `ReviewPanel.tsx` 89.6 % lines, `DiffView.tsx` 100.0 %, `core/src/review.ts` 80.0 %, `open-path.ts` 100.0 % (workspace total 96.6 % lines)
- Test files: `packages/adapters/sqlite/test/execution-store.test.ts` (1 new), `packages/main/test/open-path.test.ts` (2), `packages/core/test/review-ipc.test.ts` (1, real Git), `packages/ui/test/review-panel.test.tsx` (7)
- 11 tests
