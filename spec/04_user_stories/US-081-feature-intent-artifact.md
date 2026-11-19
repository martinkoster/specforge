---
id: US-081
title: Feature intent artifact, index and lifecycle
status: ready for development
size: M
epic: Feature workflow
---

## Business Value
Feature intents are the backbone of evolving an existing project: every delta and story traces back to one (FR-104, ADR-021).

## Description
As a **SpecForge user**, I want to **have feature intents as first-class artifacts with a clear lifecycle** so that **I can see what each feature changes and where it stands**.

## Acceptance Criteria
- [ ] AC-1: Files `01_intent/FI-xxx-<slug>.md` (format per data_model §1.5) are indexed as `feature_intent` with ID, title, approval, status, source idea and baseline; invalid files show the usual parse error.
- [ ] AC-2: New IDs are the next free `FI-` number; IDs are never reused.
- [ ] AC-3: `feature:` on stories and epics, `**Feature**: FI-xxx` lines on elements and the trace types `introduces` / `changes` / `reworks` are indexed and shown in the traceability panel of the feature intent.
- [ ] AC-4: Status: *Draft* → *Approved* (approval flow of other artifacts) → *In delivery* (as soon as an accepted delta or a linked story exists) → *Done* (all linked stories Done) — derived and written by SpecForge only; *Withdrawn* is set only by the user (US-094).
- [ ] AC-5: `feature.list` / `feature.get` return the features with status and links; schema migration adds the index tables and the `feature_id` / `reworks` columns.

## Technical Notes
- Related design document: spec/03_design/functional_design/domain_model.md FeatureIntent; technical_design/data_model.md §1.5, §2.5; c4_architecture.md ADR-021
- Related requirements: FR-104
- Release: R2
- Domain: pure function for the derived status (property tests for the transitions).

## Dependencies
- US-078 Per-project specification root

## Implementation Details
<!-- Filled in by /implement-userstories after implementation -->

## Test Coverage
<!-- Filled in by /implement-userstories after implementation -->
