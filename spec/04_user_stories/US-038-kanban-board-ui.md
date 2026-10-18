---
id: US-038
title: Kanban board with drag & drop
status: done
size: M
epic: Kanban & dependencies
---

## Business Value
Provides the central control interface for delivery (FR-019, FR-020).

## Description
As a **SpecForge user**, I want **a five-column board where I move and order story cards** so that **I control priorities and execution visually**.

## Acceptance Criteria
- [x] AC-1: Board shows Backlog, Ready, In Progress, Review, Done; cards show ID, title, size, approval and execution indicator.
- [x] AC-2: Drag & drop (mouse and keyboard via dnd-kit) performs transitions through BoardService; moves write `status` to the story front-matter.
- [x] AC-3: Card order within columns persists across restarts (DB).
- [x] AC-4: Rejected moves snap back with the explanation (e.g. "Approve this story first").

## Technical Notes
- Related design document: `spec/03_design/functional_design/user_flows.md` — uf-03-planning-on-the-kanban-board
- Related design document: `spec/03_design/technical_design/service_design.md` — boardservice
- Related requirements: FR-019, FR-020, FR-021, NFR-020
- Release: R1

## Dependencies
- US-037 Implement story state machine and transition rules
- US-021 Reconcile external edits to artifacts
- US-022 Application shell and primary navigation

## Implementation Details
Files created / modified:
- `packages/application/src/board/board-service.ts` — `BoardService.board` (five columns, ordered cards) and `move` (domain `moveStory` as human; writes `status` to the front-matter, re-indexes, sets the sub-state and `authorised_at` before notifying the scheduler; same-column moves only reorder; fractional card order with renumbering)
- `packages/adapters/sqlite/src/index-repository.ts` — board query (story + story_state + queue reason), `setSubState`, `setOrder`, `setAuthorisedAt`
- `packages/ipc-contract/src/contract.ts` — `board.get`, `board.move`
- `packages/ui/src/board/KanbanBoard.tsx` — columns with counts, cards (ID, title, size, approval, execution indicator incl. queue reason, notice), dnd-kit drag & drop (pointer + keyboard sensors, drag handle), accessible *Move to* control, `resolveDrop`; rejected moves keep the card in place and show the reason
- `packages/ui/src/board/KanbanArea.tsx` — loads and moves through the core; refreshes the shell run indicator

Decisions / deviations:
- Dependency badges, highlighting and epic swimlanes are US-041; the story drawer embedding `DependencyEditor` follows with the card details.
- React sets dnd-kit transforms via the CSSOM, which the renderer CSP permits.

## Test Coverage
- Coverage: `board-service.ts` 100.0 % lines, `KanbanBoard.tsx` 86.5 %, `KanbanArea.tsx` 93.8 % (workspace total 97.4 % lines)
- Test files: `packages/application/test/board-service.test.ts` (8), `packages/core/test/board-ipc.test.ts` (2 of 3, restart keeps the order), `packages/ui/test/kanban-board.test.tsx` (5), `packages/ui/test/app.test.tsx` (1), `packages/main/test/kanban.e2e.test.ts` (1, Electron e2e: real mouse drag, rejected move snaps back)
- 17 tests
