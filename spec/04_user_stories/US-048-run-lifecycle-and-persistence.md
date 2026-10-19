---
id: US-048
title: Run lifecycle, streaming and persistence
status: done
size: M
epic: Agent execution
---

## Business Value
Executes agent runs in the background with continuous persistence and timeouts (FR-030, FR-040, FR-042, FR-024).

## Description
As a **SpecForge user**, I want **runs to execute in the background, stream live and be stored reliably** so that **I can keep working and never lose run history**.

## Acceptance Criteria
- [x] AC-1: ExecutionService launches runs via the adapter with the prepared execution space; status transitions follow the run lifecycle.
- [x] AC-2: Events are redacted and batch-persisted (100 ms / 200 events); at most the last 1 s is lost on crash.
- [x] AC-3: Max-duration and idle timeouts fail the run (*Failed (timeout)*); waiting for a permission decision pauses both.
- [x] AC-4: A completed run moves the story to Review; a failed run keeps it In Progress (Failed) and frees the slot.

## Technical Notes
- Related design document: `spec/03_design/technical_design/service_design.md` — executionservice
- Related design document: `spec/03_design/functional_design/use_cases.md` — UC-017
- Related requirements: FR-024, FR-030, FR-040, FR-042, NFR-015
- Release: R1

## Dependencies
- US-044 Define AgentAdapter port and MockAdapter
- US-042 Scheduler: queue, slots and automatic start
- US-011 Store secrets in OS credential store and redact them

## Implementation Details
Files created / modified:
- `packages/application/src/execution/execution-service.ts` — `ExecutionService` (the Scheduler's `RunLauncher`): prepares the execution space, starts the adapter with prompt, model/effort/max turns and the resolved environment; streams events redacted (known secret values + patterns) and batch-persisted (`EventBatcher`, 100 ms / 200 events); max-duration and idle timeouts (`RunTimers`, paused while a permission decision is pending, started before the agent); completed → story to Review (system transition) before the run is reported completed; failed → story In Progress (Failed) with reason; merge conflicts while preparing → *Blocked (conflict)* back in the queue; `shutdown()` stops active runs as *Interrupted*
- `packages/core/src/execution.ts` — `CoreExecutionSpaces` (git: worktree per story run with configured base branch, branch pattern and worktree folder, stacked on Done predecessors' recorded branches, branch written to the story front-matter; non-git: snapshot + in place) and `BasicPromptBuilder` (story file, project instructions, scope rules)
- `packages/adapters/sqlite/src/execution-store.ts` + migration 10 (`run_event`, `execution_space`) — `markStarted`, `setSessionId`, transactional `appendEvents`, `runEvents`, `requeueConflict`, `saveExecutionSpace`; `index-repository.ts` — `storyBranch`
- `packages/application/src/board/board-service.ts` — `system()` transitions (completeRun)
- `packages/application/src/settings/settings-service.ts` — `resolveEnvWithSecrets`; `setup/setup-service.ts` — `providerEnv`
- `packages/application/src/scheduling/scheduler.ts` — `idle()`; `packages/core/src/composition.ts` — execution wiring, run output events (`run.output`), clean `close()` (runs stopped, scheduler drained); `runs.events` query

Decisions / deviations:
- The UnavailableRunLauncher of US-042 is replaced: without an agent adapter (the Claude Code adapter is US-045) the ExecutionService fails a run with the same stated reason. With the MockAdapter, runs execute end to end in tests.
- The full context (linked requirements, predecessors, concurrent runs) is US-050; cancel, close dialog and startup recovery are US-049; result parsing is US-051.
- Found by the integration tests: an agent asking for a permission synchronously during start made the paused max-duration timer negative and timed the run out at once — timers now start before the agent.

## Test Coverage
- Coverage: `execution-service.ts` 96.7 % lines, `core/src/execution.ts` 88.9 %, `execution-store.ts` 100.0 %, `composition.ts` 91.9 % (workspace total 97.3 % lines)
- Test files: `packages/application/test/execution-service.test.ts` (16), `packages/core/test/execution-ipc.test.ts` (3, MockAdapter, real Git), `packages/adapters/sqlite/test/execution-store.test.ts` (3 new), `packages/application/test/board-service.test.ts` (2 system-transition tests), `packages/application/test/settings-service.test.ts` (1), `packages/application/test/setup-service.test.ts` (1), `packages/application/test/scheduler.test.ts` (1 idle test)
- 27 tests
