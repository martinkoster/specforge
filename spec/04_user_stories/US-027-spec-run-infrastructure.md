---
id: US-027
title: Run specification generation through the agent adapter
status: done
size: L
epic: Specification phases
---

## Business Value
Provides the shared mechanism for all AI generation (requirements, design, epics, stories, refine, clarify) with safe, reviewable output (ADR-014).

## Description
As a **SpecForge user**, I want **AI generation to produce reviewable changes I can keep or discard** so that **I stay in control of every generated document**.

## Acceptance Criteria
- [x] AC-1: A specification run starts via the AgentAdapter in the main workspace with writes restricted to the target `spec/` subfolder (PermissionPolicy).
- [x] AC-2: The target folder is snapshotted before the run; after it, produced files are validated (front-matter schema, unique IDs, link targets, acyclic dependencies).
- [x] AC-3: A Review-changes dialog shows all created/modified files as diffs with *Keep* / *Discard*; Discard restores the snapshot.
- [x] AC-4: Validation issues are listed with an *Ask agent to fix* action.
- [x] AC-5: In non-git mode spec runs that write are mutually exclusive with implementation runs (FR-116b).

## Technical Notes
- Related design document: `spec/03_design/technical_design/c4_architecture.md` — ADR-014
- Related design document: `spec/03_design/technical_design/service_design.md` — specservice
- Related requirements: FR-007, FR-008, FR-010, FR-014, FR-116; CON-004
- L: hard to split because snapshot, validation and review dialog form one safety mechanism; flag for review.
- Release: R1

## Dependencies
- US-044 Define AgentAdapter port and MockAdapter
- US-047 Snapshots for non-git workspaces
- US-052 Permission broker and policy evaluation
- US-025 View and edit artifacts

## Implementation Details
Files created / modified:
- `packages/application/src/specs/spec-run-service.ts` — `SpecRunService`: `start` (target → folder via `SPEC_TARGET_FOLDERS`; refused without adapter, in non-git mode while an implementation run is active, or while the target has an undecided review), snapshot of the target folder, agent run in the main workspace (redacted events, timeouts, permission context with `writeScope`), review after the run (changed files with diffs + validation issues), `keep` (re-index, `markDraftAfterAiChange`), `discard` (restore snapshot, re-index), `fix` (follow-up run with the issues on the same baseline snapshot; the old review is superseded)
- `packages/application/src/specs/spec-validation.ts` — `validateSpecFiles`: front-matter schema (`parseArtifact`), unique IDs (against the index and among the produced files), link targets (intent decisions `Dn` excepted), acyclic blocking dependencies
- `packages/domain/src/permissions/built-in-denies.ts` — `writeScope`: specification runs may write only inside their target folder; shell commands are denied; `permission-broker.ts` passes it through
- `packages/adapters/sqlite/src/execution-store.ts` + migration 14 (`spec_review`) — `saveSpecReview`, `specReview`, `openSpecReview`; `index-repository.ts` — `specIndexView`
- `packages/core/src/composition.ts` — target-folder snapshots with the SnapshotStore, `WorkspaceWriterChanged` to the Scheduler at start and end; contract `specs.generate`, `specs.review`, `specs.openReview`, `specs.keep`, `specs.discard`, `specs.fix`, event `spec.reviewReady`
- `packages/ui/src/specs/GeneratePanel.tsx` (target, instruction, Draft-inputs confirmation, progress, resume of an undecided review) and `ReviewChangesDialog.tsx` (diffs, validation issues with *Ask agent to fix*, Keep / Discard / Decide later); shown in the Specifications area
- `packages/application/src/execution/execution-service.ts` — `RunTimers`, `EventBatcher`, `agentConfig` exported for reuse

Decisions / deviations:
- A failed or cancelled spec run stays reviewable, so partial changes can be discarded.
- Open point for story generation: the existing built-in deny "agents cannot change story status" also blocks writing new story files that contain a `status:` line; the story-generation stories must decide how new stories get their initial status.
- In the running app no agent adapter exists yet (US-045); the flow is verified end to end against the MockAdapter.

## Test Coverage
- Coverage: `spec-run-service.ts` 95.2 % lines, `spec-validation.ts` 100.0 %, `GeneratePanel.tsx` + `ReviewChangesDialog.tsx` 97.4 %, `built-in-denies.ts` 100.0 % (workspace total 97.1 % lines)
- Test files: `packages/domain/test/built-in-denies.test.ts` (2 new), `packages/application/test/spec-validation.test.ts` (7), `packages/application/test/spec-run-service.test.ts` (11), `packages/adapters/sqlite/test/execution-store.test.ts` (1 new), `packages/core/test/spec-runs-ipc.test.ts` (2, MockAdapter), `packages/ui/test/generate-panel.test.tsx` (7)
- 30 tests
