---
id: US-084
title: Feature page with feature-scoped phase stepper
status: ready for development
size: M
epic: Feature workflow
---

## Business Value
Each feature needs its own guided path so several features can progress in parallel without confusion (FR-105).

## Description
As a **SpecForge user**, I want to **open a feature and see its phases and next step** so that **I always know where a feature stands and what to do next**.

## Acceptance Criteria
- [ ] AC-1: The feature page shows FI-ID, title, status and the stepper *Feature intent → Impact → Requirements (delta) → Design (delta) → Epic & stories → Kanban → Epic review*, with tabs *Intent · Impact · Changes · Epic & stories · Activity*.
- [ ] AC-2: Phase status per feature is computed by the deterministic engine (ADR-017) with soft gates (FR-080): an unapproved earlier phase shows a warning but does not block.
- [ ] AC-3: Several features can be in progress at the same time; each has its own stepper state.
- [ ] AC-4: The project-level stepper switches to *Maintenance* once all initial epics are Done.
- [ ] AC-5: The next-step engine returns feature steps (e.g. "Review impact of FI-001", "Approve delta requirements for FI-001"); unit tests cover the priority order with two parallel features.

## Technical Notes
- Related design document: spec/03_design/functional_design/user_flows.md UF-18; use_cases.md UC-031, UC-045; domain_model.md PhaseStatus; c4_architecture.md ADR-017
- Related requirements: FR-105, FR-080, FR-086
- Release: R2
- Tabs whose content arrives in later stories (Impact, Changes, Epic & stories) show an empty state until then.

## Dependencies
- US-081 Feature intent artifact, index and lifecycle

## Implementation Details
<!-- Filled in by /implement-userstories after implementation -->

## Test Coverage
<!-- Filled in by /implement-userstories after implementation -->
