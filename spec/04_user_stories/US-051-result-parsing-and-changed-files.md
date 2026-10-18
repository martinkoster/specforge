---
id: US-051
title: Parse structured results and compute changes
status: done
size: S
epic: Agent execution
---

## Business Value
Provides test results and authoritative change lists for review and overlap tracking (FR-036).

## Description
As a **SpecForge user**, I want **test counts and changed files for every completed run** so that **I can judge an implementation quickly**.

## Acceptance Criteria
- [x] AC-1: ResultParser extracts the fenced `specforge-result` JSON from the final message and validates it with zod; missing/invalid → *result unavailable*.
- [x] AC-2: Changed files are computed from git (base_ref..branch) or snapshot diff and stored with additions/deletions.
- [x] AC-3: Touched files per story are recorded for overlap detection and dependency context.

## Technical Notes
- Related design document: `spec/03_design/technical_design/service_design.md` — resultparser
- Related design document: `spec/03_design/technical_design/c4_architecture.md` — ADR-008
- Related requirements: FR-036
- Release: R1

## Dependencies
- US-048 Run lifecycle, streaming and persistence
- US-046 Prepare isolated worktree execution spaces
- US-047 Snapshots for non-git workspaces

## Implementation Details
Files created / modified:
- `packages/application/src/execution/result-parser.ts` — `parseRunResult` (last fenced ```` ```specforge-result ```` block, validated with zod: outcome, summary, tests, coverage, changed files, open issues, recommendations) and `RESULT_INSTRUCTION` (appended to every implementation prompt)
- `packages/application/src/execution/execution-service.ts` — on completion: parse the result (*Completed* vs. *Completed (no result)* with the reason), compute the changed files (`ExecutionSpaces.changes`), store result + raw result (redacted) and the touched files
- `packages/adapters/git/src/execution-spaces.ts` — `worktreeChanges` (committed + uncommitted + untracked changes vs. the run base, with line counts; one `git diff --raw --numstat` call plus `ls-files` in parallel)
- `packages/core/src/execution.ts` — `CoreExecutionSpaces.changes` (worktree diff or snapshot diff in non-git mode, `statsFromPatch`)
- `packages/adapters/sqlite/src/execution-store.ts` + migration 11 (`run_result`, `file_touch`, `recommendation`) — `saveResult`, `runResult`, `recordTouches`, `touchedFiles`, `openRecommendations`; pending decisions list open recommendations
- `packages/ipc-contract/src/contract.ts` — `runs.result`

Decisions / deviations:
- The agent-reported `changedFiles` are kept as reported; the review uses the computed changes, which are authoritative.
- `zod` was added to the application package for the result schema.

## Test Coverage
- Coverage: `result-parser.ts` 100.0 % lines, `execution-service.ts` 98.7 %, `execution-spaces.ts` 100.0 %, `execution-store.ts` 99.1 % (workspace total 97.1 % lines)
- Test files: `packages/application/test/result-parser.test.ts` (4), `packages/application/test/execution-service.test.ts` (3 new), `packages/adapters/git/test/execution-spaces.test.ts` (1 new), `packages/adapters/sqlite/test/execution-store.test.ts` (2 new), `packages/core/test/execution-ipc.test.ts` (2 new, MockAdapter, real Git)
- 12 tests
