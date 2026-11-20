---
id: US-081
title: Feature intent artifact, index and lifecycle
status: done
size: M
epic: Feature workflow
---

## Business Value
Feature intents are the backbone of evolving an existing project: every delta and story traces back to one (FR-104, ADR-021).

## Description
As a **SpecForge user**, I want to **have feature intents as first-class artifacts with a clear lifecycle** so that **I can see what each feature changes and where it stands**.

## Acceptance Criteria
- [x] AC-1: Files `01_intent/FI-xxx-<slug>.md` (format per data_model §1.5) are indexed as `feature_intent` with ID, title, approval, status, source idea and baseline; invalid files show the usual parse error.
- [x] AC-2: New IDs are the next free `FI-` number; IDs are never reused.
- [x] AC-3: `feature:` on stories and epics, `**Feature**: FI-xxx` lines on elements and the trace types `introduces` / `changes` / `reworks` are indexed and shown in the traceability panel of the feature intent.
- [x] AC-4: Status: *Draft* → *Approved* (approval flow of other artifacts) → *In delivery* (as soon as an accepted delta or a linked story exists) → *Done* (all linked stories Done) — derived and written by SpecForge only; *Withdrawn* is set only by the user (US-094).
- [x] AC-5: `feature.list` / `feature.get` return the features with status and links; schema migration adds the index tables and the `feature_id` / `reworks` columns.

## Technical Notes
- Related design document: spec/03_design/functional_design/domain_model.md FeatureIntent; technical_design/data_model.md §1.5, §2.5; c4_architecture.md ADR-021
- Related requirements: FR-104
- Release: R2
- Domain: pure function for the derived status (property tests for the transitions).

## Dependencies
- US-078 Per-project specification root

## Implementation Details
Files created / modified:
- `packages/domain/src/feature/feature-status.ts` (new) — `FEATURE_STATUSES`, pure `featureStatus()` (Draft → Approved → In delivery (accepted delta or a linked story) → Done (all linked stories Done); Withdrawn terminal) and `nextFeatureId()` (next free `FI-` number)
- `packages/application/src/indexing/parse-artifact.ts` — `kind: feature_intent` (FI id, title, approval, status (validated), `source_idea`, `baseline`; links to related epics/requirements and the source idea); typed links: `**Feature**: FI-xxx` lines → `introduces`, `Changed by FI-xxx` → `changes`, story/epic `feature:` → `introduces`, story `reworks:` → `reworks` (typed links win over plain references)
- `packages/adapters/sqlite/src/schema.ts` — migration 21 `feature_intent` index table (part of *Rebuild index*; migrations 2/4 keep the Release 1 table set); story/epic `feature_id` and story `reworks` existed since migration 2
- `packages/adapters/sqlite/src/index-repository.ts` — stores feature rows and link types; `features()`, `featureStories()`, `linkType()`
- `packages/application/src/specs/feature-service.ts` (new) — `list` / `get` (derived status, story count, links with trace types), `nextId`, `sync` (writes the derived status into the front-matter with an expected hash and re-indexes; Withdrawn is never left)
- `packages/application/src/specs/trace-service.ts` — `linkType` dependency; trace nodes carry `linkType` for feature trace types
- `packages/ipc-contract/src/contract.ts` — `features.list`, `features.get` (pluralised like the other contract namespaces), `TraceNode.linkType`
- `packages/core/src/composition.ts` — `FeatureService`; status sync after every re-index, after external changes and after opening a project (idempotent, one pass per project at a time)
- `packages/ui/src/specs/TracePanel.tsx` — trace types as badges; feature intent IDs from the front-matter

Decisions / deviations:
- `acceptedDelta` is a dependency of the feature service that is false until delta change sets exist (US-087).
- Feature intents are not part of the project phase status (the feature-scoped stepper is US-084).

## Test Coverage
- Coverage (lines): `feature-status.ts` 100 %, `feature-service.ts` 100 %, `trace-service.ts` 100 %, `schema.ts` 100 %, `index-repository.ts` 98.8 %, `parse-artifact.ts` 97.9 %, `composition.ts` 94.6 %, `TracePanel.tsx` 88.9 %; overall 95.6 %
- Test files: `packages/domain/test/feature-status.test.ts` (5, incl. a fast-check property test), `packages/application/test/parse-artifact.test.ts` (+3), `packages/adapters/sqlite/test/feature-index.test.ts` (3, new), `packages/application/test/feature-service.test.ts` (4, new), `packages/application/test/trace-service.test.ts` (+1), `packages/core/test/features-ipc.test.ts` (2, new), `packages/ui/test/trace-panel.test.tsx` (+2)
- Full suite: 1161 passed; lint, build and layering green
- 20 new tests
