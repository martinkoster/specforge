---
id: US-054
title: Monitor runs in the execution view
status: done
size: M
epic: Agent execution
---

## Business Value
Provides real-time visibility into all active and queued runs (FR-031, FR-069).

## Description
As a **SpecForge user**, I want **to watch live output of one or several runs** so that **I can follow progress without the agent CLI**.

## Acceptance Criteria
- [x] AC-1: Run list shows story, status chip, elapsed time, files touched and pending prompts; running first.
- [x] AC-2: Selecting a run shows its live stream (output appears < 1 s); *Tile* shows up to three streams side by side.
- [x] AC-3: Logs render virtualised; a 100 MB log scrolls smoothly and search returns in < 2 s (FTS5).
- [x] AC-4: Each run can be cancelled individually.

## Technical Notes
- Related design document: `spec/03_design/functional_design/user_flows.md` — uf-05-watching-runs-and-answering-permission-prompts
- Related design document: `spec/03_design/functional_design/use_cases.md` — UC-019
- Related requirements: FR-031, FR-069, NFR-002, NFR-005
- Release: R1

## Dependencies
- US-048 Run lifecycle, streaming and persistence
- US-022 Application shell and primary navigation

## Implementation Details
Files created / modified:
- `packages/adapters/sqlite/src/execution-store.ts` + migration 13 (`run_event_fts`, FTS5) — events indexed on append (output text, tool name + input, error message), `searchEvents` (FTS5 syntax incl. prefix and phrase; invalid input falls back to plain words), paged `runEvents(afterSeq, limit)`, `eventCount`, `runsOverview` (active runs, queued stories, recent runs with touched files and undecided prompts)
- `packages/ipc-contract/src/contract.ts` — `runs.overview`, `runs.search`, `runs.events` with `limit`
- `packages/ui/src/executions/ExecutionsArea.tsx` — run list (story, status chip, elapsed time, files touched, pending prompts; running first), per-run *Cancel*, *Tile* up to three streams, run panel with Log / Context / Result tabs
- `packages/ui/src/executions/RunLog.tsx` — virtualised log (fixed row height, only visible rows rendered), paged loading, live `run.output` merged by sequence number, 1 s polling for other events while active, search with previous/next match and follow mode

Decisions / deviations:
- NFR-005 is verified by `run-log-search.perf.test.ts` (100 MB log, search < 2 s).
- Output appears through the `run.output` event as soon as the core emits it; tool events arrive with the next 1 s poll.

## Test Coverage
- Coverage: `ExecutionsArea.tsx` 94.4 % lines, `RunLog.tsx` 93.5 %, `execution-store.ts` 99.1 % (workspace total 97.1 % lines)
- Test files: `packages/adapters/sqlite/test/execution-store.test.ts` (3 new), `packages/adapters/sqlite/test/run-log-search.perf.test.ts` (1), `packages/core/test/runs-view-ipc.test.ts` (1, MockAdapter), `packages/ui/test/executions.test.tsx` (13)
- 18 tests
