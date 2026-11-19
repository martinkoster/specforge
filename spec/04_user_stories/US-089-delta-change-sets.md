---
id: US-089
title: Delta generation as reviewable change sets
status: ready for development
size: M
epic: Feature workflow
---

## Business Value
Approved specifications change only through focused, reviewable diffs scoped by the confirmed impact (FR-107, ADR-021).

## Description
As a **SpecForge user**, I want to **let the agent propose delta requirements and design as a change set I can review item by item** so that **I accept exactly the changes I want without regenerating approved documents**.

## Acceptance Criteria
- [ ] AC-1: *Generate delta* in the Requirements (delta) and Design (delta) phases starts a `generate` run on a scratch copy of the target folder (ADR-021), with only the confirmed impact items and the feature intent as scope.
- [ ] AC-2: The run's result is stored as a `change_set` with `change_item`s: *new* (next free ID), *modified* (diff of the element) and *deprecated* (marked `[DEPRECATED]` with reason — never deleted or renumbered); validation rejects reused IDs and deletions.
- [ ] AC-3: The *Changes* tab shows the change set grouped by file with badges *New FR-118* / *Modified FR-034* / *Deprecated FR-020* and *Accept* / *Discard* per item and *Accept all*.
- [ ] AC-4: Design deltas may propose new ADRs, which are created as *Proposed*.
- [ ] AC-5: Discarding all items closes the change set without touching any file.

## Technical Notes
- Related design document: spec/03_design/functional_design/use_cases.md UC-045; user_flows.md UF-18; technical_design/c4_architecture.md ADR-021; data_model.md change_set
- Related requirements: FR-107
- Release: R2
- Extend the scripted test agent with delta generation (new + modified + deprecated item).

## Dependencies
- US-087 Feature impact: trace-based analysis and confirmation

## Implementation Details
<!-- Filled in by /implement-userstories after implementation -->

## Test Coverage
<!-- Filled in by /implement-userstories after implementation -->
