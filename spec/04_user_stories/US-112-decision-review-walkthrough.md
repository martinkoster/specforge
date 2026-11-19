---
id: US-112
title: Decision review walkthrough and write-back
status: ready for development
size: M
epic: Decision review
---

## Business Value
Walking through decisions one by one, with a recommendation, makes them fast and well-founded (FR-083, D18).

## Description
As a **SpecForge user**, I want to **decide open items one at a time and write the decisions back to the specifications** so that **decisions are recorded where they belong, with a date**.

## Acceptance Criteria
- [ ] AC-1: *Review decisions* shows one item per screen ("Decision 2 of 5") with context and options as radio cards (recommended first), *Enter own answer* and *Defer*; a progress bar shows decided / deferred / remaining.
- [ ] AC-2: The summary lists all decisions and a diff of the artifact updates (ADR status → Accepted with today's date, assumptions → decision table, answered questions); *Apply* writes them, affected artifacts become Draft.
- [ ] AC-3: Stopping midway keeps decided items; deferred items are listed again next time.
- [ ] AC-4: FR-083 acceptance passes (three proposed ADRs).

## Technical Notes
- Related design document: spec/03_design/functional_design/use_cases.md UC-033; user_flows.md UF-11
- Related requirements: FR-083
- Release: R2

## Dependencies
- US-111 Collect open decision items

## Implementation Details
<!-- Filled in by /implement-userstories after implementation -->

## Test Coverage
<!-- Filled in by /implement-userstories after implementation -->
