---
id: US-102
title: Start an epic
status: ready for development
size: S
epic: Epics & planning
---

## Business Value
Starting all Ready stories of an epic in one action saves many clicks while keeping each move a human authorisation (FR-098).

## Description
As a **SpecForge user**, I want to **start all Ready stories of an epic at once** so that **I can kick off an epic quickly**.

## Acceptance Criteria
- [ ] AC-1: *Start epic* in the lane header opens a confirmation listing the Ready stories to start and the non-Ready stories that are skipped.
- [ ] AC-2: Confirming moves each Ready story to In Progress as a separate human authorisation; stories with open blocking dependencies or beyond the limit are queued.
- [ ] AC-3: FR-098 acceptance passes (4 Ready, one dependent: 3 runs started, 1 queued, confirmation lists all 4).

## Technical Notes
- Related design document: spec/03_design/functional_design/use_cases.md UC-041
- Related requirements: FR-098, FR-022, FR-065
- Release: R2

## Dependencies
- None

## Implementation Details
<!-- Filled in by /implement-userstories after implementation -->

## Test Coverage
<!-- Filled in by /implement-userstories after implementation -->
