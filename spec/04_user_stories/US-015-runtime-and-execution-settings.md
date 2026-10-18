---
id: US-015
title: Configure agent and execution settings
status: done
size: M
epic: Setup & configuration
---

## Business Value
Allows users to tune model, parameters, environment, timeouts and logging (FR-049, FR-052).

## Description
As a **SpecForge user**, I want **to configure model, execution parameters, environment variables, timeouts and log retention** so that **agent runs behave the way my project needs**.

## Acceptance Criteria
- [x] AC-1: Agent runtime settings: model (from capabilities), effort/parameters, environment variables with a secret toggle (stored in vault, shown as ••••).
- [x] AC-2: Execution defaults: max run duration, idle timeout, notifications on/off, log retention and verbosity; changes apply to the next run.
- [x] AC-3: Log retention removes logs older than the configured days at startup.
- [x] AC-4: Project overrides of agent settings take precedence and are visible in the run record's configuration snapshot.

## Technical Notes
- Related design document: `spec/03_design/functional_design/user_flows.md` — uf-08-settings
- Related design document: `spec/03_design/functional_design/use_cases.md` — UC-026
- Related requirements: FR-049, FR-052
- Release: R1

## Dependencies
- US-010 Detect and verify the Claude Code runtime
- US-011 Store secrets in OS credential store and redact them

## Implementation Details
Files created / modified:
- `packages/domain/src/settings/agent-settings.ts` — `effectiveAgentSettings` (project overrides per field, env merged by name), validation of agent settings and execution defaults, `DEFAULT_EXEC_DEFAULTS`
- `packages/application/src/settings/settings-service.ts` — `SettingsService` (view with masked secrets, `saveAgent` global/project with secret env vars stored via `SecretStore` and kept as references, `saveExec`, `snapshot`, `resolveEnv`)
- `packages/adapters/sqlite/src/settings-repository.ts` + migration 9 (`app_setup`, `project_settings`)
- `packages/core/src/secret-bridge.ts`, `packages/main/src/secret-bridge.ts` — secrets are stored by main's `SecretVault` (safeStorage) on request of the core over the parent port
- `packages/core/src/log-retention.ts` — `pruneLogs` at startup with the configured retention
- Run configuration snapshot: `SchedulingContext.configSnapshot` → `run.config_snapshot`; `runs.list` query
- `packages/ui/src/settings/AgentSettingsForm.tsx`, `ExecDefaultsForm.tsx`, `SettingsArea.tsx` (with US-014's effective rules)

Decisions / deviations:
- Global agent defaults are stored in `app_setup.agent_defaults` (not `agent_runtime.default_config`) so they can be set before a runtime is detected; data model updated.
- Model suggestions come from the runtime's stored capabilities (empty until the Claude Code adapter, US-045, reports them); any model name can be entered.
- "Applies to the next run": the snapshot is taken when the scheduler creates a run.

## Test Coverage
- Coverage: `agent-settings.ts` 100.0 % lines, `settings-service.ts` 100.0 %, `settings-repository.ts` 100.0 %, `log-retention.ts` 100.0 %, secret bridges 100.0 %, settings UI 96.3 % (workspace total 97.4 % lines)
- Test files: `packages/domain/test/agent-settings.test.ts` (4), `packages/application/test/settings-service.test.ts` (7), `packages/adapters/sqlite/test/settings.test.ts` (1 of 2), `packages/core/test/settings-ipc.test.ts` (4), `packages/core/test/secret-bridge.test.ts` (3), `packages/main/test/secret-bridge.test.ts` (2), `packages/ui/test/settings-forms.test.tsx` (4), `packages/ui/test/app.test.tsx` (2)
- 27 tests
