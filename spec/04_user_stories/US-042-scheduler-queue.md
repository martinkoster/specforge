---
id: US-042
title: Scheduler: queue, slots and automatic start
status: done
size: L
epic: Kanban & dependencies
---

## Business Value
Runs stories in parallel safely while honouring dependencies and the concurrency limit (FR-065, FR-066, FR-027, ADR-009).

## Description
As a **SpecForge user**, I want **authorised stories to start automatically when their dependencies are done and a slot is free** so that **work flows in parallel without me babysitting the queue**.

## Acceptance Criteria
- [x] AC-1: Single-writer scheduler processes domain events sequentially; each evaluation runs in one DB transaction.
- [x] AC-2: Queue order: corrections/resumes first, then FIFO by authorisation time; limit never exceeded; specification/chat runs do not count.
- [x] AC-3: Queue reasons dependency, slot and workspace (non-git, FR-116b) are recorded; approval of a predecessor starts a dependent within 5 s and logs the trigger.
- [x] AC-4: Property tests over random queue/approve/cancel/complete event sequences never exceed the limit, never start a story with an open blocking predecessor and never lose a queued story.
- [x] AC-5: Queue state survives restart and is re-evaluated at startup.

## Technical Notes
- Related design document: `spec/03_design/technical_design/c4_architecture.md` — ADR-009
- Related design document: `spec/03_design/technical_design/service_design.md` — scheduler
- Related design document: `spec/03_design/functional_design/use_cases.md` — UC-018
- Related requirements: FR-022, FR-027, FR-065, FR-066, FR-116, NFR-014
- L: the policy, transaction handling and property tests belong together; flag for review.
- Release: R1

## Dependencies
- US-037 Implement story state machine and transition rules
- US-040 Manage story dependencies with cycle detection
- US-007 Set up SQLite persistence with migrations

## Implementation Details
Files created / modified:
- `packages/domain/src/scheduling/policy.ts` — `orderQueue` (corrections/resumes first, then FIFO), `planStarts` (reasons dependency / workspace / slot, never above the limit)
- `packages/application/src/scheduling/scheduler.ts` — single-writer `Scheduler.post(event)`: events strictly sequential; each evaluation in one DB transaction (enqueue/dequeue, reasons, run rows); launches after commit via `RunLauncher`; idempotent (no second active run per story); trigger recorded on the run; `Startup` re-evaluates all persisted queues
- `packages/application/src/scheduling/ports.ts` — `SchedulerStore`, run records and statuses
- `packages/adapters/sqlite/src/execution-store.ts` + migration 8 (`run`, `queue_entry`, `permission_request`) — `ExecutionStore`
- `packages/core/src/scheduling.ts` — scheduling context (limit 3, 1 in non-git mode; open blocking predecessors from the index; non-git workspace writers), board → scheduler event mapping, `UnavailableRunLauncher`

Decisions / deviations:
- Until run execution exists (US-048, Claude Code adapter US-045) a launched run fails immediately with the reason "No agent adapter is available to execute runs yet", so the card shows *Failed* with an explanation instead of hanging in *Preparing*.
- The project-specific concurrency limit (project_settings) is configured with US-016; the default of 3 (1 in non-git mode) applies until then.
- `queue_entry.parent_run_id`, `run.start_kind` and `run.created_at` were added to the data model.

## Test Coverage
- Coverage: `policy.ts` 100.0 % lines, `scheduler.ts` 100.0 %, `execution-store.ts` 100.0 %, `scheduling.ts` 100.0 % (workspace total 97.4 % lines)
- Test files: `packages/domain/test/scheduling-policy.test.ts` (5), `packages/application/test/scheduler.test.ts` (10, incl. fast-check property test over 300 random event sequences), `packages/adapters/sqlite/test/execution-store.test.ts` (4 of 6, incl. restart), `packages/core/test/board-ipc.test.ts` (1 of 3), `packages/core/test/scheduling-wiring.test.ts` (3, board → scheduler events)
- 23 tests
