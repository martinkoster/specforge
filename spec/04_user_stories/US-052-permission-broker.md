---
id: US-052
title: Permission broker and policy evaluation
status: done
size: M
epic: Agent execution
---

## Business Value
Creates the single audited decision point for every agent permission request (FR-032, ADR-013).

## Description
As a **SpecForge user**, I want **every agent action needing permission to be decided by my rules or by me** so that **nothing happens without my approval**.

## Acceptance Criteria
- [x] AC-1: Order: built-in denies (spec/** in implementation runs, FR-116b, story status changes) → outside-workspace always relayed → effective rules by run kind → relay to user.
- [x] AC-2: A relayed request pauses only its run (status Awaiting permission); no timeout; dismissal or shutdown = deny.
- [x] AC-3: Every request and decision (decider user/rule/default_deny, time) is stored immutably.
- [x] AC-4: Chat runs in R1 have all writes denied with an explanation (FR-089).

## Technical Notes
- Related design document: `spec/03_design/technical_design/c4_architecture.md` — ADR-013
- Related design document: `spec/03_design/technical_design/service_design.md` — permissionbroker
- Related requirements: FR-032, FR-051, FR-089, FR-116, NFR-007, NFR-008, NFR-012
- Release: R1

## Dependencies
- US-014 Manage global and project approval rules
- US-044 Define AgentAdapter port and MockAdapter

## Implementation Details
Files created / modified:
- `packages/domain/src/permissions/built-in-denies.ts` — `builtInDenial`: chat writes/shell (R1 read-only), `spec/**` / `.specforge/**` writes in implementation runs, agent story-status changes, non-git spec/chat writes while an implementation run is active
- `packages/application/src/permissions/permission-broker.ts` — `PermissionBroker.ask`: resolves tool paths against the run workspace (outside → relay), built-in denies → `decidePermission` (rules by run kind) → relay; relayed requests pause only their run and wait without timeout; `decide`, `dismiss`, `cancelRun`, `shutdown` (→ `default_deny`)
- `packages/adapters/sqlite/src/execution-store.ts` — `PermissionRequestRepository` (append-only; migration 8 trigger makes decided rows immutable), `undecided()` for startup cleanup

Decisions / deviations:
- The broker is wired into runs by the execution service (US-048), which owns the run status `awaiting_approval` and the adapter hooks; the UI prompts follow in US-053.
- Story-status changes are detected as file-tool writes to `spec/04_user_stories/**` whose new text contains a `status:` line.

## Test Coverage
- Coverage: `built-in-denies.ts` 100.0 % lines, `permission-broker.ts` 100.0 %, `execution-store.ts` 100.0 % (workspace total 97.4 % lines)
- Test files: `packages/domain/test/built-in-denies.test.ts` (4), `packages/application/test/permission-broker.test.ts` (13), `packages/adapters/sqlite/test/execution-store.test.ts` (2 of 6)
- 19 tests
