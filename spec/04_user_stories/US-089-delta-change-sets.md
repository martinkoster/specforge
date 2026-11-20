---
id: US-089
title: Delta generation as reviewable change sets
status: done
size: M
epic: Feature workflow
---

## Business Value
Approved specifications change only through focused, reviewable diffs scoped by the confirmed impact (FR-107, ADR-021).

## Description
As a **SpecForge user**, I want to **let the agent propose delta requirements and design as a change set I can review item by item** so that **I accept exactly the changes I want without regenerating approved documents**.

## Acceptance Criteria
- [x] AC-1: *Generate delta* in the Requirements (delta) and Design (delta) phases starts a `generate` run on a scratch copy of the target folder (ADR-021), with only the confirmed impact items and the feature intent as scope.
- [x] AC-2: The run's result is stored as a `change_set` with `change_item`s: *new* (next free ID), *modified* (diff of the element) and *deprecated* (marked `[DEPRECATED]` with reason — never deleted or renumbered); validation rejects reused IDs and deletions.
- [x] AC-3: The *Changes* tab shows the change set grouped by file with badges *New FR-118* / *Modified FR-034* / *Deprecated FR-020* and *Accept* / *Discard* per item and *Accept all*.
- [x] AC-4: Design deltas may propose new ADRs, which are created as *Proposed*.
- [x] AC-5: Discarding all items closes the change set without touching any file.

## Technical Notes
- Related design document: spec/03_design/functional_design/use_cases.md UC-045; user_flows.md UF-18; technical_design/c4_architecture.md ADR-021; data_model.md change_set
- Related requirements: FR-107
- Release: R2
- Extend the scripted test agent with delta generation (new + modified + deprecated item).

## Dependencies
- US-087 Feature impact: trace-based analysis and confirmation

## Implementation Details
Files created / modified:
- `packages/application/src/specs/delta.ts` (new) — `elementSections` (preamble + section per element heading), `nextFreeIds`, `splitDelta` (per file: *new* / *modified* / *deprecated* items with the section text before/after and a unified diff; changes outside element sections as one file-level item; validation: deleted elements or files and reused IDs are rejected; new ADRs get `**Status**: Proposed`)
- `packages/application/src/specs/delta-service.ts` (new) — `DeltaService.generate` (a `generate` run with write scope = the target folder, which is snapshotted first; prompt with the feature intent, the confirmed impact items with titles and paths, the next free IDs and the delta rules — `**Feature**: FI-x`, `Changed by FI-x`, `[DEPRECATED]`, no deletions/renumbering, ADRs Proposed); afterwards the changes are split into a change set, the folder is restored and re-indexed; impact flagging is suppressed for the folder meanwhile; `decide` (accept / discard), `acceptAll`, discarding every item closes the change set (no file touched), `view`, `state` (none / open / applied → feature stepper)
- `packages/adapters/sqlite/src/change-set-repository.ts` (new), `schema.ts` — migration 25 `change_set` / `change_item` (incl. section text before/after for applying, US-090); `index-repository.ts` — `elementPaths()`, the element-change callback carries the artifact path
- `packages/adapters/agent-mock/src/mock-adapter.ts` — `Edit` tool (unique string replacement after the permission relay)
- `packages/core/src/test-agent.ts` — delta behaviour (new element with the next free ID, modified and deprecated scoped elements via `Edit`; design delta: new ADR written as Accepted)
- `packages/ipc-contract/src/contract.ts` — `delta.generate`, `delta.decide`, `delta.acceptAll`, `delta.changeSet`, event `features.deltaUpdated`; `packages/core/src/composition.ts` — wiring, folder suppression of impact flags, feature stepper delta state
- `packages/ui/src/features/ChangesPanel.tsx` (new) — phase switch Requirements (delta) / Design (delta), *Generate delta* (disabled with the explanation in limited mode), progress, failure reason, change set grouped by file with badges *New FR-118* / *Modified FR-034* / *Deprecated FR-020* / *Other changes*, diff, *Accept* / *Discard* per item, *Accept all*; `FeaturePage.tsx` — Changes tab
- Also: `packages/ui/src/intent/AnalyzePanel.tsx` — a late `spec.reviewReady` event no longer reopens a kept review (root cause of the intermittent `analyze-codebase` test failure)

Decisions / deviations:
- The "scratch copy" of ADR-021 is the snapshotted target folder itself (ADR-014 mechanism); impact flags are suppressed for that folder while the run's temporary changes are on disk.
- The prompt names scoped elements with their title so agents can edit headings precisely.

## Test Coverage
- Coverage (lines): `delta.ts` 100 %, `change-set-repository.ts` 100 %, `test-agent.ts` 100 %, `ChangesPanel.tsx` 97.6 %, `delta-service.ts` 96.2 %, `mock-adapter.ts` 95.3 %, `FeaturePage.tsx` 92.1 %, `composition.ts` 91.5 %; overall 95.3 %
- Test files: `packages/application/test/delta.test.ts` (7, new), `packages/application/test/delta-service.test.ts` (6, new), `packages/adapters/sqlite/test/impact-flags.test.ts` (+1), `packages/adapters/agent-mock/test/mock-adapter.test.ts` (+1), `packages/core/test/test-agent.test.ts` (+1), `packages/core/test/delta-ipc.test.ts` (2, new: scripted agent, restored folder, no flags, Proposed ADR, discard all), `packages/ui/test/changes-panel.test.tsx` (2, new); `feature-page.test.tsx`, `analyze-codebase.test.tsx` adapted
- Full suite: 1266 passed; lint, build and layering green
- 20 new tests
