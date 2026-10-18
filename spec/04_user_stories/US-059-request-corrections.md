---
id: US-059
title: Request corrections with session resume
status: done
size: S
epic: Review
---

## Business Value
Lets users iterate with the agent on the same branch instead of starting over (FR-045).

## Description
As a **SpecForge user**, I want **to give feedback and have the agent continue in the same session** so that **small fixes are fast and keep context**.

## Acceptance Criteria
- [x] AC-1: *Request corrections* with feedback emits CorrectionRequested to the Scheduler; the story re-enters In Progress (queued with correction priority if no slot).
- [x] AC-2: The agent resumes the stored session in the same worktree; on completion the story returns to Review with an updated diff.
- [x] AC-3: If the session cannot be resumed, a fresh run on the same branch is offered with feedback and previous summary as context.

## Technical Notes
- Related design document: `spec/03_design/functional_design/use_cases.md` — UC-022
- Related design document: `spec/03_design/technical_design/service_design.md` — reviewservice
- Related requirements: FR-045, FR-027
- Release: R1

## Dependencies
- US-057 Review implementation results and diffs
- US-042 Scheduler: queue, slots and automatic start
- US-045 Implement the Claude Code adapter — live check only (product-owner decision 2026-10-18: built and verified against the adapter port with the MockAdapter)

## Implementation Details
Files created / modified:
- `packages/ipc-contract/src/contract.ts` — `review.correctionOptions`, `review.requestCorrections` (feedback, `fresh`)
- `packages/core/src/composition.ts` — corrections move Review → In Progress (`CorrectionRequested`, correction priority); session check; feedback kept until the correction run ends
- `packages/adapters/sqlite/src/schema.ts` (migration 19), `execution-store.ts` — `story_state.correction_feedback`, `correction_fresh`
- `packages/application/src/execution/execution-service.ts` — correction runs resume the previous agent session (unless fresh)
- `packages/core/src/execution.ts` — correction runs reuse the story's worktree/branch; the prompt carries the feedback and, for a fresh session, the previous run's summary
- `packages/application/src/execution/context-assembler.ts` — *Summary of the previous run* section
- `packages/ui/src/review/ReviewPanel.tsx` — *Request corrections…* with feedback; without a resumable session the fresh run on the same branch is offered

Decisions / deviations:
- Product-owner decision 2026-10-18: implemented against the agent adapter port and verified with the MockAdapter (session resume and fallback); the live check with Claude Code follows with US-045 / US-066.

## Test Coverage
- Coverage: `ReviewPanel.tsx` 91.6 % lines, `context-assembler.ts` 100 %, `execution-store.ts` 99.4 %, `composition.ts` 94.2 % (workspace total 95.4 % lines (950 tests passing))
- Test files: `packages/core/test/correction-ipc.test.ts` (3, real Git), `packages/ui/test/review-panel.test.tsx` (2 new), `packages/application/test/context-assembler.test.ts` (1 new), `packages/adapters/sqlite/test/execution-store.test.ts` (1 new); correction priority: `packages/application/test/scheduler.test.ts` (US-042 AC-2)
- 7 tests
