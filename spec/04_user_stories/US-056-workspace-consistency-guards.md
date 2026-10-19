---
id: US-056
title: Enforce workspace consistency rules
status: done
size: S
epic: Agent execution
---

## Business Value
Prevents conflicting writes between chat/spec runs and implementation runs and stale state from worktrees (FR-116).

## Description
As a **SpecForge user**, I want **SpecForge to prevent concurrent writes that would corrupt reviews** so that **diffs and restores are always correct**.

## Acceptance Criteria
- [x] AC-1: Non-git: an implementation run is queued with reason "waiting for workspace" while a writing chat/spec run is active, and starts after it ends.
- [x] AC-2: Non-git: chat/spec writes are denied while an implementation run is active.
- [x] AC-3: Agent edits to `spec/**` in worktrees are denied; worktrees are never indexed.

## Technical Notes
- Related design document: `spec/03_design/technical_design/service_design.md` — scheduler
- Related requirements: FR-116, FR-092
- Release: R1

## Dependencies
- US-042 Scheduler: queue, slots and automatic start
- US-052 Permission broker and policy evaluation

## Implementation Details
Files created / modified:
- `packages/core/src/scheduling.ts` / `packages/domain/src/scheduling/policy.ts` (existing) — non-git: implementation starts wait with reason `workspace` while a writing spec/chat run is active; `SpecRunService` posts `WorkspaceWriterChanged` at start and end so the waiting story starts afterwards
- `packages/domain/src/permissions/built-in-denies.ts` (existing) — non-git: chat/spec writes denied while an implementation run is active; implementation runs may not change `spec/**` / `.specforge/**`; `SpecRunService.start` refuses up front in non-git mode while an implementation run is active
- Worktrees live under `<appdata>/wt/…` outside the workspace (US-016 validation), so the indexer never sees them

Decisions / deviations:
- This story needed only wiring (`WorkspaceWriterChanged` from spec runs) and end-to-end verification; policy, scheduler and the board label "Waiting for workspace" existed from US-042/US-043/US-052.

## Test Coverage
- Coverage: `scheduling.ts` 100.0 % lines, `built-in-denies.ts` 100.0 %, `scheduler.ts` 100.0 % (workspace total 97.1 % lines)
- Test files: `packages/core/test/workspace-exclusion-ipc.test.ts` (3, MockAdapter, non-git and real Git)
- 3 tests
