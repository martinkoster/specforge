---
id: US-085
title: Active features on the dashboard
status: done
size: S
epic: Feature workflow
---

## Business Value
The dashboard shows at a glance which features are in flight and what each needs (FR-113).

## Description
As a **SpecForge user**, I want to **see all active features with their phase and next step on the dashboard** so that **I can steer several features without opening each one**.

## Acceptance Criteria
- [x] AC-1: The *Active features* widget lists each non-terminal feature intent with status, mini stepper (current phase highlighted), linked epic progress and next step.
- [x] AC-2: Done features appear collapsed with their baseline tag (if any); withdrawn ones are hidden.
- [x] AC-3: Clicking a feature opens its current phase on the feature page.
- [x] AC-4: With FI-001 in *Design (delta) · awaiting approval* and FI-002 *Draft*, both appear with the correct steppers (UI test).

## Technical Notes
- Related design document: spec/03_design/functional_design/user_flows.md UF-12; use_cases.md UC-034
- Related requirements: FR-113
- Release: R2
- The idea-inbox counter is added by US-095.

## Dependencies
- US-084 Feature page with feature-scoped phase stepper

## Implementation Details
Files created / modified:
- `packages/application/src/specs/feature-service.ts` — every listed feature carries its stepper (`phases`, `current`), its next step (domain `featureNextStep`) and the progress of its linked stories
- `packages/ipc-contract/src/contract.ts` — `FeatureView` with `phases`, `current`, `nextStep`, `progress` (used by `features.list` and `features.get`)
- `packages/ui/src/dashboard/DashboardArea.tsx` — *Active features* widget: one card per non-terminal feature with status, mini stepper (current phase highlighted), "n of m stories done" and "Next: …"; Done features collapsed under "Done features (n)" with their baseline tag; withdrawn features hidden; clicking opens the feature page at its current phase (US-084)
- `packages/ui/src/styles/areas/features.css` — feature cards and mini stepper

Decisions / deviations:
- "Linked epic progress" is shown as the progress of the feature's linked stories (the stories of its epic); the idea-inbox counter follows with US-095.

## Test Coverage
- Coverage (lines): `feature-service.ts` 100 %, `DashboardArea.tsx` 95.9 %; overall 95.2 %
- Test files: `packages/application/test/feature-service.test.ts` (+1), `packages/ui/test/dashboard.test.tsx` (+2, replacing the US-084 list test: AC-4 with FI-001 in *Design (delta) · awaiting approval* and FI-002 *Draft*; done/withdrawn/click), `packages/ui/test/feature-page.test.tsx` and `packages/core/test/features-ipc.test.ts` (adapted)
- Full suite: 1213 passed; lint, build and layering green
- 3 new tests
