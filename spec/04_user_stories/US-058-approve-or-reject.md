---
id: US-058
title: Approve or reject an implementation
status: done
size: S
epic: Review
---

## Business Value
Keeps acceptance a deliberate human decision (FR-025, FR-044, FR-046).

## Description
As a **SpecForge user**, I want **to approve or reject a story in Review** so that **only accepted work counts as done**.

## Acceptance Criteria
- [x] AC-1: *Approve* moves the story to Done and shows branch, base branch and merge order (predecessors first); SpecForge does not merge.
- [x] AC-2: *Reject* (optional reason) moves the story to Ready, marks the branch rejected (git) or offers snapshot restore (non-git).
- [x] AC-3: Approval triggers re-evaluation of queued dependents (US-042).

## Technical Notes
- Related design document: `spec/03_design/functional_design/use_cases.md` — UC-022
- Related requirements: FR-025, FR-044, FR-046
- Release: R1

## Dependencies
- US-057 Review implementation results and diffs
- US-042 Scheduler: queue, slots and automatic start

## Implementation Details
Files created / modified:
- `packages/core/src/composition.ts` — `review.approve` (Done, base branch, merge order; no merge), `review.reject` (Ready, rejected branch in git mode, optional restore of the run's files in non-git mode, reason as status notice), `review.rejectedBranches`
- `packages/application/src/board/merge-order.ts` — unmerged Done predecessors first
- `packages/adapters/sqlite/src/execution-store.ts` — rejected branches (`story_state.rejected_branches`); `packages/adapters/snapshot/src/index.ts` — `restorePaths`
- `packages/ui/src/review/ReviewPanel.tsx` — Decision (Approve, Reject with reason/restore) and merge instructions
- `packages/ui/src/review/RejectedBranches.tsx` — retained rejected branches in the story drawer
- `packages/ui/src/board/StoryDrawer.tsx`, `KanbanBoard.tsx` — the review (and its merge instructions) stays in the drawer after the story moved to Done; the drawer is keyed per story

Decisions / deviations:
- A new run after a rejection starts on a fresh branch (`specforge/US-001-2`); the rejected branch is retained and listed.

## Test Coverage
- Coverage: `ReviewPanel.tsx` 91.6 % lines, `merge-order.ts` 100 %, `StoryDrawer.tsx` 100 %, `execution-store.ts` 99.4 % (workspace total 95.4 % lines (950 tests passing))
- Test files: `packages/ui/test/review-panel.test.tsx` (5), `packages/core/test/approve-reject-ipc.test.ts` (3, real Git), `packages/application/test/merge-order.test.ts` (2), `packages/adapters/snapshot/test/snapshot.test.ts` (1), `packages/ui/test/kanban-board.test.tsx` (2 new); approval → dependents: `scheduler.test.ts`, `scheduling-wiring.test.ts`
- 13 tests
