---
id: US-086
title: Potentially impacted flags
status: ready for development
size: M
epic: Change awareness
---

## Business Value
When upstream specifications change, downstream items must be visibly re-checked instead of silently going stale (FR-017, FR-071). Feature deltas and in-flight protection build on these flags, so they come with the feature workflow.

## Description
As a **SpecForge user**, I want to **see which artifacts and stories may be affected by a change and clear the flag after checking** so that **nothing downstream goes stale unnoticed**.

## Acceptance Criteria
- [ ] AC-1: When an approved element with downstream trace links changes (in the app, by an agent or externally), all linked downstream elements and stories are flagged *Potentially impacted* with the source and a reason.
- [ ] AC-2: When a story's description or acceptance criteria change, its dependents (queued, running, in Review or Done) are flagged with a reference to the changed predecessor (FR-071).
- [ ] AC-3: Flags are stored in `impact_flag` (ADR-025): they survive editing the flagged file, re-indexing and *Rebuild index*; the migration drops the R1 index columns.
- [ ] AC-4: Flags are shown on artifacts, elements, cards and in pending decisions; *Clear flag* removes it; flags of IDs that no longer exist are shown as orphaned and can be cleared.
- [ ] AC-5: Acceptance examples of FR-017 and FR-071 pass as tests.

## Technical Notes
- Related design document: spec/03_design/functional_design/use_cases.md UC-010; technical_design/data_model.md impact_flag; c4_architecture.md ADR-025
- Related requirements: FR-017, FR-071
- Release: R2
- Release 2 Should-have pulled into the feature wave because FR-107 and FR-110 rely on it (D26 order).

## Dependencies
- US-078 Per-project specification root

## Implementation Details
<!-- Filled in by /implement-userstories after implementation -->

## Test Coverage
<!-- Filled in by /implement-userstories after implementation -->
