---
id: US-087
title: Feature impact: trace-based analysis and confirmation
status: ready for development
size: M
epic: Feature workflow
---

## Business Value
A fast, trace-based impact list shows what a feature touches and scopes all later delta work (FR-106, NFR-032).

## Description
As a **SpecForge user**, I want to **see the impact of a feature right away and confirm which items are in scope** so that **delta specifications and stories focus on exactly what must change**.

## Acceptance Criteria
- [ ] AC-1: `impact.trace` computes, in under 2 s for the NFR-030 reference project, the items reachable from the feature's related epics and requirements: requirements, design elements and ADRs, epics, not-started stories, in-flight stories, Done stories (rework candidates), runs and files; each with reason and confidence *high*.
- [ ] AC-2: The *Impact* tab shows three columns (*Specs*, *Work*, *Code areas*) with reason, confidence chip, source and a checkbox; the user can remove items and add items manually (element/story picker or path).
- [ ] AC-3: Items are stored in `impact_item`; *Approve impact* marks the confirmed list and advances the feature stepper.
- [ ] AC-4: The confirmed list is available to the delta generation as its scope (`feature.get` returns it).

## Technical Notes
- Related design document: spec/03_design/functional_design/use_cases.md UC-044; user_flows.md UF-18; service_design.md ImpactService
- Related requirements: FR-106, NFR-032
- Release: R2

## Dependencies
- US-084 Feature page with feature-scoped phase stepper

## Implementation Details
<!-- Filled in by /implement-userstories after implementation -->

## Test Coverage
<!-- Filled in by /implement-userstories after implementation -->
