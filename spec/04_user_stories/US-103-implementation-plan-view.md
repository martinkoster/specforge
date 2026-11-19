---
id: US-103
title: Implementation plan view
status: ready for development
size: M
epic: Epics & planning
---

## Business Value
A plan of parallel waves and the critical path makes delivery predictable (FR-084).

## Description
As a **SpecForge user**, I want to **see implementation waves and the critical path and start a wave** so that **I can plan and run parallel work efficiently**.

## Acceptance Criteria
- [ ] AC-1: The plan view shows waves as columns (topological levels of the blocking graph, split by the concurrency limit), the critical path highlighted and size totals per wave; a compact epic graph (US-101) is shown above.
- [ ] AC-2: Cards are coloured by board state; *Group by epic* toggles grouping, with *Start epic* per group.
- [ ] AC-3: *Start wave* moves the wave's Ready stories to In Progress (each a human authorisation; non-Ready listed as skipped).
- [ ] AC-4: FR-084 acceptance passes (A→B→C, D, E: waves {A,D,E}, {B}, {C}; critical path A→B→C).

## Technical Notes
- Related design document: spec/03_design/functional_design/use_cases.md UC-036; user_flows.md UF-14; service_design.md PlanService
- Related requirements: FR-084, FR-022
- Release: R2

## Dependencies
- US-101 Derived epic dependencies
- US-102 Start an epic

## Implementation Details
<!-- Filled in by /implement-userstories after implementation -->

## Test Coverage
<!-- Filled in by /implement-userstories after implementation -->
