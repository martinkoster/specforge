---
id: US-090
title: Apply accepted changes with stable IDs and feature links
status: ready for development
size: M
epic: Feature workflow
---

## Business Value
Accepted delta changes land in the real specifications traceably and safely (FR-107, FR-104).

## Description
As a **SpecForge user**, I want to **apply the accepted changes of a change set to my specifications** so that **the specifications reflect the feature with full traceability**.

## Acceptance Criteria
- [ ] AC-1: Applying writes accepted items atomically per file with optimistic concurrency (`expectedHash`); a file changed since generation shows a conflict and nothing of that file is applied.
- [ ] AC-2: New elements carry `**Feature**: FI-xxx`, modified ones a changelog entry `Changed by FI-xxx`; summary tables and changelogs of the target documents get an entry referencing the feature.
- [ ] AC-3: Affected artifacts become Draft until approved; downstream elements are flagged *Potentially impacted* (US-086); the feature becomes *In delivery*.
- [ ] AC-4: Quality check and approval of the phase reuse the existing phase loop; after approval the stepper advances.
- [ ] AC-5: FR-107 acceptance: new requirements get the next free IDs, one modified requirement is changed as a diff, a discarded change leaves its element untouched, accepted elements carry `feature: FI-001`.

## Technical Notes
- Related design document: spec/03_design/functional_design/use_cases.md UC-045; technical_design/data_model.md §1.5; service_design.md FeatureService
- Related requirements: FR-107, FR-104, FR-017
- Release: R2

## Dependencies
- US-089 Delta generation as reviewable change sets
- US-086 Potentially impacted flags

## Implementation Details
<!-- Filled in by /implement-userstories after implementation -->

## Test Coverage
<!-- Filled in by /implement-userstories after implementation -->
