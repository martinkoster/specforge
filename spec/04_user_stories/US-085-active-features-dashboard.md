---
id: US-085
title: Active features on the dashboard
status: ready for development
size: S
epic: Feature workflow
---

## Business Value
The dashboard shows at a glance which features are in flight and what each needs (FR-113).

## Description
As a **SpecForge user**, I want to **see all active features with their phase and next step on the dashboard** so that **I can steer several features without opening each one**.

## Acceptance Criteria
- [ ] AC-1: The *Active features* widget lists each non-terminal feature intent with status, mini stepper (current phase highlighted), linked epic progress and next step.
- [ ] AC-2: Done features appear collapsed with their baseline tag (if any); withdrawn ones are hidden.
- [ ] AC-3: Clicking a feature opens its current phase on the feature page.
- [ ] AC-4: With FI-001 in *Design (delta) · awaiting approval* and FI-002 *Draft*, both appear with the correct steppers (UI test).

## Technical Notes
- Related design document: spec/03_design/functional_design/user_flows.md UF-12; use_cases.md UC-034
- Related requirements: FR-113
- Release: R2
- The idea-inbox counter is added by US-095.

## Dependencies
- US-084 Feature page with feature-scoped phase stepper

## Implementation Details
<!-- Filled in by /implement-userstories after implementation -->

## Test Coverage
<!-- Filled in by /implement-userstories after implementation -->
