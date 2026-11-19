---
id: US-095
title: Idea inbox
status: ready for development
size: M
epic: Feature workflow
---

## Business Value
Quick ideas are captured in seconds and triaged later, so nothing gets lost and flow is not interrupted (FR-111, NFR-032).

## Description
As a **SpecForge user**, I want to **capture one-line ideas and later turn them into features, merge or dismiss them** so that **I keep ideas without starting work on them**.

## Acceptance Criteria
- [ ] AC-1: *Capture idea* (Add feature menu, dashboard widget input, **Ctrl/Cmd+Shift+I**) opens a popover with a text line and an optional note; Enter saves — at most 2 interactions from any screen.
- [ ] AC-2: Ideas are appended to `01_intent/ideas.md` (format per data_model §1.6) with date and source and indexed into `idea`.
- [ ] AC-3: The inbox (dashboard widget with untriaged counter, expandable list) offers *Turn into feature* (wizard pre-filled; after saving the idea shows "→ FI-xxx"), *Merge into…* (feature picker) and *Dismiss* (reason).
- [ ] AC-4: FR-111 acceptance passes.

## Technical Notes
- Related design document: spec/03_design/functional_design/user_flows.md UF-19; use_cases.md UC-047; technical_design/data_model.md §1.6
- Related requirements: FR-111, NFR-032
- Release: R2

## Dependencies
- US-082 Add feature: entry points and wizard (describe, save, resume)

## Implementation Details
<!-- Filled in by /implement-userstories after implementation -->

## Test Coverage
<!-- Filled in by /implement-userstories after implementation -->
