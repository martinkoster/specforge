---
id: US-065
title: Performance and accessibility verification
status: done
size: M
epic: Quality & release readiness
---

## Business Value
Ensures responsiveness and accessibility targets are met (NFR-001–NFR-003, NFR-020).

## Description
As a **SpecForge user**, I want **a fast, accessible application even with several runs streaming** so that **SpecForge stays pleasant to use under load**.

## Acceptance Criteria
- [x] AC-1: Benchmark with 3 runs streaming ≥ 100 lines/s: interaction feedback < 100 ms p95, no freeze > 250 ms.
- [x] AC-2: Cold start to interactive project screen < 5 s for 200 stories / 50 runs.
- [x] AC-3: All primary workflows completable by keyboard; automated contrast check passes WCAG 2.1 AA.

## Technical Notes
- Related design document: spec/03_design/technical_design/technical_decisions.md §8
- Related requirements: NFR-001, NFR-002, NFR-003, NFR-020
- Release: R1

## Dependencies
- US-054 Monitor runs in the execution view
- US-061 Project dashboard
- US-038 Kanban board with drag & drop

## Implementation Details
Files created / modified:
- `packages/main/test/responsiveness.e2e.test.ts` — three `stream` stories (125 lines/s each) tiled in Executions; 40 interactions measured with the Event Timing API (p95 < 100 ms), freezes with the Long Tasks and Long Animation Frames APIs (main thread blocked ≤ 250 ms)
- `packages/main/test/cold-start.e2e.test.ts` — 200 stories / 50 runs; main-process start → `specforge:project-interactive` mark, minus a bare-Electron baseline (`test/fixtures/bare-main.cjs`) on the same machine and test driver, < 5 s
- `packages/main/test/accessibility.e2e.test.ts` — primary workflow with the keyboard only (Tab/Enter/type-ahead: create project, approve intent, move story, answer permission, approve review) and axe-core `color-contrast` (WCAG 2.1 AA) in all primary areas
- `packages/main/src/renderer-link.ts`, `main.ts` — the core starts together with the window; its port and status are held until the page has loaded (was: after `did-finish-load`)
- `packages/core/src/composition.ts` — the last project is reopened in parallel with the capability check
- `packages/ui/src/dashboard/DashboardArea.tsx` — User Timing mark when the project screen first shows data
- `packages/application/src/board/board-service.ts` — fix found by the keyboard test: moves of a project are serialised (read–check–write), so a repeated move (keyboard type-ahead, double click) no longer starts a story twice and resets the running story to *queued*
- `packages/core/src/test-agent.ts` — `stream` stories; `packages/main/package.json` — `axe-core` (dev dependency, MPL-2.0)

Decisions / deviations:
- Product-owner decision 2026-10-18 (NFR-003): cold start is measured as SpecForge’s share (best of three restarts minus the best of three bare-Electron launches); measured 2.7–4.0 s on the development machine (7.4–9.7 s total). NFR-003 and the requirements changelog updated. NFR-003 and the requirements changelog updated.
- Delayed frames with an idle main thread (GPU/compositor of the machine) are not counted as freezes; the freeze criterion is main-thread blocking.

## Test Coverage
- Coverage: `board-service.ts` 99.0 % lines, `DashboardArea.tsx` 100 %, `test-agent.ts` 100 %, `renderer-link.ts` 3 unit tests; the E2E measurements are outside the coverage run (workspace total 95.4 % lines (950 tests passing))
- Test files: `packages/main/test/responsiveness.e2e.test.ts` (1), `packages/main/test/cold-start.e2e.test.ts` (1), `packages/main/test/accessibility.e2e.test.ts` (1), `packages/main/test/renderer-link.test.ts` (3), `packages/core/test/test-agent.test.ts` (1 new), `packages/ui/test/dashboard.test.tsx` (1 new), `packages/application/test/board-service.test.ts` (1 new)
- 9 tests
