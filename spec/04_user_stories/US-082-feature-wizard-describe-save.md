---
id: US-082
title: Add feature: entry points and wizard (describe, save, resume)
status: done
size: M
epic: Feature workflow
---

## Business Value
A prominent, low-friction way to bring a new idea into an existing project (FR-102, NFR-032).

## Description
As a **SpecForge user**, I want to **start a feature from the dashboard, the Intent area or a shortcut and save it as a feature intent** so that **new ideas enter the specification flow in minutes**.

## Acceptance Criteria
- [x] AC-1: Once the main intent is approved, the dashboard header shows the split button **＋ Add feature ▾** (*Add feature* · *Capture idea* · *Edit specs directly*); before that it points to the main intent. The Intent area has the same action; **Ctrl/Cmd+Shift+F** opens the wizard from any screen.
- [x] AC-2: The wizard opens as a right-side sheet with the steps *Describe · AI review · Clarify · Save*; *Describe* has the idea text and collapsed optional fields motivation, target users, priority and related epic (picker).
- [x] AC-3: *Save without AI* (always available; the only path in limited mode) shows a preview of the feature intent file; *Save & approve* / *Save as draft* write `01_intent/FI-xxx-<slug>.md` with the next free ID and an editable title.
- [x] AC-4: The wizard state is stored in `feature_wizard` after every step (ADR-025); closing and reopening — also after an app restart — resumes at the same step, and the dashboard shows "Draft feature: <title> — resume".
- [x] AC-5: After saving, the confirmation shows the feature stepper with *Continue to impact analysis* and *Back to dashboard*.

## Technical Notes
- Related design document: spec/03_design/functional_design/user_flows.md UF-12, UF-17; use_cases.md UC-043; service_design.md FeatureService
- Related requirements: FR-102, FR-103, NFR-032
- Release: R2
- *Capture idea* in the menu becomes active with US-095; until then it is hidden.

## Dependencies
- US-081 Feature intent artifact, index and lifecycle

## Implementation Details
Files created / modified:
- `packages/application/src/specs/feature-wizard.ts` (new) — `FeatureWizardService`: `create` / `update` (state stored after every step) / `get` / `discard` / `drafts` (unsaved drafts, newest first) / `preview` (next free FI id, title from the first line of the idea, editable) / `save` (writes `<root>/01_intent/FI-xxx-<slug>.md`, re-indexes; *Save & approve* uses the approval flow and removes the draft, *Save as draft* keeps it linked via `feature_id`); `featureIntentFile()` renders data_model §1.5 (Problem with motivation, Assumptions with target users, priority, related epic)
- `packages/adapters/sqlite/src/feature-wizard-repository.ts` (new), `schema.ts` — migration 22 `feature_wizard` (ADR-025, survives *Rebuild index*)
- `packages/ipc-contract/src/contract.ts` — `features.wizard.create/update/discard/save` and `features.wizard.get/drafts/preview`
- `packages/core/src/composition.ts` — wizard service wiring (approval via `ApprovalService`), `FeatureWizardError` → `INVALID_REQUEST`
- `packages/ui/src/features/FeatureWizard.tsx` (new) — right-side sheet with the steps *Describe · AI review · Clarify · Save*; Describe with collapsed *More details* (motivation, target users, priority, related epic picker); *Save without AI* → preview with editable title → *Save & approve* / *Save as draft*; confirmation with the feature stepper, *Continue to impact analysis* and *Back to dashboard*; closing stores the current step (an empty draft is discarded), reopening resumes
- `packages/ui/src/dashboard/DashboardArea.tsx` — **＋ Add feature ▾** split button once the main intent is approved (menu: *Add feature* · *Edit specs directly*; *Capture idea* stays hidden until US-095), before that a button to the main intent; "Draft feature: <title> — resume"
- `packages/ui/src/intent/IntentArea.tsx` — *＋ Add feature* once the intent is approved; `packages/ui/src/App.tsx` — wizard state, **Ctrl/Cmd+Shift+F**, feature intents open in the Specifications area; `styles/areas/features.css` (new)

Decisions / deviations:
- The AI review / clarify steps are shown in the step indicator and implemented with US-083; until then *Save without AI* is the path in every mode.
- *Continue to impact analysis* opens the saved feature intent until the impact analysis exists (US-085).
- IPC names are pluralised (`features.wizard.*`) like the other contract namespaces.

## Test Coverage
- Coverage (lines): `feature-wizard-repository.ts` 100 %, `schema.ts` 100 %, `DashboardArea.tsx` 97 %, `feature-wizard.ts` 95.6 %, `FeatureWizard.tsx` 94.5 %, `composition.ts` 93.7 %, `IntentArea.tsx` 83.3 %, `App.tsx` 82.7 %; overall 95.4 %
- Test files: `packages/application/test/feature-wizard.test.ts` (6, new), `packages/adapters/sqlite/test/feature-index.test.ts` (+1), `packages/core/test/feature-wizard-ipc.test.ts` (1, new: draft survives a restart, save & approve), `packages/ui/test/feature-wizard.test.tsx` (5, new), `packages/ui/test/dashboard.test.tsx` (+3), `packages/ui/test/analyze-codebase.test.tsx` (+1), `packages/ui/test/app.test.tsx` (+1: split button, shortcut), `packages/main/test/feature-wizard.e2e.test.ts` (1, new E2E)
- Full suite: 1179 passed; lint, build and layering green
- 19 new tests
