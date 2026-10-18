---
id: US-055
title: Retry, resume or discard failed and interrupted runs
status: done
size: S
epic: Agent execution
---

## Business Value
Lets users recover from failures without losing work (FR-026, FR-035).

## Description
As a **SpecForge user**, I want **to retry, resume or discard a failed or interrupted run** so that **failures are easy to recover from**.

## Acceptance Criteria
- [x] AC-1: Failed/Interrupted cards show a badge and *Retry* (fresh or reuse branch), *Resume* (session resume, if supported) and *Discard*.
- [x] AC-2: Retry and resume are started via the Scheduler and count toward the limit; prior runs stay in the story history.
- [x] AC-3: Discard returns the story to Ready and offers worktree cleanup.

## Technical Notes
- Related design document: `spec/03_design/functional_design/use_cases.md` — UC-023
- Related requirements: FR-026, FR-035
- Release: R1

## Dependencies
- US-049 Cancel runs and recover after close or crash
- US-042 Scheduler: queue, slots and automatic start

## Implementation Details
Files created / modified:
- `packages/domain/src/story/state-machine.ts` — `resumeRun` (failed/interrupted → queued, human)
- `packages/application/src/board/board-service.ts` — `runAction(retry | resume | discard)` (retry/resume need the AI capability)
- `packages/application/src/execution/execution-service.ts` — resume passes the stopped run's agent session (`resumeSessionId`) when the adapter supports resume; `context-assembler.ts` — task texts for retry and resume
- `packages/core/src/scheduling.ts` — `resumeRun` → `ResumeRequested`; `core/src/execution.ts` — resume and "reuse branch" retries continue in the previous worktree (or re-add it from the branch); fresh retries get a new branch (`-2`)
- `packages/adapters/sqlite` — migration 15 (`story_state.retry_mode`), `setRetryMode` / `retryMode`
- `packages/core/src/composition.ts` — `board.runAction` (retry mode, discard with optional worktree removal), `runs.recovery` (resumable, git mode, worktree present)
- `packages/ui/src/board/RunRecoveryDialog.tsx` — Retry (fresh / reuse branch), Resume (disabled with reason when not resumable), Discard (+ remove worktree); `StoryCard.tsx` — *Retry / resume…* on failed and interrupted cards

Decisions / deviations:
- Retries and resumes are queue entries of the Scheduler (resume with correction priority) and count toward the limit; prior runs stay in the run history.
- Discarding keeps the branch; only the worktree folder is removed on request.

## Test Coverage
- Coverage: `RunRecoveryDialog.tsx` 87.5 % lines, `core/src/execution.ts` 91.9 %, `state-machine.ts` 100.0 % (workspace total 96.6 % lines)
- Test files: `packages/domain/test/story-state-machine.test.ts` (resumeRun rows of the transition table), `packages/application/test/board-service.test.ts` (2 new), `packages/application/test/execution-service.test.ts` (2 new), `packages/application/test/context-assembler.test.ts` (1 new), `packages/core/test/run-recovery-ipc.test.ts` (3, real Git), `packages/ui/test/run-recovery.test.tsx` (5)
- 16 tests
