---
id: US-100
title: Turn chat conversations into features and ideas
status: ready for development
size: S
epic: Chat changes
---

## Business Value
Ideas often come up while chatting; they should flow straight into the feature workflow (FR-102, FR-111).

## Description
As a **SpecForge user**, I want to **create a feature intent or an idea from a chat conversation** so that **nothing discussed in the chat gets lost**.

## Acceptance Criteria
- [ ] AC-1: When the agent's structured result suggests new functionality, the thread shows a card "Create a feature intent from this conversation?" that opens the feature wizard pre-filled with the agent's summary.
- [ ] AC-2: Each chat message has *Save as idea*, which captures the message text (editable) into the idea inbox with source *chat*.
- [ ] AC-3: Neither action changes files until the user saves in the wizard or the idea popover.

## Technical Notes
- Related design document: spec/03_design/functional_design/user_flows.md UF-13 (3b), UF-19; use_cases.md UC-043, UC-047
- Related requirements: FR-102, FR-111
- Release: R2

## Dependencies
- US-082 Add feature: entry points and wizard (describe, save, resume)
- US-095 Idea inbox

## Implementation Details
<!-- Filled in by /implement-userstories after implementation -->

## Test Coverage
<!-- Filled in by /implement-userstories after implementation -->
