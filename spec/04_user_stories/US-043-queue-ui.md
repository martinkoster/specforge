---
id: US-043
title: Show queued stories and queue controls
status: done
size: S
epic: Kanban & dependencies
---

## Business Value
Makes waiting stories understandable and controllable (FR-065).

## Description
As a **SpecForge user**, I want **to see why a story is queued and remove it from the queue** so that **I understand and can change what will run next**.

## Acceptance Criteria
- [x] AC-1: Queued cards show the reason ("Waiting for US-x (Review)", "Waiting for run slot (3/3)", "Waiting for workspace").
- [x] AC-2: Moving a story whose predecessor is in Backlog/Ready shows a warning before queuing.
- [x] AC-3: The card drawer shows queue position and *Remove from queue* (→ Ready).
- [x] AC-4: Blocked (conflict) cards show the conflicting files and *Re-check*.

## Technical Notes
- Related design document: `spec/03_design/functional_design/user_flows.md` — uf-04-starting-work-parallel-runs-and-the-queue
- Related requirements: FR-065, FR-067
- Release: R1

## Dependencies
- US-042 Scheduler: queue, slots and automatic start
- US-038 Kanban board with drag & drop

## Implementation Details
Files created / modified:
- `packages/ui/src/board/dependencies.ts` — `queueLabel` ("Waiting for US-x (Review)", "Waiting for run slot (3/3)", "Waiting for workspace", "Blocked (conflict)"), `earlyQueueWarning`
- `packages/ui/src/board/KanbanBoard.tsx` — confirmation before queuing behind unstarted predecessors; `StoryCard.tsx` — queue reason, conflicting files and *Re-check*; `StoryDrawer.tsx` — queue position, *Remove from queue*, embedded `DependencyEditor` (US-040)
- `packages/application/src/board/board-service.ts` — queue order and slot usage on the board, `recheck()` (human `recheckConflict`); `packages/domain/src/scheduling/policy.ts` — conflict entries wait (`blockedByConflict`); `scheduler.ts` — `ConflictResolved` per story re-enqueues with the original authorisation time
- `packages/ipc-contract/src/contract.ts` — `board.get` (+ `queue`, `slots`), `board.recheck`; `packages/core/src/scheduling.ts` — recheckConflict → ConflictResolved

Decisions / deviations:
- Conflicts are detected while preparing the execution space (US-048) and put the story back into the queue with the conflicting files.

## Test Coverage
- Coverage: `dependencies.ts` 100.0 % lines, `StoryCard.tsx` + `StoryDrawer.tsx` 100.0 %, `KanbanBoard.tsx` 95.0 %, `board-service.ts` 100.0 % (workspace total 97.3 % lines)
- Test files: `packages/ui/test/board-dependencies.test.ts` (2 of 4), `packages/ui/test/kanban-dependencies.test.tsx` (5 of 7), `packages/application/test/board-service.test.ts` (3 new), `packages/domain/test/scheduling-policy.test.ts` (1 new), `packages/application/test/scheduler.test.ts` (1 new), `packages/core/test/scheduling-wiring.test.ts` (1 new), `packages/ui/test/app.test.tsx` (1, shared with US-041)
- 14 tests
