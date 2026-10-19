---
id: US-006
title: Implement typed, validated IPC contract
status: done
size: M
epic: Foundation & spikes
---

## Business Value
Gives UI and core a single, type-safe contract with runtime validation (ADR-015), preventing malformed messages and drift between processes.

## Description
As a **SpecForge developer**, I want **commands, queries and events defined once as zod schemas and validated on both sides** so that **cross-process calls are type-safe and robust**.

## Acceptance Criteria
- [x] AC-1: `ipc-contract` package exposes command, query and event definitions as zod schemas with inferred types.
- [x] AC-2: Both renderer and core reject messages failing validation with a typed error; tests cover a malformed payload.
- [x] AC-3: A contract version is exchanged on connect; a mismatch shows a clear error.
- [x] AC-4: Event subscriptions support batching (≤ 50 ms) for high-frequency streams.

## Technical Notes
- Related design document: `spec/03_design/technical_design/c4_architecture.md` — ADR-015
- Related requirements: NFR-002, NFR-001
- Release: R1

## Dependencies
- US-005 Create hardened Electron shell with three-process layout

## Implementation Details
Files created / modified:
- `packages/ipc-contract/src/contract.ts` — `CONTRACT_VERSION`, commands (`system.ping`), queries (`system.info`), events (`run.output`) as zod schemas with inferred types (`CommandInput`, `QueryOutput`, `EventPayload`, `ContractHandlers`, …)
- `packages/ipc-contract/src/protocol.ts` — `serveContract()` (core side: handshake, request validation and dispatch, validated and batched events ≤ 50 ms), `connectClient()` (UI side: version handshake with timeout, validated commands/queries, `subscribe()` with per-batch callback), `IpcError` / `IpcValidationError`, transport-neutral `PortLike`
- `packages/ipc-contract/tsconfig.json` (DOM lib for timers in both environments), dependency `zod` 4

Decisions / deviations:
- Delivered as a tested library; wiring it into the renderer follows with the Vite build in the UI stories (US-022), because the renderer currently loads ES modules from `file://` without a bundler and cannot import npm packages. The shell's ping/pong (US-005) stays until then.
- Major-version mismatch produces: "Incompatible SpecForge components: UI contract …, core contract …. Please restart or reinstall SpecForge."

## Test Coverage
- Coverage (`packages/ipc-contract/src`): **99 % lines**, 96.4 % statements, 84.6 % branches, 100 % functions
- Test file: `packages/ipc-contract/test/ipc.test.ts` (real `MessageChannel`s)
- 12 tests
