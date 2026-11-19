---
id: US-094
title: Feature completion and withdrawal
status: ready for development
size: S
epic: Feature workflow
---

## Business Value
Features end cleanly — either delivered or withdrawn without leftovers (FR-104).

## Description
As a **SpecForge user**, I want to **see a feature complete automatically and be able to withdraw one** so that **the feature list reflects reality**.

## Acceptance Criteria
- [ ] AC-1: A feature becomes *Done* when all stories linked to it are Done; the feature page shows a completion banner.
- [ ] AC-2: *Withdraw* (confirmation) discards open change sets, keeps applied changes (with a hint that they can be deprecated) and lists linked not-started stories for a keep/delete decision; *Withdrawn* is terminal.
- [ ] AC-3: Status changes are written to the feature intent file and appear in the activity feed.

## Technical Notes
- Related design document: spec/03_design/functional_design/use_cases.md UC-043, UC-045; business_processes.md BP-07
- Related requirements: FR-104
- Release: R2

## Dependencies
- US-090 Apply accepted changes with stable IDs and feature links

## Implementation Details
<!-- Filled in by /implement-userstories after implementation -->

## Test Coverage
<!-- Filled in by /implement-userstories after implementation -->
