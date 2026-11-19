---
id: US-096
title: Spec baselines
status: ready for development
size: M
epic: Feature workflow
---

## Business Value
A Git tag marks a known-good specification state that later changes can be compared against (FR-112).

## Description
As a **SpecForge user**, I want to **create a spec baseline when a feature is done and compare artifacts with it** so that **I can see exactly what each feature changed in the specifications**.

## Acceptance Criteria
- [ ] AC-1: When a feature becomes Done, the banner offers *Create baseline spec-vX.Y* (next version, editable); *Create baseline* is also available on demand from the dashboard history.
- [ ] AC-2: Requires git mode; with uncommitted spec changes, *Commit spec changes* (FR-072) is offered first. The tag is annotated with notes listing included features and epics, and indexed in `baseline`.
- [ ] AC-3: The dashboard history lists baselines; the artifact editor offers *Compare with baseline…* showing the diff of the file between the tag and the current content.
- [ ] AC-4: In non-git mode the action is hidden with an explanation. FR-112 acceptance passes.

## Technical Notes
- Related design document: spec/03_design/functional_design/use_cases.md UC-048; user_flows.md UF-18; technical_design/data_model.md baseline
- Related requirements: FR-112, FR-072
- Release: R2

## Dependencies
- US-094 Feature completion and withdrawal

## Implementation Details
<!-- Filled in by /implement-userstories after implementation -->

## Test Coverage
<!-- Filled in by /implement-userstories after implementation -->
