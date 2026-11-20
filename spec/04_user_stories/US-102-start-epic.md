---
id: US-102
title: Start an epic
status: done
size: S
epic: Epics & planning
---

## Business Value
Starting all Ready stories of an epic in one action saves many clicks while keeping each move a human authorisation (FR-098).

## Description
As a **SpecForge user**, I want to **start all Ready stories of an epic at once** so that **I can kick off an epic quickly**.

## Acceptance Criteria
- [x] AC-1: *Start epic* in the lane header opens a confirmation listing the Ready stories to start and the non-Ready stories that are skipped.
- [x] AC-2: Confirming moves each Ready story to In Progress as a separate human authorisation; stories with open blocking dependencies or beyond the limit are queued.
- [x] AC-3: FR-098 acceptance passes (4 Ready, one dependent: 3 runs started, 1 queued, confirmation lists all 4).

## Technical Notes
- Related design document: spec/03_design/functional_design/use_cases.md UC-041
- Related requirements: FR-098, FR-022, FR-065
- Release: R2

## Dependencies
- None

## Implementation Details
Files created / modified:
- `packages/application/src/board/plan-service.ts` (new) — `epicPreview` (Ready stories to start, the others skipped), `startEpic`: one `BoardService.move(→ In Progress)` per Ready story — each a human authorisation; the Scheduler queues stories with open blocking dependencies or beyond the limit; refused moves are reported without stopping the others
- `packages/ipc-contract/src/contract.ts` — `board.startEpicPreview`, `board.startEpic`; `packages/core/src/composition.ts` — wiring
- UI: `board/StartStoriesDialog.tsx` (new: stories to start and skipped ones, *Start n stories*), `board/KanbanBoard.tsx` (*Start epic* in the lane header, disabled in limited mode), `board/KanbanArea.tsx` (confirmation and result notice)

Decisions / deviations:
- Done stories of the epic appear in the skipped list (with their state) so the confirmation shows the whole epic.

## Test Coverage
- Coverage (lines): `plan-service.ts` 100 %, `StartStoriesDialog.tsx` 100 %, `KanbanArea.tsx` 77 % (was 58 % — tests for its board wiring added)
- Test files: `packages/application/test/plan-service.test.ts` (2), `packages/core/test/plan-ipc.test.ts` (FR-098 acceptance: 4 Ready, one depending on another → 3 runs started, 1 queued; the confirmation lists all 4), `packages/ui/test/plan-view.test.tsx` (2)
- 8 new tests (incl. 3 Kanban area wiring tests)
