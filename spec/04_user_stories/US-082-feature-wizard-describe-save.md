---
id: US-082
title: Add feature: entry points and wizard (describe, save, resume)
status: ready for development
size: M
epic: Feature workflow
---

## Business Value
A prominent, low-friction way to bring a new idea into an existing project (FR-102, NFR-032).

## Description
As a **SpecForge user**, I want to **start a feature from the dashboard, the Intent area or a shortcut and save it as a feature intent** so that **new ideas enter the specification flow in minutes**.

## Acceptance Criteria
- [ ] AC-1: Once the main intent is approved, the dashboard header shows the split button **＋ Add feature ▾** (*Add feature* · *Capture idea* · *Edit specs directly*); before that it points to the main intent. The Intent area has the same action; **Ctrl/Cmd+Shift+F** opens the wizard from any screen.
- [ ] AC-2: The wizard opens as a right-side sheet with the steps *Describe · AI review · Clarify · Save*; *Describe* has the idea text and collapsed optional fields motivation, target users, priority and related epic (picker).
- [ ] AC-3: *Save without AI* (always available; the only path in limited mode) shows a preview of the feature intent file; *Save & approve* / *Save as draft* write `01_intent/FI-xxx-<slug>.md` with the next free ID and an editable title.
- [ ] AC-4: The wizard state is stored in `feature_wizard` after every step (ADR-025); closing and reopening — also after an app restart — resumes at the same step, and the dashboard shows "Draft feature: <title> — resume".
- [ ] AC-5: After saving, the confirmation shows the feature stepper with *Continue to impact analysis* and *Back to dashboard*.

## Technical Notes
- Related design document: spec/03_design/functional_design/user_flows.md UF-12, UF-17; use_cases.md UC-043; service_design.md FeatureService
- Related requirements: FR-102, FR-103, NFR-032
- Release: R2
- *Capture idea* in the menu becomes active with US-095; until then it is hidden.

## Dependencies
- US-081 Feature intent artifact, index and lifecycle

## Implementation Details
<!-- Filled in by /implement-userstories after implementation -->

## Test Coverage
<!-- Filled in by /implement-userstories after implementation -->
