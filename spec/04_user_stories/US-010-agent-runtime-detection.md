---
id: US-010
title: Detect and verify the Claude Code runtime
status: done
size: S
epic: Setup & configuration
---

## Business Value
Lets users point SpecForge at their Claude Code installation with automatic detection and validation (FR-048).

## Description
As a **SpecForge user**, I want **SpecForge to find my Claude Code installation and tell me if it is usable** so that **I don't have to configure paths manually**.

## Acceptance Criteria
- [x] AC-1: Detection checks PATH and per-OS common install locations and returns path and version.
- [x] AC-2: A manually entered path is verified (executable runs, version ≥ configured minimum); invalid paths show a specific error.
- [x] AC-3: Result is stored in `agent_runtime` and exposed via IPC `runtime.detect` / `runtime.verify`.

## Technical Notes
- Related design document: `spec/03_design/functional_design/use_cases.md` — UC-025
- Related design document: `spec/03_design/technical_design/service_design.md` — settingsservice
- Related requirements: FR-048
- Release: R1

## Dependencies
- US-006 Implement typed, validated IPC contract
- US-007 Set up SQLite persistence with migrations

## Implementation Details
Files created / modified:
- `packages/adapters/agent-claude-code/src/runtime.ts` — `detectClaudeCode` (PATH + per-OS install locations, npm `.cmd` shims resolved), `verifyClaudeCode` (runs `--version`; specific errors `not_found` / `not_runnable` / `not_claude_code` / `too_old`), `parseClaudeVersion`, `compareVersions`, `DEFAULT_MIN_VERSION = 2.1.0`
- `packages/adapters/sqlite/src/agent-runtime-repository.ts` + migration 6 (`agent_runtime`)
- `packages/ipc-contract/src/contract.ts` — commands `runtime.detect`, `runtime.verify`; `ContractHandlers` is `Partial` (a missing handler answers `NOT_IMPLEMENTED`)
- `packages/core/src/handlers/runtime-handlers.ts` — `createRuntimeHandlers` (stores every result)

Decisions / deviations:
- Path logic uses `path.win32` / `path.posix` explicitly so all OS variants are tested on any host.

## Test Coverage
- Coverage: `runtime.ts` 98.1 % lines, `agent-runtime-repository.ts` 100.0 %, `runtime-handlers.ts` 100.0 % (workspace total 98.2 % lines)
- Test files: `packages/adapters/agent-claude-code/test/runtime.test.ts` (9, incl. table tests), `packages/core/test/runtime-ipc.test.ts` (4)
- 13 tests
