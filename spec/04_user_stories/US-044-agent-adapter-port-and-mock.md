---
id: US-044
title: Define AgentAdapter port and MockAdapter
status: done
size: M
epic: Agent execution
---

## Business Value
Decouples the core from any vendor and enables deterministic end-to-end tests (FR-028, NFR-022).

## Description
As a **SpecForge developer**, I want **a vendor-neutral adapter interface with a scripted mock implementation** so that **the whole workflow can be built and tested without a real agent**.

## Acceptance Criteria
- [x] AC-1: `AgentAdapter` port (detect, verify, start → events, permission callback, sessionId, done, cancel, resume, capabilities) defined in `application`.
- [x] AC-2: MockAdapter scripts output, tool events, permission asks, file edits in cwd, structured results, failures and hangs.
- [x] AC-3: Shared adapter contract test suite runs against the MockAdapter.
- [x] AC-4: Core code contains no Claude-specific references outside the Claude Code adapter package (dependency-cruiser rule).

## Technical Notes
- Related design document: `spec/03_design/technical_design/c4_architecture.md` — ADR-008
- Related design document: `spec/03_design/technical_design/service_design.md` — agentadapter-mockadapter
- Related requirements: FR-028, NFR-022
- Release: R1

## Dependencies
- US-004 Set up monorepo, tooling and layering rules

## Implementation Details
Files created / modified:
- `packages/application/src/ports/agent-adapter.ts` — vendor-neutral `AgentAdapter` port (capabilities, detect, verify, start → events, permission callback, sessionId, done, cancel, resume via `resumeSessionId`)
- `packages/agent-adapter-contract/` (new package `@specforge/agent-adapter-contract`) — reusable `describeAgentAdapterContract()` suite (session/output/completion, permission allow and deny, cancellation, resume)
- `packages/adapters/agent-mock/src/mock-adapter.ts` — scripted `MockAdapter` (output, tool events, permission asks, file writes confined to the run directory, usage, structured results, failures, hangs, delays, session memory for resume)
- `.dependency-cruiser.cjs` — new rule `agent-sdk-only-in-claude-adapter`; fixtures in `tooling/test/fixtures/layering/`
- `vitest.config.ts` — workspace packages resolve to their sources in tests
- `tsconfig.json` (project references), `packages/adapters/agent-mock/package.json`, `tsconfig.json` (Node types)

Decisions:
- The contract suite lives in its own package so the Claude Code adapter (US-045) runs exactly the same tests.
- The MockAdapter refuses writes outside the run directory, mirroring workspace confinement (NFR-008).

## Test Coverage
- Coverage (`packages/adapters/agent-mock/src`): **93.4 % lines**, 90.7 % statements, 78.6 % branches, 95 % functions
- Test files: `packages/adapters/agent-mock/test/mock-adapter.test.ts` (AC-2 + contract run, AC-3), `tooling/test/monorepo.test.ts` (AC-4)
- 18 tests (10 MockAdapter, 6 contract, 2 layering)
