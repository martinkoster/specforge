---
id: US-088
title: Feature impact: AI analysis of specs and code
status: ready for development
size: S
epic: Feature workflow
---

## Business Value
The agent finds impact the trace graph cannot see — code areas and implicit dependencies (FR-106).

## Description
As a **SpecForge user**, I want to **have the agent add specification and code impact to the list** so that **the impact list also covers what is not linked explicitly**.

## Acceptance Criteria
- [ ] AC-1: Opening the Impact tab of an approved feature starts an `impact` run in the background (read-only); the trace items stay usable meanwhile ("Analysing code…").
- [ ] AC-2: Agent items stream into the list with category, reason, confidence (high/medium/low) and source *AI*; duplicates of trace items are merged, keeping the trace confidence.
- [ ] AC-3: The run can be cancelled and re-run; in limited mode only the trace part is available, with an explanation.
- [ ] AC-4: With the scripted agent, the FR-106 acceptance example yields the data-model element, the epic and the rework candidate, each with a reason.

## Technical Notes
- Related design document: spec/03_design/functional_design/use_cases.md UC-044; service_design.md ImpactService
- Related requirements: FR-106
- Release: R2
- Extend the scripted test agent with `impact`.

## Dependencies
- US-087 Feature impact: trace-based analysis and confirmation

## Implementation Details
<!-- Filled in by /implement-userstories after implementation -->

## Test Coverage
<!-- Filled in by /implement-userstories after implementation -->
