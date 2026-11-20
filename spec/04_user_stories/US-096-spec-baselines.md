---
id: US-096
title: Spec baselines
status: done
size: M
epic: Feature workflow
---

## Business Value
A Git tag marks a known-good specification state that later changes can be compared against (FR-112).

## Description
As a **SpecForge user**, I want to **create a spec baseline when a feature is done and compare artifacts with it** so that **I can see exactly what each feature changed in the specifications**.

## Acceptance Criteria
- [x] AC-1: When a feature becomes Done, the banner offers *Create baseline spec-vX.Y* (next version, editable); *Create baseline* is also available on demand from the dashboard history.
- [x] AC-2: Requires git mode; with uncommitted spec changes, *Commit spec changes* (FR-072) is offered first. The tag is annotated with notes listing included features and epics, and indexed in `baseline`.
- [x] AC-3: The dashboard history lists baselines; the artifact editor offers *Compare with baseline…* showing the diff of the file between the tag and the current content.
- [x] AC-4: In non-git mode the action is hidden with an explanation. FR-112 acceptance passes.

## Technical Notes
- Related design document: spec/03_design/functional_design/use_cases.md UC-048; user_flows.md UF-18; technical_design/data_model.md baseline
- Related requirements: FR-112, FR-072
- Release: R2

## Dependencies
- US-094 Feature completion and withdrawal

## Implementation Details
Files created / modified:
- `packages/adapters/git/src/baselines.ts` (new) — `SpecBaselines`: annotated tag on a ref (name validated with `check-ref-format`, existing tags refused, SpecForge identity when none is configured), list with notes, file content at a tag
- `packages/application/src/specs/baseline-service.ts` (new) — `nextBaselineTag` (`spec-vX.Y`, minor + 1; first `spec-v1.0`), `offer` (git mode, uncommitted spec files, Done features not yet baselined and their epics), `create` (refused with uncommitted spec changes; notes list features and epics; tag on the base branch), `list`, `compare`
- `packages/adapters/sqlite/src/feature-event-repository.ts` — `BaselineRepository`; `schema.ts` — migration 30 `baseline`
- `packages/ipc-contract/src/contract.ts` — `baselines.offer`, `baselines.create`, `baselines.list`, `baselines.compare`; `packages/core/src/composition.ts` — wiring (uncommitted files from *Commit spec changes*, base branch of the project)
- UI: `features/BaselineDialog.tsx` (new: editable tag, included features/epics, *Commit spec changes* first, explanation without Git), `features/SpecHistory.tsx` (new: dashboard history with *Create baseline*), `features/FeaturePage.tsx` (banner *Create baseline spec-vX.Y*), `specs/ArtifactEditor.tsx` + `specs/use-baselines.ts` (*Compare with baseline…* — unified diff between the tag and the current content), `specs/SpecificationsArea.tsx`, `intent/IntentArea.tsx`, `App.tsx`

Decisions / deviations:
- The included features are recorded in the `baseline` row (not written into the feature intents' `baseline:` front-matter): writing the files after tagging would leave the specification uncommitted right after every baseline.

## Test Coverage
- Coverage (lines): `git/src/baselines.ts` 100 %, `SpecHistory.tsx` 100 %, `feature-event-repository.ts` 100 %, `baseline-service.ts` 97.9 %, `ArtifactEditor.tsx` 93.8 %, `use-baselines.ts` 87.5 %, `BaselineDialog.tsx` 87 %; overall 95.2 %
- Test files: `packages/adapters/git/test/baselines.test.ts` (1), `packages/application/test/baseline-service.test.ts` (5), `packages/adapters/sqlite/test/impact-flags.test.ts` (+1), `packages/core/test/baselines-ipc.test.ts` (2: FR-112 acceptance — spec-v1.0, FI-001 completes, commit first, spec-v1.1, compare FR-034 with spec-v1.0; no baselines without Git), `packages/ui/test/baselines.test.tsx` (7), `feature-page.test.tsx` (+2)
- Full suite: 1358 passed; lint, build and layering green
- 18 new tests
