---
id: US-045
title: Implement the Claude Code adapter
status: in progress
size: M
epic: Agent execution
---

## Business Value
Connects SpecForge to the user's Claude Code installation for real runs (FR-029).

## Description
As a **SpecForge user**, I want **SpecForge to run Claude Code for my stories and spec generation** so that **I never have to invoke the CLI manually**.

## Acceptance Criteria
- [x] AC-1: Adapter maps Agent SDK messages to adapter events (session id, output, tool use/results, usage, final result) per the ADR-006 mapping.
- [x] AC-2: `canUseTool` routes to the PermissionBroker and awaits the decision without timeout; abort and resume work as specified.
- [x] AC-3: Provider credentials are injected only into the agent environment; `--bare`-like modes are not used.
- [ ] AC-4: Contract test suite passes against the real adapter (opt-in, requires credentials) on all three OSes.

## Technical Notes
- Related design document: `spec/03_design/technical_design/service_design.md` — agentadapter-claudecodeadapter
- Related design document: `spec/03_design/technical_design/c4_architecture.md` — ADR-006
- Related requirements: FR-029, FR-034, FR-045; ADR-006, ADR-007
- Implements the outcome of spike US-001.
- Release: R1

## Dependencies
- US-001 Spike S1: validate Claude Code integration via Agent SDK
- US-044 Define AgentAdapter port and MockAdapter
- US-011 Store secrets in OS credential store and redact them

## Implementation Details
Status **in progress**: AC-1–AC-3 implemented and tested; AC-4: the live contract suite passes on Windows (6/6, 2026-10-19); macOS/Linux run via the manual workflow `claude-adapter-live` (needs the `ANTHROPIC_API_KEY` secret).

Files created / modified:
- `packages/adapters/agent-claude-code/src/adapter.ts` — `ClaudeCodeAdapter`: one Agent SDK `query()` per run with the user's verified executable (`pathToClaudeCodeExecutable`), `permissionMode: 'default'`, `settingSources: []`, preset system prompt + append, model/maxTurns/resume; SDK messages → adapter events; `canUseTool` → `onPermission` without timeout (abort denies); cancel via `AbortController`; own process spawn exposes the pid (tree-kill fallback); agent environment = core environment without provider/login variables + the configured provider variables
- `packages/core/src/composition.ts`, `main.ts` — `claudeCode` option: the adapter runs with the executable verified in Settings → Agent runtime; AI is available once that executable and a provider are configured
- `pnpm-workspace.yaml` — the SDK's per-platform packages (bundled Claude Code binary) are never installed (`ignoredOptionalDependencies`)
- `packages/adapters/agent-claude-code/test/contract.live.test.ts` — opt-in live contract suite (`SPECFORGE_LIVE_CLAUDE=1`); `.github/workflows/claude-live.yml` (`claude-adapter-live`) — manual run on all three OSes
- Cancel ends the agent's children too: the adapter snapshots the agent's descendants before aborting and kills the survivors afterwards (the bundled file search outlived the aborted agent and kept the test process alive); `packages/application/src/execution/execution-service.ts` registers the agent pid once the adapter knows it (the SDK spawns the process after `start`)

Decisions / deviations:
- Product-owner decision 2026-10-18: US-045 started before US-001 is done (S1 verified on Windows).
- The SDK (`@anthropic-ai/claude-agent-sdk` ~0.3.302) is proprietary ("SEE LICENSE"): license check lists it for review; whether its JavaScript may be bundled into installers must be confirmed before US-009.

## Test Coverage
- Unit tests: `packages/adapters/agent-claude-code/test/adapter.test.ts` (12, fake SDK `query()`; mutation check: 9/9 mutants killed), `packages/core/test/capabilities-ipc.test.ts` (1 new)
- Live: `contract.live.test.ts` (6 contract tests, opt-in) — Windows 6/6 passed (142 s); macOS/Linux pending
- `packages/application/test/execution-service.test.ts` (1 new: late pid), adapter cancel test (1 new)
