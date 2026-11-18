---
id: US-001
title: Spike S1: validate Claude Code integration via Agent SDK
status: done
size: L
epic: Foundation & spikes
---

## Business Value
De-risks the most critical technical assumption (ADR-006): that SpecForge can drive the user's Claude Code headlessly with live permission relay, cancel and resume on all three OSes. All agent-related stories depend on the outcome.

## Description
As a **SpecForge developer**, I want **a throwaway prototype proving streaming, permission relay, abort and resume with the Agent SDK against a locally installed Claude Code** so that **we can confirm or replace ADR-006 before building on it**.

## Acceptance Criteria
- [x] AC-1: Prototype calls `query()` with `pathToClaudeCodeExecutable` pointing to a user-installed Claude Code and streams assistant/tool messages to the console with the session id. _(verified on Windows 2026-10-14; macOS/Linux pending CI)_
- [x] AC-2: `canUseTool` blocks a tool call for at least 10 minutes while waiting for a simulated human decision; allow and deny both reach the agent correctly. _(verified on Windows 2026-10-14; macOS/Linux pending CI)_
- [x] AC-3: Aborting via `abortController` stops the agent and all child processes within 10 s. _(verified on Windows 2026-10-14; macOS/Linux pending CI)_
- [x] AC-4: Resuming with the stored session id in the same cwd continues the conversation with prior context. _(verified on Windows 2026-10-14; macOS/Linux pending CI)_
- [x] AC-5: Verified that user/project Claude settings with permissive allow rules cannot bypass the relay (or the required setting-source configuration is documented). _(verified on Windows 2026-10-14; macOS/Linux pending CI)_
- [x] AC-6: Results for Windows, macOS and Linux are documented in `docs/spikes/S1-claude-code-adapter.md` with a go/no-go recommendation for ADR-006 (fallback: CLI + PreToolUse hook). _(all three OSes verified; macOS/Linux 2026-11-17, workflow `spike-s1-live` run 44196800695)_

## Technical Notes
- Related design document: `spec/03_design/technical_design/c4_architecture.md` — ADR-006
- Related design document: spec/03_design/technical_design/technical_decisions.md §9
- Related requirements: FR-028, FR-029, FR-032, FR-034, FR-045; ADR-006, ADR-007, ADR-013
- Use an Anthropic API key from the environment (ADR-007); never log it.
- Prototype code lives under `spikes/s1/` and is not production code.
- Release: R1

## Dependencies
- None

## Implementation Details
Status **done**: AC-1–AC-6 verified live on Windows (2026-10-14), macOS and Linux (2026-11-17); ADR-006 confirmed. Product-owner decision 2026-11-18: the remaining condition (a completed live call with an API key, ADR-007) moves to US-066 AC-4.

Files created:
- `spikes/s1/package.json`, `package-lock.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore` — standalone throwaway spike package (npm; the pnpm monorepo follows in US-004)
- `spikes/s1/src/executable.ts` — resolves the real Claude Code executable from npm `.cmd` shims / symlinks; PATH lookup
- `spikes/s1/src/broker.ts` — `DecisionBroker`: holds permission requests without timeout, abort → deny, audit log (prototype of PermissionBroker)
- `spikes/s1/src/mapper.ts` — maps Agent SDK messages to vendor-neutral adapter events (ADR-008)
- `spikes/s1/src/runner.ts` — `startRun()` wrapping `query()` with `pathToClaudeCodeExecutable`, `permissionMode: 'default'`, `settingSources`, `canUseTool` → broker, `abortController`, `resume`
- `spikes/s1/src/processTree.ts` — cross-platform process-tree listing (excludes the probe by PID)
- `spikes/s1/src/record.ts` — records live outcomes to `spikes/s1/results/live-<platform>.json`
- `spikes/s1/scripts/diag.ts` — diagnostic script printing all events and the process tree for a scenario
- `spikes/s1/results/live-win32.json`, `live-darwin.json`, `live-linux.json` — evidence per OS
- `.github/workflows/spike-s1.yml` — manually triggered live run on macOS/Linux; input `auth`: `subscription` (secret `CLAUDE_CODE_OAUTH_TOKEN`, default) or `api-key` (secret `ANTHROPIC_API_KEY`)
- `docs/spikes/S1-claude-code-adapter.md` — results, findings and recommendation (**Go** for ADR-006; confirmed on all three OSes, API-key live check in US-066)

Decisions / deviations:
- Windows live run authenticated with the developer's local Claude Code login (developer-only exception agreed with the product owner). macOS/Linux CI runs authenticated with the developer's subscription token (product-owner decision 2026-11-17, same exception; API credit not used).
- Fixes found by the macOS/Linux runs (2026-11-17): unit tests compare real temp paths (macOS `/var` → `/private/var`); AC-3 recognises the Node grandchild as `MainThread` on Linux (recent Node names its main thread, which `ps -o comm` reports).
- Live tests use the default model (product-owner choice); sessions cost ≈ $0.03–$0.14.
- Key findings for the design: resolve npm shims; always set `permissionMode: 'default'`; use `settingSources: []` and supply project instructions via ContextAssembler; Windows agents use a PowerShell tool instead of Bash (approval-rule suggestions must cover both); abort finished in 8.5 s on Windows (≈ 2.5 s on macOS/Linux), so keep the tree-kill fallback; process-tree code must use PIDs, not names.

## Test Coverage
- Coverage (unit tests, `spikes/s1/src`): **91.4 % lines**, 89.3 % statements, 77.6 % branches, 92.3 % functions
- Unit tests: `spikes/s1/test/executable.test.ts`, `broker.test.ts`, `mapper.test.ts`, `processTree.test.ts`, `runner.test.ts`, `record.test.ts`, `docs.test.ts` — 28 passing (+1 POSIX-only skipped on Windows)
- Live acceptance tests: `spikes/s1/test/live.test.ts` — 6 scenarios (AC-1, AC-2 allow after 10 min, AC-2 deny, AC-3, AC-4, AC-5), all passing on Windows, macOS and Linux; run with `npm run test:live`
- Tests written for this story: 35
