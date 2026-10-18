---
id: US-014
title: Manage global and project approval rules
status: done
size: M
epic: Setup & configuration
---

## Business Value
Lets users decide which tools may run without prior approval, globally and per project (FR-051, ADR-019).

## Description
As a **SpecForge user**, I want **to define default and project-specific allow/deny rules for agent actions** so that **I get fewer prompts for safe actions while staying in control**.

## Acceptance Criteria
- [x] AC-1: Rules have scope (global/project), effect, tool, pattern and appliesTo; effective rules = global (minus project-disabled) + project rules; deny beats allow.
- [x] AC-2: Suggested rules (read/search, edit inside run workspace, detected test/build commands) are offered unticked; enabling one creates a global or project rule.
- [x] AC-3: Settings show effective rules with their origin; a project can disable a global rule.
- [x] AC-4: Domain unit tests cover precedence, appliesTo filtering by run kind and the "outside workspace is never rule-decided" rule.

## Technical Notes
- Related design document: `spec/03_design/technical_design/c4_architecture.md` — ADR-019
- Related design document: `spec/03_design/technical_design/c4_architecture.md` — ADR-013
- Related design document: `spec/03_design/technical_design/data_model.md`
- Related requirements: FR-051, NFR-007, NFR-008
- Release: R1

## Dependencies
- US-006 Implement typed, validated IPC contract
- US-007 Set up SQLite persistence with migrations

## Implementation Details
Files created / modified:
- `packages/domain/src/permissions/policy.ts` — `effectiveRules` (global minus project-disabled + project), `decidePermission` (deny beats allow; allow rules never match commands with shell operators; outside-workspace requests are always relayed; connection tests deny), `runKindBucket`
- `packages/application/src/permissions/rule-suggestions.ts` — `detectProjectCommands`, `suggestRules` (unticked; Bash and PowerShell variants), `enableSuggestion`
- `packages/adapters/sqlite/src/permission-rule-repository.ts` + migration 5 (`permission_rule`, `project_rule_override`)
- `packages/ipc-contract/src/contract.ts` — query `rules.effective`, command `rules.setGlobalDisabled`
- `packages/core/src/handlers/rule-handlers.ts` — `createRuleHandlers`
- `packages/ui/src/settings/EffectiveRules.tsx` — effective rules table with origin and a per-project toggle for global rules

Decisions / deviations:
- Rule matching for shell tools is by command prefix; a command containing `;`, `&&`, `|`, redirections or substitutions never matches an allow rule (it is relayed instead).

## Test Coverage
- Coverage: `policy.ts` 100.0 % lines, `rule-suggestions.ts` 100.0 %, `permission-rule-repository.ts` 100.0 %, `rule-handlers.ts` 100.0 %, `EffectiveRules.tsx` 100.0 % (workspace total 98.2 % lines)
- Test files: `packages/domain/test/permission-policy.test.ts` (11), `packages/application/test/rule-suggestions.test.ts` (3), `packages/adapters/sqlite/test/permission-rules.test.ts` (4), `packages/core/test/settings-and-dependencies-ipc.test.ts` (1 of 2), `packages/ui/test/effective-rules.test.tsx` (3)
- 22 tests
