---
id: US-090
title: Apply accepted changes with stable IDs and feature links
status: done
size: M
epic: Feature workflow
---

## Business Value
Accepted delta changes land in the real specifications traceably and safely (FR-107, FR-104).

## Description
As a **SpecForge user**, I want to **apply the accepted changes of a change set to my specifications** so that **the specifications reflect the feature with full traceability**.

## Acceptance Criteria
- [x] AC-1: Applying writes accepted items atomically per file with optimistic concurrency (`expectedHash`); a file changed since generation shows a conflict and nothing of that file is applied.
- [x] AC-2: New elements carry `**Feature**: FI-xxx`, modified ones a changelog entry `Changed by FI-xxx`; summary tables and changelogs of the target documents get an entry referencing the feature.
- [x] AC-3: Affected artifacts become Draft until approved; downstream elements are flagged *Potentially impacted* (US-086); the feature becomes *In delivery*.
- [x] AC-4: Quality check and approval of the phase reuse the existing phase loop; after approval the stepper advances.
- [x] AC-5: FR-107 acceptance: new requirements get the next free IDs, one modified requirement is changed as a diff, a discarded change leaves its element untouched, accepted elements carry `feature: FI-001`.

## Technical Notes
- Related design document: spec/03_design/functional_design/use_cases.md UC-045; technical_design/data_model.md §1.5; service_design.md FeatureService
- Related requirements: FR-107, FR-104, FR-017
- Release: R2

## Dependencies
- US-089 Delta generation as reviewable change sets
- US-086 Potentially impacted flags

## Implementation Details
Files created / modified:
- `packages/application/src/specs/delta-service.ts` — `apply(changeSetId)` (once every item is decided): per file, the accepted items are applied to the current content — modified/deprecated sections replace the section as generated, new elements are appended, a new file is recreated from its file-level item; optimistic concurrency: a section (or preamble) that differs from the generation state, an element that exists already or an existing file for a new file makes the whole file a conflict (nothing of it is written); the write uses `expectedHash`; new elements get `**Feature**: FI-x`, changed/deprecated ones `Changed by FI-x.` if missing; each written file gets a `## Changelog` entry "date: FI-x — new …; changed …; deprecated …"; written files are re-indexed (impact flags, US-086) and then marked Draft (`generated_by` = the delta run); applied items get state *applied*, the change set *applied* (or stays open with the conflicts as reason); `state` reports *open* while applied artifacts are not approved again (AC-4) and `acceptedDelta` (→ feature *In delivery*)
- `packages/application/src/specs/delta.ts` — a new file's front-matter/preamble is a file-level *new* item
- `packages/ipc-contract/src/contract.ts` — `delta.apply`, item state *applied*; `packages/core/src/composition.ts` — `markDraft` via `ApprovalService`, artifact approval, `acceptedDelta` for the feature status
- `packages/ui/src/features/ChangesPanel.tsx` — *Apply accepted changes* once every item is decided; conflicts listed; after applying "Review and approve the changed artifacts" with *Open …* per file; `FeaturePage.tsx` passes the artifact navigation

Decisions / deviations:
- "Summary tables and changelogs" are covered by a `## Changelog` entry SpecForge appends to each changed document; the agent is asked to update summary tables in the delta itself (US-089 prompt).
- Quality check and approval use the existing artifact phase loop; the feature's delta phase counts as approved once the applied artifacts are approved again.

## Test Coverage
- Coverage (lines): `delta.ts` 100 %, `ChangesPanel.tsx` 98.1 %, `delta-service.ts` 94.4 %, `FeaturePage.tsx` 92.1 %, `composition.ts` 91.3 %; overall 95.3 %
- Test files: `packages/application/test/delta-service.test.ts` (+5: apply with feature links and changelog, discarded change untouched, approval-dependent phase state, conflict, refusal, new file), `packages/application/test/delta.test.ts` (adapted), `packages/core/test/delta-ipc.test.ts` (+1: FR-107 acceptance with the scripted agent — next free ID, diff, discarded element untouched, feature links, Draft, *In delivery*, approval advances the stepper), `packages/ui/test/changes-panel.test.tsx` (+1)
- Full suite: 1273 passed; lint, build and layering green
- 7 new tests
