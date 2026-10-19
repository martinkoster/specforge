---
id: US-039
title: Show epics as swimlanes on the board
status: done
size: M
epic: Kanban & dependencies
---

## Business Value
Gives a feature-level overview and planning on the board (FR-095, FR-096).

## Description
As a **SpecForge user**, I want **the board grouped by epic with progress per lane** so that **I see how each feature is progressing**.

## Acceptance Criteria
- [x] AC-1: *By epic* view (default when epics exist) shows one lane per epic plus *No epic*; lane header shows ID, title, derived status and progress (count and size-weighted).
- [x] AC-2: Lanes collapse/expand and reorder by dragging; toggle to flat view; epic filter; cards show epic colour tag.
- [x] AC-3: Dragging a card into another lane asks for confirmation and writes `epic` in front-matter.
- [x] AC-4: Derived epic status follows FR-095 incl. reset when stories are added to a Done epic.

## Technical Notes
- Related design document: `spec/03_design/functional_design/use_cases.md` — UC-041
- Related design document: `spec/03_design/technical_design/c4_architecture.md` — ADR-020
- Related requirements: FR-095, FR-096
- Release: R1

## Dependencies
- US-038 Kanban board with drag & drop
- US-035 Generate and manage epics

## Implementation Details
Files created / modified:
- `packages/domain/src/story/epic-status.ts` — derived epic status (FR-095) and count/size-weighted progress
- `packages/application/src/board/board-service.ts` — lanes per epic plus *No epic* (order, colour, status, progress)
- `packages/application/src/specs/epic-service.ts` — `assign` (lane drag); adding stories to a Done epic clears `epic_review` (assign, merge, split, `storiesAdded`)
- `packages/application/src/indexing/external-changes.ts` — `story-added` event for new story files
- `packages/core/src/composition.ts` — kept generation runs and new story files reopen their Done epic
- `packages/ui/src/board/KanbanArea.tsx`, `KanbanBoard.tsx`, `StoryCard.tsx` — by-epic view (default with epics), collapse/expand, lane reorder (drag and buttons), flat toggle, epic filter, colour tag, lane change with confirmation

Decisions / deviations:
- The epic review itself (confirm/skip, FR-100) is Release 2; until then `epic_review` is only written by hand.

## Test Coverage
- Coverage: `epic-service.ts` 100 % lines, `board-service.ts` 99.0 %, `KanbanBoard.tsx` 89.9 %, `KanbanArea.tsx` 70.7 % (wiring; behaviour covered by the board and swimlane tests and the E2E suite) (workspace total 95.4 % lines (950 tests passing))
- Test files: `packages/ui/test/swimlanes.test.tsx` (7), `packages/domain/test/epic-status.test.ts` (5), `packages/application/test/board-service.test.ts` (2), `packages/application/test/epic-service.test.ts` (3), `packages/core/test/external-changes.test.ts` (1 new), `packages/core/test/story-generation-ipc.test.ts` (extended)
- 18 tests
