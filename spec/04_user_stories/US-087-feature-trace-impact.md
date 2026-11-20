---
id: US-087
title: Feature impact: trace-based analysis and confirmation
status: done
size: M
epic: Feature workflow
---

## Business Value
A fast, trace-based impact list shows what a feature touches and scopes all later delta work (FR-106, NFR-032).

## Description
As a **SpecForge user**, I want to **see the impact of a feature right away and confirm which items are in scope** so that **delta specifications and stories focus on exactly what must change**.

## Acceptance Criteria
- [x] AC-1: `impact.trace` computes, in under 2 s for the NFR-030 reference project, the items reachable from the feature's related epics and requirements: requirements, design elements and ADRs, epics, not-started stories, in-flight stories, Done stories (rework candidates), runs and files; each with reason and confidence *high*.
- [x] AC-2: The *Impact* tab shows three columns (*Specs*, *Work*, *Code areas*) with reason, confidence chip, source and a checkbox; the user can remove items and add items manually (element/story picker or path).
- [x] AC-3: Items are stored in `impact_item`; *Approve impact* marks the confirmed list and advances the feature stepper.
- [x] AC-4: The confirmed list is available to the delta generation as its scope (`feature.get` returns it).

## Technical Notes
- Related design document: spec/03_design/functional_design/use_cases.md UC-044; user_flows.md UF-18; service_design.md ImpactService
- Related requirements: FR-106, NFR-032
- Release: R2

## Dependencies
- US-084 Feature page with feature-scoped phase stepper

## Implementation Details
Files created / modified:
- `packages/application/src/specs/impact-service.ts` (new) — `ImpactService.trace` (from the feature's related epics and requirements over the downstream trace graph and epic membership: requirements, design elements, ADRs, epics, stories by state — not started / in flight / Done as rework candidates — and the runs and touched files of the reached stories; reason per item, confidence *high*, source *trace*; all links are loaded once and traversed in memory), `propose` (stores the trace items; user items stay; refused once approved), `add` (element/story ID or workspace path), `remove`, `approve` (at least one item), `view` (state, items, columns *Specs* / *Work* / *Code areas*), `state` (not started / proposed / confirmed → feature stepper), `scope` (confirmed targets for the delta phases)
- `packages/adapters/sqlite/src/impact-item-repository.ts` (new), `schema.ts` — migration 24 `impact_item` (workflow state, ADR-025)
- `packages/application/src/specs/feature-service.ts` — impact state for the stepper, `features.get` returns the impact list (AC-4)
- `packages/ipc-contract/src/contract.ts` — `impact.propose/add/remove/approve`, `ImpactView` in `features.get`; `packages/core/src/composition.ts` — wiring (index, runs, file touches), `ImpactError` → `INVALID_REQUEST`
- `packages/ui/src/features/ImpactPanel.tsx` (new) — proposes the list when the tab opens; three columns with category, confidence and source chips, reason and a checkbox (untick removes); *Add item* by ID or path; *Approve impact* (afterwards read-only, the stepper advances); `FeaturePage.tsx` — Impact tab; `styles/areas/features.css`

Decisions / deviations:
- Removing an item deletes it; proposing again (refresh) brings back removed trace items while keeping the user's additions.
- Runs appear as *Code areas* items next to the touched files.

## Test Coverage
- Coverage (lines): `impact-service.ts` 100 %, `impact-item-repository.ts` 100 %, `feature-service.ts` 100 %, `ImpactPanel.tsx` 100 %, `FeaturePage.tsx` 94.6 %, `composition.ts` 91.7 %; overall 95.3 %
- Test files: `packages/application/test/impact-service.test.ts` (4, new, incl. NFR-032 with 1,000 stories and 1,000 runs under 2 s), `packages/adapters/sqlite/test/impact-flags.test.ts` (+1), `packages/core/test/impact-ipc.test.ts` (1, new), `packages/ui/test/feature-page.test.tsx` (+1)
- Full suite: 1237 passed; lint, build and layering green
- 7 new tests
