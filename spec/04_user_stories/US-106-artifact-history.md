---
id: US-106
title: Artifact history and revision compare
status: ready for development
size: M
epic: Change awareness
---

## Business Value
Seeing how a specification evolved, and comparing revisions, supports reviews and audits (FR-015).

## Description
As a **SpecForge user**, I want to **view an artifact's history and compare two revisions** so that **I understand how and why a specification changed**.

## Acceptance Criteria
- [ ] AC-1: *History* in the artifact editor lists revisions: in git mode from `git log` of the file (commits plus the uncommitted working state); in non-git mode from local revisions.
- [ ] AC-2: In non-git mode, every save and every accepted spec-run/delta write stores a revision in `artifact_revision` with its blob in the snapshot store.
- [ ] AC-3: Selecting two revisions shows the diff in the themed diff view.
- [ ] AC-4: FR-015 acceptance passes in both modes.

## Technical Notes
- Related design document: spec/03_design/functional_design/use_cases.md UC-011; technical_design/data_model.md artifact_revision
- Related requirements: FR-015
- Release: R2

## Dependencies
- US-078 Per-project specification root

## Implementation Details
<!-- Filled in by /implement-userstories after implementation -->

## Test Coverage
<!-- Filled in by /implement-userstories after implementation -->
