---
id: US-012
title: First-start setup wizard
status: done
size: M
epic: Setup & configuration
---

## Business Value
Guides new users to a working configuration on first launch (FR-073, NFR-029).

## Description
As a **new SpecForge user**, I want **a step-by-step setup that configures agent runtime, provider credentials, Git, defaults and approval rules** so that **I can start working without reading documentation**.

## Acceptance Criteria
- [x] AC-1: On first start (no completed setup) the wizard opens with steps: runtime, AI provider, Git, approval rules, execution defaults, summary; each shows OK/warning/missing.
- [x] AC-2: AI provider step stores an API key or cloud-provider configuration via the secret vault and runs a connection test run with a clear success/error result.
- [x] AC-3: Finishing records `app_setup.setup_state = complete`; the next start opens the start wizard directly.
- [x] AC-4: Every step and the whole setup can be skipped; skipping records `incomplete`.

## Technical Notes
- Related design document: `spec/03_design/functional_design/use_cases.md` — UC-028
- Related design document: `spec/03_design/functional_design/user_flows.md` — uf-01-first-launch--setup-wizard
- Related design document: `spec/03_design/technical_design/service_design.md` — setupservice
- Related requirements: FR-073, NFR-029
- Approval-rule step uses US-014.
- Release: R1

## Dependencies
- US-010 Detect and verify the Claude Code runtime
- US-011 Store secrets in OS credential store and redact them
- US-014 Manage global and project approval rules

## Implementation Details
Files created / modified:
- `packages/application/src/setup/setup-service.ts` — `SetupService` (step status runtime / provider / Git / rules / defaults / summary as ok / warning / missing / skipped; `saveProvider` for Anthropic API key, Bedrock, Vertex AI, Foundry with secrets in the vault; `testConnection`; `skipStep`, `complete`, `skipSetup`), `runConnectionTest` (tiny `connection_test` run, all tools denied, 60 s timeout)
- `packages/adapters/sqlite/src/settings-repository.ts` — setup state, step outcomes, provider configuration (migration 9)
- `packages/ipc-contract/src/contract.ts` — `setup.state`, `setup.saveProvider`, `setup.testConnection`, `setup.ruleSuggestions`, `setup.enableRules`, `setup.skipStep`, `setup.complete`, `setup.skip`
- `packages/core/src/composition.ts` — setup wiring; suggested global rules (US-014) from common test/build/Git read commands
- `packages/ui/src/setup/SetupWizard.tsx` — full-window wizard with step list and status, runtime re-check / verify, provider forms with connection test, rules checklist (unticked), execution defaults, summary + *Finish*, *Skip this step*, *Skip setup* with confirmation; `App.tsx` shows it while setup is `not_started`; *Run setup again* in Settings

Decisions / deviations:
- The connection test runs through the AgentAdapter port; in the app no adapter is available until the Claude Code adapter (US-045, blocked by spike US-001), so the test reports "No agent adapter is available to run the connection test yet." Tested against the MockAdapter.
- Limited mode after skipping (capability gating) is US-013; this story records `incomplete`.

## Test Coverage
- Coverage: `setup-service.ts` 100.0 % lines, `SetupWizard.tsx` 92.2 % (workspace total 97.4 % lines)
- Test files: `packages/application/test/setup-service.test.ts` (8), `packages/core/test/connection-test.test.ts` (2, MockAdapter), `packages/core/test/setup-ipc.test.ts` (2, incl. restart), `packages/adapters/sqlite/test/settings.test.ts` (1 of 2), `packages/ui/test/setup-wizard.test.tsx` (10), `packages/ui/test/app.test.tsx` (2), `packages/main/test/setup-and-specs.e2e.test.ts` (1, Electron e2e: first start → Finish → next start opens the start wizard)
- 26 tests
