---
id: US-101
title: Derived epic dependencies
status: ready for development
size: S
epic: Epics & planning
---

## Business Value
Seeing which epics depend on others helps plan delivery order (FR-097).

## Description
As a **SpecForge user**, I want to **see epic-level dependencies derived from story dependencies** so that **I can plan epics in the right order**.

## Acceptance Criteria
- [ ] AC-1: A pure domain function derives "EP-B depends on EP-A" when a story of EP-B has a blocking dependency on a story of EP-A (property-tested).
- [ ] AC-2: Lane headers show "depends on EP-001"; the dependency graph can group by epic and shows the derived epic edges.
- [ ] AC-3: FR-097 acceptance passes.

## Technical Notes
- Related design document: spec/03_design/functional_design/use_cases.md UC-041; user_flows.md UF-03
- Related requirements: FR-097
- Release: R2

## Dependencies
- None

## Implementation Details
<!-- Filled in by /implement-userstories after implementation -->

## Test Coverage
<!-- Filled in by /implement-userstories after implementation -->
