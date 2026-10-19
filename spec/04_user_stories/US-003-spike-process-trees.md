---
id: US-003
title: Spike S3: validate process-tree termination per OS
status: done
size: S
epic: Foundation & spikes
---

## Business Value
Ensures cancel and app-close reliably stop agents and every process they spawned (e.g. test runners), a prerequisite for FR-034/FR-041.

## Description
As a **SpecForge developer**, I want **a prototype that spawns a process tree and terminates it completely on each OS** so that **cancellation and crash recovery can be implemented with confidence**.

## Acceptance Criteria
- [x] AC-1: A spawned parent with nested children (incl. a long-running `node` and shell child) is terminated completely on Windows (`taskkill /T /F`) and POSIX (process group SIGTERM → SIGKILL after 5 s).
- [x] AC-2: Orphan detection validates PID plus start time/command line to avoid killing reused PIDs.
- [x] AC-3: Findings documented in `docs/spikes/S3-process-trees.md`.

## Technical Notes
- Related design document: `spec/03_design/technical_design/service_design.md` — processregistry
- Related requirements: FR-034, FR-041; NFR-025
- Release: R1

## Dependencies
- None

## Implementation Details
Files created:
- `spikes/s3/package.json`, `package-lock.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore` — standalone throwaway spike package
- `spikes/s3/src/killTree.ts` — `spawnTracked()` (process-group leader on POSIX), `isAlive()`, `killTree()` (Windows `taskkill /T /F`; POSIX `killTreePosix()`: SIGTERM to group + snapshot descendants, SIGKILL after grace) with injectable system dependencies
- `spikes/s3/src/orphans.ts` — `identify()` (Windows CIM CreationDate/CommandLine, Linux `/proc` start ticks scoped by `boot_id`, macOS `ps lstart`), pure parsers `parseLinuxProc()` / `parseMacPs()`, `killOrphan()` with identity check
- `spikes/s3/src/processTree.ts` — process-tree listing (copied from spike S1)
- `spikes/s3/test/fixtures/tree.cjs` — fixture building parent → node child → node grandchild + shell child
- `docs/spikes/S3-process-trees.md` — findings and recommendation (**Go**)

Decisions / findings:
- POSIX agents must be spawned as process-group leaders; descendants are snapshotted as well because `setsid()` children leave the group.
- PID reuse is handled by matching start time + command line; Linux start ticks are combined with `boot_id`.
- Windows identity probes cost ~1–2 s (PowerShell start) → batch orphan checks at startup.
- Verified with real processes on Windows 11 and Ubuntu 26.04 (WSL2). macOS code paths are unit-tested with injected dependencies only; a real macOS run follows with the CI matrix (US-008).

## Test Coverage
- Coverage (Windows run): **84.3 % lines**, 82.7 % statements, 70.6 % branches, 81.6 % functions (POSIX-only branches are additionally exercised by the real-process tests on Linux)
- Test files: `spikes/s3/test/killTree.test.ts` (real process trees), `spikes/s3/test/posix.test.ts` (POSIX logic and identity parsers, any OS), `spikes/s3/test/processTree.test.ts`, `spikes/s3/test/docs.test.ts`
- 17 tests; Windows: 16 passed, 1 POSIX-only skipped; Linux: all 16 non-doc tests passed
