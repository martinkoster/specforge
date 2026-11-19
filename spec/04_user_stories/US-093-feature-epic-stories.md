---
id: US-093
title: Feature epic and story breakdown
status: ready for development
size: M
epic: Feature workflow
---

## Business Value
The feature becomes deliverable work on the board — new or extended epics with linked stories (FR-108).

## Description
As a **SpecForge user**, I want to **let the agent propose the epic and stories for a feature, including adjustments and rework stories** so that **the feature can be delivered through the Kanban board like any other work**.

## Acceptance Criteria
- [ ] AC-1: In the *Epic & stories* phase the agent proposes a new epic (default) or extending epics from the impact list; the user approves the epic choice first.
- [ ] AC-2: Stories are generated per epic (FR-094) and linked via `feature: FI-xxx`; adjustments to not-started stories are change items (diffs); Done stories in scope get rework stories (US-092).
- [ ] AC-3: Proposed dependencies — including on existing Done stories — are validated (FR-063); the in-flight dialog (US-091) applies when adjusted stories are queued, running or in Review.
- [ ] AC-4: After approval the stories appear in the epic's lane in Backlog; *Open on Kanban* jumps there. FR-108 acceptance passes with the scripted agent.

## Technical Notes
- Related design document: spec/03_design/functional_design/use_cases.md UC-045; user_flows.md UF-18
- Related requirements: FR-108, FR-094, FR-063
- Release: R2

## Dependencies
- US-090 Apply accepted changes with stable IDs and feature links
- US-092 Rework stories for Done functionality

## Implementation Details
<!-- Filled in by /implement-userstories after implementation -->

## Test Coverage
<!-- Filled in by /implement-userstories after implementation -->
