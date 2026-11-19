---
id: US-107
title: Overlap warnings between parallel runs
status: ready for development
size: S
epic: Change awareness
---

## Business Value
Parallel stories that change the same files are spotted early, before merge conflicts surprise the user (FR-070).

## Description
As a **SpecForge user**, I want to **see when two active or unmerged stories change the same file** so that **I can resolve or sequence overlapping work in time**.

## Acceptance Criteria
- [ ] AC-1: When two active or unmerged story branches have the same path in `file_touch`, both cards and both reviews show an *Overlap* warning naming the other story and the file(s).
- [ ] AC-2: The overlap is included in the context of later correction rounds (FR-045).
- [ ] AC-3: The warning offers *Add dependency* (pre-filled related/blocking dependency, subject to normal validation).
- [ ] AC-4: FR-070 acceptance passes.

## Technical Notes
- Related design document: spec/03_design/functional_design/use_cases.md UC-017 (6a); technical_design/data_model.md file_touch
- Related requirements: FR-070, FR-045
- Release: R2

## Dependencies
- None

## Implementation Details
<!-- Filled in by /implement-userstories after implementation -->

## Test Coverage
<!-- Filled in by /implement-userstories after implementation -->
