---
id: US-053
title: Permission prompts, pending decisions and notifications
status: done
size: M
epic: Agent execution
---

## Business Value
Lets users answer agent requests quickly, even with several runs in parallel (FR-032, FR-033, FR-056).

## Description
As a **SpecForge user**, I want **clear permission prompts and one place listing everything waiting for me** so that **runs don't stall unnoticed**.

## Acceptance Criteria
- [x] AC-1: Prompts show story, run, tool, arguments, working directory and an *Outside workspace* flag; actions Allow / Deny (with message) / Always allow for this project (not for outside-workspace).
- [x] AC-2: Pending-decisions panel lists permission requests, stories in Review, failed/interrupted runs, blocked queue items and recommendations, grouped by story/run.
- [x] AC-3: OS notification when the window is unfocused; in-app toasts for completion and failures.

## Technical Notes
- Related design document: `spec/03_design/functional_design/user_flows.md` — uf-05-watching-runs-and-answering-permission-prompts
- Related design document: `spec/03_design/functional_design/use_cases.md` — UC-020
- Related design document: `spec/03_design/functional_design/use_cases.md` — UC-027
- Related requirements: FR-023, FR-032, FR-033, FR-056
- Release: R1

## Dependencies
- US-052 Permission broker and policy evaluation
- US-022 Application shell and primary navigation

## Implementation Details
Files created / modified:
- `packages/application/src/pending/pending-decisions.ts` — `pendingDecisions` (permission requests, failed/interrupted runs, blocked queue items, reviews, recommendations; grouped by story or run, ordered by urgency), `pendingCount`
- `packages/application/src/permissions/always-allow.ts` — `alwaysAllowRule` (project rule for the tool — shell tools: the command — and the run kind's bucket; refused for outside-workspace actions and compound commands); `permission-broker.ts` — pending requests carry the run kind; `packages/domain/src/permissions/policy.ts` — `hasShellOperators`, `SHELL_TOOL_NAMES`
- `packages/ipc-contract/src/contract.ts` — `pending.list`, `permission.decide`; events `permission.requested`, `run.finished`, `pending.changed`; `shell.state.pendingDecisions` is the real count
- `packages/ui/src/pending/PermissionPrompt.tsx`, `PendingDecisionsPanel.tsx` (drawer from the top-bar counter), `Toasts.tsx`; `App.tsx` subscribes to the events, shows toasts and asks main for an OS notification when the window is unfocused and notifications are enabled
- `packages/main/src/notifications.ts`, `main.ts`, `preload.cts` — OS notification (plain text, length-limited, only for the app page)

Decisions / deviations:
- Recommendations are listed as soon as structured run results provide them (US-051); until then that source is empty.
- In the running app no agent run requests permissions yet (Claude Code adapter US-045); the flow is verified end to end against the MockAdapter in the core tests.

## Test Coverage
- Coverage: `pending-decisions.ts` 100.0 % lines, `always-allow.ts` 100.0 %, UI 100.0 %, `notifications.ts` 100.0 % (workspace total 97.3 % lines)
- Test files: `packages/application/test/pending-decisions.test.ts` (3), `packages/application/test/always-allow.test.ts` (3), `packages/core/test/pending-ipc.test.ts` (2, MockAdapter), `packages/ui/test/pending-decisions.test.tsx` (6), `packages/ui/test/app-notifications.test.tsx` (2), `packages/main/test/notifications.test.ts` (2)
- 18 tests
