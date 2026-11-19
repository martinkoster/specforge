---
id: US-111
title: Collect open decision items
status: ready for development
size: M
epic: Decision review
---

## Business Value
Open questions, assumptions and proposed ADRs are scattered across documents; collecting them makes decision-making systematic (FR-083).

## Description
As a **SpecForge user**, I want to **see all open decisions of my project in one list** so that **no open question is forgotten**.

## Acceptance Criteria
- [ ] AC-1: The indexer extracts open items: entries under "Open questions" and "Assumptions" sections, ADRs with `Status: Proposed` and open agent recommendations; each with source artifact and context.
- [ ] AC-2: Items are stored as `decision_item` and shown with a counter (*Review decisions (n open)*) on the dashboard, the phase screens and pending decisions.
- [ ] AC-3: For items without options, a `decision_options` run proposes options with a recommended one and trade-offs; results are stored on the item.

## Technical Notes
- Related design document: spec/03_design/functional_design/use_cases.md UC-033; service_design.md DecisionService
- Related requirements: FR-083
- Release: R2

## Dependencies
- US-078 Per-project specification root

## Implementation Details
<!-- Filled in by /implement-userstories after implementation -->

## Test Coverage
<!-- Filled in by /implement-userstories after implementation -->
