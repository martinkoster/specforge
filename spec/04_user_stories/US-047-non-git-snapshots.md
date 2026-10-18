---
id: US-047
title: Snapshots for non-git workspaces
status: done
size: M
epic: Agent execution
---

## Business Value
Enables diff and restore without Git (FR-039, ADR-011) and is reused by spec runs (ADR-014).

## Description
As a **SpecForge user without Git**, I want **SpecForge to snapshot my files before an agent changes them** so that **I can review and undo agent changes**.

## Acceptance Criteria
- [x] AC-1: Content-addressed snapshot of the workspace (respecting exclusions) is stored in app data with a manifest.
- [x] AC-2: Diff of current tree vs. snapshot lists added/modified/deleted files with patches; restore returns all tracked files to snapshot content.
- [x] AC-3: Starting a run in non-git mode shows the isolation warning and requires confirmation.
- [x] AC-4: The initial snapshot is taken in the background when a non-git project is opened and reports progress (no hard limit); the snapshot before each run (incremental) of 5,000 files / 500 MB completes in < 5 s on reference hardware. _(Changed 2026-10-15, product-owner decision: a cold snapshot of 500 MB takes 7–13 s.)_

## Technical Notes
- Related design document: `spec/03_design/technical_design/c4_architecture.md` — ADR-011
- Related design document: `spec/03_design/technical_design/service_design.md` — snapshotstore
- Related requirements: FR-039, NFR-004
- Release: R1

## Dependencies
- US-007 Set up SQLite persistence with migrations

## Implementation Details
Files created / modified:
- `packages/adapters/snapshot/` (new package `@specforge/snapshot`): `SnapshotStore` — content-addressed objects (`objects/ab/…`, stored once per content), manifest per snapshot, pointer to the latest snapshot per workspace; `create()` with exclusions (picomatch), progress callback and **incremental reuse** of unchanged files (size + mtime); `diff()` (A/M/D with unified patches for text files via `diff`); `restore()` (rewrites modified/deleted, removes added files and emptied folders); `DEFAULT_EXCLUSIONS`
- `packages/domain/src/execution/run-isolation.ts` — `runStartCheck()` and `NON_GIT_ISOLATION_WARNING` (AC-3)
- Performance tests split into `*.perf.test.ts`, run sequentially with `pnpm test:perf` (`vitest.perf.config.ts`, shared aliases in `vitest.shared.ts`; CI step added)
- Spec: US-047 AC-4, NFR-004 and ADR-011 updated (product-owner decision)

Decisions / deviations:
- **AC-4 changed (2026-10-15, product-owner decision):** a cold snapshot of 5,000 files / 500 MB takes ≈ 10–13 s on Windows (on-access antivirus per file open) and ≈ 7 s on Linux, so the initial snapshot is a one-time background preparation with progress; the < 5 s target applies to the pre-run (incremental) snapshot: measured ≈ 1.3 s on Windows, 1.2 s on Linux.
- Timing assertions moved out of the parallel suite because concurrent heavy tests distorted them (1,000-story index 5.4 s in parallel vs. < 2 s alone).

## Test Coverage
- Coverage (`packages/adapters/snapshot/src`, `run-isolation.ts`): **100 % lines**, 97.7 % statements, 90.3 % branches (workspace total 98.2 % lines)
- Test files: `packages/adapters/snapshot/test/snapshot.test.ts`, `packages/adapters/snapshot/test/snapshot.perf.test.ts` (sequential), `packages/domain/test/run-isolation.test.ts`
- 14 tests
