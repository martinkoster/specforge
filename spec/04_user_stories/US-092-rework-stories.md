---
id: US-092
title: Rework stories for Done functionality
status: ready for development
size: S
epic: Feature workflow
---

## Business Value
Done work stays Done; changes to it become new, traceable rework stories with the right context (FR-109).

## Description
As a **SpecForge user**, I want to **have rework stories that reference the Done stories they change** so that **implemented functionality evolves without reopening finished work**.

## Acceptance Criteria
- [ ] AC-1: Story front-matter `reworks: [US-008]` is validated: targets must exist and be Done.
- [ ] AC-2: The original story stays Done and shows "Reworked by US-xxx" (card, drawer, traceability panel).
- [ ] AC-3: The run context of a rework story includes the original story, its run summary and its changed files (FR-068); a ContextAssembler test verifies it.
- [ ] AC-4: Rework stories otherwise behave like normal stories (Backlog, approval, Kanban, runs).

## Technical Notes
- Related design document: spec/03_design/functional_design/domain_model.md Story; technical_design/data_model.md §1.3; service_design.md ContextAssembler
- Related requirements: FR-109, FR-068
- Release: R2

## Dependencies
- US-081 Feature intent artifact, index and lifecycle

## Implementation Details
<!-- Filled in by /implement-userstories after implementation -->

## Test Coverage
<!-- Filled in by /implement-userstories after implementation -->
