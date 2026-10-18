---
id: US-013
title: Gate AI features with capabilities (limited mode)
status: done
size: S
epic: Setup & configuration
---

## Business Value
Keeps SpecForge usable without a working agent while clearly disabling AI functions (FR-074, ADR-018).

## Description
As a **SpecForge user who skipped setup**, I want **to use manual planning features while AI features are clearly disabled** so that **I can work now and complete setup later**.

## Acceptance Criteria
- [x] AC-1: SetupService publishes `Capabilities` (agentAvailable, providerConfigured, gitAvailable) after each health check (startup, settings change, on demand).
- [x] AC-2: All AI actions (generate, quality check, refine, chat, move to In Progress) are disabled with an explanatory tooltip when capabilities are missing; services reject with `CapabilityMissing`.
- [x] AC-3: A persistent banner "AI functions disabled — complete setup" opens the wizard at the first incomplete step.
- [x] AC-4: Capability loss during active runs does not stop them; new AI actions are blocked immediately.

## Technical Notes
- Related design document: `spec/03_design/technical_design/c4_architecture.md` — ADR-018
- Related design document: `spec/03_design/functional_design/use_cases.md` — UC-038
- Related requirements: FR-074, NFR-017
- Release: R1

## Dependencies
- US-012 First-start setup wizard

## Implementation Details
Files created / modified:
- `packages/application/src/setup/setup-service.ts` — `Capabilities` (agentAvailable, providerConfigured, gitAvailable, aiAvailable, missing), `checkCapabilities()` (health check, listeners notified on change), `aiDisabledReason()`, `requireAi()` / `CapabilityMissingError`; the agent probe asks the adapter (`detect()`, `requiresProvider`)
- `packages/application/src/ports/agent-adapter.ts` — `AgentCapabilities.requiresProvider` (MockAdapter: false)
- `packages/application/src/board/board-service.ts`, `specs/spec-run-service.ts` — moves to In Progress and specification runs are refused with the reason while AI is disabled
- `packages/core/src/composition.ts` — capabilities checked at startup, after provider save / connection test / setup finish or skip and on demand (`capabilities.refresh`); `capabilities.get`; event `capabilities.changed`
- `packages/ui/src/App.tsx` — persistent banner "AI functions disabled — complete setup" opening the wizard at the first incomplete step (`SetupWizard` `startAtFirstIncomplete`); `KanbanBoard` / `StoryCard` (In Progress option and column disabled with tooltip), `GeneratePanel` (Generate disabled with tooltip)

Decisions / deviations:
- Without an agent adapter (the running app until US-045) AI functions are disabled, so moving stories to In Progress is refused up front instead of failing the run afterwards.
- Capability loss never stops active runs (AC-4); only new AI actions are blocked.
- Chat, quality check and refine do not exist yet; they will use the same gate.

## Test Coverage
- Coverage: `setup-service.ts` 100.0 % lines, `board-service.ts` 100.0 %, `App.tsx` 90.6 % (workspace total 96.6 % lines)
- Test files: `packages/application/test/setup-service.test.ts` (4 new), `packages/application/test/board-service.test.ts` (1 new), `packages/application/test/spec-run-service.test.ts` (1 new), `packages/core/test/capabilities-ipc.test.ts` (2), `packages/ui/test/capabilities.test.tsx` (4)
- 12 tests
