---
id: US-105
title: AI completeness check in the epic review
status: ready for development
size: S
epic: Epics & planning
---

## Business Value
The agent compares the combined changes with the epic acceptance criteria and points out gaps (FR-100).

## Description
As a **SpecForge user**, I want to **let the agent check whether an epic's changes cover its acceptance criteria** so that **gaps become follow-up stories before I close the epic**.

## Acceptance Criteria
- [ ] AC-1: *AI completeness check* starts a read-only `quality_check` run (target: epic) with the epic criteria and the combined changes.
- [ ] AC-2: Results list each criterion as covered ✓ or gap ⚠ with an explanation; each gap offers *Create follow-up story* (pre-filled).
- [ ] AC-3: FR-100 acceptance passes with the scripted agent ("Password reset email not covered" → follow-up story in the epic).

## Technical Notes
- Related design document: spec/03_design/functional_design/use_cases.md UC-042; user_flows.md UF-16
- Related requirements: FR-100
- Release: R2

## Dependencies
- US-104 Epic review

## Implementation Details
<!-- Filled in by /implement-userstories after implementation -->

## Test Coverage
<!-- Filled in by /implement-userstories after implementation -->
