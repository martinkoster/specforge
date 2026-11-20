---
id: US-084
title: Feature page with feature-scoped phase stepper
status: done
size: M
epic: Feature workflow
---

## Business Value
Each feature needs its own guided path so several features can progress in parallel without confusion (FR-105).

## Description
As a **SpecForge user**, I want to **open a feature and see its phases and next step** so that **I always know where a feature stands and what to do next**.

## Acceptance Criteria
- [x] AC-1: The feature page shows FI-ID, title, status and the stepper *Feature intent → Impact → Requirements (delta) → Design (delta) → Epic & stories → Kanban → Epic review*, with tabs *Intent · Impact · Changes · Epic & stories · Activity*.
- [x] AC-2: Phase status per feature is computed by the deterministic engine (ADR-017) with soft gates (FR-080): an unapproved earlier phase shows a warning but does not block.
- [x] AC-3: Several features can be in progress at the same time; each has its own stepper state.
- [x] AC-4: The project-level stepper switches to *Maintenance* once all initial epics are Done.
- [x] AC-5: The next-step engine returns feature steps (e.g. "Review impact of FI-001", "Approve delta requirements for FI-001"); unit tests cover the priority order with two parallel features.

## Technical Notes
- Related design document: spec/03_design/functional_design/user_flows.md UF-18; use_cases.md UC-031, UC-045; domain_model.md PhaseStatus; c4_architecture.md ADR-017
- Related requirements: FR-105, FR-080, FR-086
- Release: R2
- Tabs whose content arrives in later stories (Impact, Changes, Epic & stories) show an empty state until then.

## Dependencies
- US-081 Feature intent artifact, index and lifecycle

## Implementation Details
Files created / modified:
- `packages/domain/src/feature/feature-phases.ts` (new) — `FEATURE_PHASES` (intent → impact → requirements (delta) → design (delta) → stories → kanban → epic review), pure `featurePhases()` (states from the feature approval, impact state, delta change sets and linked stories; soft gate `unapprovedEarlier`, always enabled; current = first open phase), `featureNextStep()` ("Approve FI-001 …", "Analyse the impact of …", "Review impact of …", "Approve delta requirements for …", "Generate delta design for …", "Plan the epic and stories for …", "Approve the stories of …", "Review the epic of …"), `maintenanceMode()` (all initial epics — without a feature — Done)
- `packages/domain/src/project/next-step.ts` — `features` input; feature steps follow the project phase steps and precede open decisions, oldest feature first; target `{ area: 'feature', featureId }`
- `packages/application/src/specs/feature-service.ts` — feature progress (impact, delta and epic-review states as dependencies that later stories provide), `get` with `phases` / `current`, `progress()` of all open features
- `packages/adapters/sqlite/src/index-repository.ts` — story approval in `featureStories()`, `featureId` in `epics()`
- `packages/core/src/composition.ts` — feature progress in the next step; `phases.status.maintenance` from the board's epic lanes; `packages/ipc-contract/src/contract.ts` — `features.get` phases, `phases.status.maintenance`, `featureId` in next-step targets
- `packages/ui/src/features/FeaturePage.tsx` (new) — header (FI-ID, title, status), feature stepper (soft-gate warning when opening a phase with unapproved earlier phases), tabs Intent (content, *Open in editor*) · Impact · Changes (empty states until US-086 …) · Epic & stories (linked stories) · Activity (trace links with types)
- `packages/ui/src/dashboard/DashboardArea.tsx` — feature list opening the feature page; `packages/ui/src/shell/PhaseStepper.tsx` — *Maintenance* badge; `packages/ui/src/App.tsx` — feature page instead of the area content (next step, dashboard, wizard *Continue*), cleared on navigation

Decisions / deviations:
- Parallel features are ordered oldest first in the next-step engine (deterministic, ADR-017).
- Impact, delta and epic-review states are injected dependencies (not started / none / false) until US-086 … US-091 provide them.

## Test Coverage
- Coverage (lines): `feature-phases.ts` 100 %, `next-step.ts` 100 %, `feature-service.ts` 100 %, `index-repository.ts` 98.8 %, `DashboardArea.tsx` 97.5 %, `PhaseStepper.tsx` 95.2 %, `FeaturePage.tsx` 94.3 %, `composition.ts` 91.7 %, `App.tsx` 80.2 %; overall 95.2 %
- Test files: `packages/domain/test/feature-phases.test.ts` (7, new: phase states, soft gates, feature steps, two parallel features in the priority order, maintenance), `packages/application/test/feature-service.test.ts` (+1), `packages/adapters/sqlite/test/feature-index.test.ts` (adapted), `packages/core/test/features-ipc.test.ts` (extended), `packages/ui/test/feature-page.test.tsx` (5, new), `packages/ui/test/dashboard.test.tsx` (+1); stepper fixtures adapted (`maintenance`)
- Full suite: 1211 passed; lint, build and layering green
- 14 new tests
