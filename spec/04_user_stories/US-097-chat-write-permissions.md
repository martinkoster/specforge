---
id: US-097
title: Chat may write through the permission relay
status: ready for development
size: M
epic: Chat changes
---

## Business Value
The chat becomes a real working tool: it may change specifications and code, but only with the user's approval (FR-091, D17).

## Description
As a **SpecForge user**, I want to **allow the chat agent to edit files after I approve each write** so that **I can make quick changes conversationally without losing control**.

## Acceptance Criteria
- [ ] AC-1: Chat runs no longer deny all writes: every permission-requiring action goes through PermissionBroker with rules for `appliesTo ∈ {chat, all}`; the Release 1 read-only notice is removed.
- [ ] AC-2: Built-in denies stay: story `status` changes, SpecForge-internal paths (`.specforge/**` except specification content), starting runs.
- [ ] AC-3: In non-git mode, writes are denied with an explanation while an implementation run is active, and a write-capable chat run holds back implementation starts (FR-116b).
- [ ] AC-4: A write to a file in `file_touch` of an active or unmerged story shows *Overlap with US-x* in the prompt.
- [ ] AC-5: FR-091 acceptance up to the permission prompt passes with the scripted agent (README typo fix → prompt → allow → file changed).

## Technical Notes
- Related design document: spec/03_design/functional_design/use_cases.md UC-035; business_processes.md BP-06; c4_architecture.md ADR-016
- Related requirements: FR-091, FR-032, FR-051
- Release: R2

## Dependencies
- US-078 Per-project specification root

## Implementation Details
<!-- Filled in by /implement-userstories after implementation -->

## Test Coverage
<!-- Filled in by /implement-userstories after implementation -->
