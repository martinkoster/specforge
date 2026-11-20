---
id: US-088
title: Feature impact: AI analysis of specs and code
status: done
size: S
epic: Feature workflow
---

## Business Value
The agent finds impact the trace graph cannot see — code areas and implicit dependencies (FR-106).

## Description
As a **SpecForge user**, I want to **have the agent add specification and code impact to the list** so that **the impact list also covers what is not linked explicitly**.

## Acceptance Criteria
- [x] AC-1: Opening the Impact tab of an approved feature starts an `impact` run in the background (read-only); the trace items stay usable meanwhile ("Analysing code…").
- [x] AC-2: Agent items stream into the list with category, reason, confidence (high/medium/low) and source *AI*; duplicates of trace items are merged, keeping the trace confidence.
- [x] AC-3: The run can be cancelled and re-run; in limited mode only the trace part is available, with an explanation.
- [x] AC-4: With the scripted agent, the FR-106 acceptance example yields the data-model element, the epic and the rework candidate, each with a reason.

## Technical Notes
- Related design document: spec/03_design/functional_design/use_cases.md UC-044; service_design.md ImpactService
- Related requirements: FR-106
- Release: R2
- Extend the scripted test agent with `impact`.

## Dependencies
- US-087 Feature impact: trace-based analysis and confirmation

## Implementation Details
Files created / modified:
- `packages/application/src/specs/impact-service.ts` — `analyse` (read-only `impact` run with the feature intent, the trace items found so far and the element index with story states), `cancel`, state *analysing* while the run is active, `view.analysing`; agent items stream in as `IMPACT {…}` output lines (`parseImpactLine`) and are also read from the final `specforge-result` block; duplicates of existing items are skipped (the trace item and its confidence stay); a re-run removes the earlier unconfirmed agent items; refused in limited mode and without an adapter
- `packages/adapters/sqlite/src/impact-item-repository.ts` — `removeOrigin`
- `packages/ipc-contract/src/contract.ts` — `impact.analyse`, `impact.cancel`, `impact.view`, event `features.impactUpdated`, `ImpactView.analysing`; `packages/core/src/composition.ts` — agent wiring (permission relay, run output, element index context)
- `packages/core/src/test-agent.ts` — `impact` behaviour for the FR-106 example (data-model design element, epic "Task management", Done task-detail story as rework candidate)
- `packages/ui/src/features/ImpactPanel.tsx` — starts the analysis once in the background when the tab of an approved feature opens; "Analysing code…" with *Cancel analysis*; *Re-run analysis*; live refresh on `features.impactUpdated`; source chip *AI*; limited mode shows the trace part with the explanation; `FeaturePage.tsx` / `App.tsx` pass approval and the limited-mode reason

## Test Coverage
- Coverage (lines): `impact-item-repository.ts` 100 %, `test-agent.ts` 100 %, `impact-service.ts` 98.5 %, `ImpactPanel.tsx` 95.9 %, `FeaturePage.tsx` 94.6 %, `composition.ts` 91.4 %; overall 95.3 %
- Test files: `packages/application/test/impact-analysis.test.ts` (4, new), `packages/core/test/test-agent.test.ts` (+1), `packages/core/test/impact-ipc.test.ts` (+1: FR-106 example with the scripted agent, merge with trace items), `packages/ui/test/impact-panel.test.tsx` (3, new)
- Full suite: 1246 passed; lint, build and layering green
- 9 new tests
