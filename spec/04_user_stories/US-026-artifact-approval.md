---
id: US-026
title: Approve artifacts (Draft / Approved)
status: done
size: S
epic: Specification phases
---

## Business Value
Ensures AI output never becomes binding without explicit human approval (FR-013).

## Description
As a **SpecForge user**, I want **to approve artifacts explicitly and see which are still drafts** so that **only reviewed specs drive downstream work**.

## Acceptance Criteria
- [x] AC-1: Artifacts show a Draft/Approved badge; *Approve* writes `approval: approved` and `approved_at`.
- [x] AC-2: Any AI change sets `approval: draft`.
- [x] AC-3: Generating from Draft inputs shows a confirmation warning.

## Technical Notes
- Related design document: `spec/03_design/functional_design/use_cases.md` — UC-007
- Related requirements: FR-013
- Release: R1

## Dependencies
- US-025 View and edit artifacts

## Implementation Details
Files created / modified:
- `packages/application/src/specs/approval-service.ts` — `ApprovalService.approve` (writes `approval: approved` + `approved_at`), `markDraftAfterAiChange` (sets `approval: draft`, removes `approved_at`, records `generated_by`), `check` / `generationInputCheck` (Draft inputs per generation target: intent → requirements → design → epics/stories → test concepts)
- `packages/ipc-contract/src/contract.ts` — `artifact.approve`, `artifacts.generationCheck`
- `packages/ui/src/specs/ArtifactEditor.tsx` — Draft/Approved badge and *Approve* (disabled while there are unsaved changes); `SpecificationsArea.tsx` — approve and reload
- `packages/ui/src/specs/DraftInputsConfirm.tsx` — confirmation dialog before generating from Draft inputs

Decisions / deviations:
- AC-2 and AC-3 concern specification runs, which arrive with US-027: `markDraftAfterAiChange` is the hook US-027 calls for the files a run changed, and the Generate actions use `artifacts.generationCheck` + `DraftInputsConfirm`. Both are implemented and tested; there is no AI writer and no Generate button in the app yet.

## Test Coverage
- Coverage: `approval-service.ts` 100.0 % lines, `DraftInputsConfirm.tsx` 100.0 %, `ArtifactEditor.tsx` 94.4 % (workspace total 97.3 % lines)
- Test files: `packages/application/test/approval-service.test.ts` (4), `packages/core/test/artifacts-ipc.test.ts` (2 new), `packages/ui/test/approval.test.tsx` (4), `packages/ui/test/app.test.tsx` (1)
- 11 tests
