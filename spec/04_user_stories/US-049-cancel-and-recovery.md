---
id: US-049
title: Cancel runs and recover after close or crash
status: done
size: M
epic: Agent execution
---

## Business Value
Ensures no agent keeps running unnoticed and interrupted work can be resumed (FR-034, FR-041).

## Description
As a **SpecForge user**, I want **to cancel runs and have SpecForge handle app close and crashes safely** so that **I never lose track of work or leave orphan processes**.

## Acceptance Criteria
- [x] AC-1: Cancel terminates the agent process tree within 10 s, marks the run Cancelled, returns the story to Ready and frees the slot.
- [x] AC-2: Closing the app with active runs shows a dialog listing them; confirming terminates them and marks them Interrupted.
- [x] AC-3: On startup, non-terminal runs become Interrupted and orphaned agent processes from the process registry are killed (PID + start-time check).

## Technical Notes
- Related design document: `spec/03_design/functional_design/use_cases.md` — UC-021
- Related design document: `spec/03_design/functional_design/use_cases.md` — UC-024
- Related design document: `spec/03_design/technical_design/service_design.md` — processregistry
- Related requirements: FR-034, FR-041
- Uses the approach validated in spike US-003.
- Release: R1

## Dependencies
- US-048 Run lifecycle, streaming and persistence
- US-003 Spike S3: validate process-tree termination per OS

## Implementation Details
Files created / modified:
- New package `packages/adapters/process` (`@specforge/process`, ported from spike S3) — `killTree` (Windows `taskkill /T /F`, POSIX process groups), `identify` / `killOrphan` (pid + start time + command line, refuses reused pids), `processTree`
- `packages/application/src/execution/execution-service.ts` — `cancel(runId)` (stop → after 5 s kill the process tree → after 10 s mark *Cancelled* regardless; late outcomes ignored), `activeRuns()`, process identity recorded at start (`ProcessControl`); `ports/agent-adapter.ts` — optional `RunHandle.pid()`
- `packages/adapters/sqlite/src/execution-store.ts` + migration 12 (`run.pid_start_time`, `pid_command_line`) — `recordProcess`, `interruptActiveRuns`
- `packages/core/src/composition.ts` — startup recovery (crashed runs → *Interrupted*, orphan agent processes killed after identity check); `runs.cancel` (story back to Ready, slot freed), `runs.active`, `runs.interruptAll`
- `packages/main/src/close-coordinator.ts`, `main.ts`, `preload.cts` — close handshake: once the renderer has registered its close guard, the first window close is held and the renderer asked; confirm / cancel / 5 s acknowledgement timeout; without a guard (test mode, renderer gone) the window closes at once
- `packages/ui/src/shell/CloseGuard.tsx` — "Runs are still active" dialog (Stop runs and close / Keep running); wired in `App.tsx` / `main.tsx`

Decisions / deviations:
- The close guard is registered by the renderer (`specforge:close-guard`) and dropped on navigation or renderer crash, so a page without the guard never delays closing.
- The MockAdapter has no process; the process-tree and orphan paths are verified with real child processes in the process package and the core recovery test.

## Test Coverage
- Coverage: process package 84.3 % lines, `execution-service.ts` 98.7 %, `close-coordinator.ts` 100.0 %, `CloseGuard.tsx` 93.8 % (workspace total 97.1 % lines)
- Test files: `packages/adapters/process/test/*` (15 ported from S3, 1 skipped per OS), `packages/application/test/execution-service.test.ts` (5 new), `packages/core/test/cancel-recovery-ipc.test.ts` (3, real orphan process), `packages/main/test/close-coordinator.test.ts` (4), `packages/ui/test/close-guard.test.tsx` (3)
- 30 tests
