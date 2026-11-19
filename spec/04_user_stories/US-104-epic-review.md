---
id: US-104
title: Epic review
status: ready for development
size: M
epic: Epics & planning
---

## Business Value
A final look at an epic as a whole catches gaps that per-story reviews miss (FR-100).

## Description
As a **SpecForge user**, I want to **review a completed epic with its combined changes and acceptance criteria** so that **I confirm the epic really delivers what it promised**.

## Acceptance Criteria
- [ ] AC-1: When all stories of an epic are Done, the epic shows *Ready for epic review* (pending decision) and a highlighted lane header with *Review epic*.
- [ ] AC-2: The review shows the stories with review outcomes and run summaries, the union of changed files (expandable to per-story diffs) and the epic acceptance criteria as a checklist.
- [ ] AC-3: *Confirm epic Done*, *Add follow-up story* (created in the epic as Backlog/Draft; epic back to In progress) and *Skip review*; the outcome is stored in the epic file, and adding a story later clears it.

## Technical Notes
- Related design document: spec/03_design/functional_design/use_cases.md UC-042; user_flows.md UF-16
- Related requirements: FR-100, FR-033, FR-095
- Release: R2

## Dependencies
- None

## Implementation Details
<!-- Filled in by /implement-userstories after implementation -->

## Test Coverage
<!-- Filled in by /implement-userstories after implementation -->
