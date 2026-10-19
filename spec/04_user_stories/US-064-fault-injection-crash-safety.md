---
id: US-064
title: Fault-injection tests for crash safety
status: done
size: S
epic: Quality & release readiness
---

## Business Value
Verifies that state survives crashes without corruption (NFR-015).

## Description
As a **SpecForge developer**, I want **automated kill tests during saves and runs** so that **we can trust persistence guarantees**.

## Acceptance Criteria
- [x] AC-1: Harness kills the core at random points during 100 save/run operations.
- [x] AC-2: No corrupt artifact files or unreadable database result; at most the last 1 s of log output is lost.

## Technical Notes
- Related design document: spec/03_design/technical_design/technical_decisions.md §5
- Related requirements: NFR-015, FR-040
- Release: R1

## Dependencies
- US-048 Run lifecycle, streaming and persistence
- US-020 Parse workspace artifacts into the index

## Implementation Details
Files created / modified:
- `packages/core/test/fault/core-child.mjs` — child process running the **real core** (`createCore`): artifact saves over IPC (`artifact.save`, ~200 KB versions with header/trailer) while a streaming agent run is persisted by the core's batching
- `packages/core/test/crash-safety.perf.test.ts` — 20 kill cycles at random points (≥ 100 saves in total, the run streaming in each cycle): every artifact is one complete version, `PRAGMA integrity_check` is `ok`, every event older than 1 s before the kill is persisted

Decisions / deviations:
- Part of `pnpm test:perf` (timing-dependent, needs `pnpm build`); replaces the earlier stand-in child that only imitated the core.

## Test Coverage
- Coverage: test-only story (fault-injection harness in `pnpm test:perf`) (workspace total 95.4 % lines (950 tests passing))
- Test files: `packages/core/test/crash-safety.perf.test.ts` (1)
- 1 test
