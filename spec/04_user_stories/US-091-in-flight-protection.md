---
id: US-091
title: In-flight protection when applying changes
status: ready for development
size: M
epic: Feature workflow
---

## Business Value
Changes must never silently invalidate queued, running or in-review work (FR-110).

## Description
As a **SpecForge user**, I want to **decide per affected in-flight story how an accepted change applies** so that **running work is not disrupted without my explicit decision**.

## Acceptance Criteria
- [ ] AC-1: Before applying a change set (or story changes) linked to queued, running or in-review stories, a dialog lists each affected story with state and change summary and requires a choice per row; *Cancel* applies nothing.
- [ ] AC-2: *Continue unchanged*: the change applies, the story is flagged *Potentially impacted*.
- [ ] AC-3: *Cancel / dequeue*: a running run is cancelled (normal cancel), a queued story is dequeued; the story returns to Ready.
- [ ] AC-4: *Apply in corrections*: for a story in Review the correction feedback is pre-filled; for a running/queued story the feedback is stored as pending and pre-filled into *Request corrections* when it reaches Review — the system never starts a correction itself.
- [ ] AC-5: Decisions are stored in `in_flight_decision` and shown on the story and on the feature's Activity tab; FR-110 acceptance passes.

## Technical Notes
- Related design document: spec/03_design/functional_design/use_cases.md UC-046; user_flows.md UF-18; service_design.md ImpactService
- Related requirements: FR-110, FR-045
- Release: R2

## Dependencies
- US-090 Apply accepted changes with stable IDs and feature links

## Implementation Details
<!-- Filled in by /implement-userstories after implementation -->

## Test Coverage
<!-- Filled in by /implement-userstories after implementation -->
