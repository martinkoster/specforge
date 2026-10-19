---
id: US-021
title: Reconcile external edits to artifacts
status: done
size: M
epic: Projects & workspace
---

## Business Value
Keeps SpecForge consistent when files are changed by editors, Git or agents (FR-018).

## Description
As a **SpecForge user**, I want **changes I make outside SpecForge to appear immediately** so that **I can use my own editor and Git freely**.

## Acceptance Criteria
- [x] AC-1: External changes are detected (debounced ~200 ms) and re-indexed; self-writes are ignored via content hash.
- [x] AC-2: Changing a story's `status` externally moves the card within 2 s; illegal status changes are reverted in the index and flagged (FR-023).
- [x] AC-3: A file open with unsaved changes that changes on disk shows a conflict dialog (keep mine / take theirs / diff).

## Technical Notes
- Related design document: `spec/03_design/functional_design/use_cases.md` — UC-012
- Related requirements: FR-018, FR-023
- Release: R1

## Dependencies
- US-020 Parse workspace artifacts into the index

## Implementation Details
Files created / modified:
- `packages/adapters/workspace-fs/src/watcher.ts` — `watchWorkspace` (chokidar 5, ~200 ms debounce, ignores `.git`, `node_modules`, worktrees); resolves the root with `realpathSync.native` (Windows 8.3 short paths crashed libuv)
- `packages/adapters/workspace-fs/src/index.ts` — `WorkspaceFiles` `onWrite` hook (registers self-writes before the rename)
- `packages/application/src/indexing/external-changes.ts` — `SelfWriteRegistry` (content hash), `ExternalChangeReconciler` (re-index; planning moves backlog ↔ ready accepted, other status edits reverted in index and file and flagged via `status_notice`), port `StoryStatusIndex`
- `packages/application/src/indexing/open-documents.ts` — `OpenDocuments` (conflict detection, keep mine / take theirs, unified diff)
- `packages/adapters/sqlite/src/index-repository.ts` — `storyByPath`, `execSubState`, `setStoryStatus`, `setStatusNotice`; migration 7 (`story_state.status_notice`)
- `packages/ui/src/documents/ConflictDialog.tsx` — conflict dialog (keep mine / take theirs / show diff)

Decisions / deviations:
- The editors that open documents (and show `ConflictDialog`) are later stories; the dialog and `OpenDocuments` are ready to be wired.

## Test Coverage
- Coverage: `watcher.ts` 100.0 % lines, `external-changes.ts` + `open-documents.ts` 100.0 %, `ConflictDialog.tsx` 100.0 % (workspace total 98.2 % lines)
- Test files: `packages/core/test/external-changes.test.ts` (5), `packages/application/test/open-documents.test.ts` (6), `packages/adapters/workspace-fs/test/watcher.test.ts` (1), `packages/ui/test/conflict-dialog.test.tsx` (2)
- 14 tests
