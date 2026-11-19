---
id: US-074
title: Redesign dashboard, Kanban board and dependency graph
status: done
size: M
epic: UI design system
---

## Business Value
The dashboard and the board are where users spend most of their planning time. Scannable cards, clear status and pleasant drag and drop make SpecForge feel like the modern planning tools users already enjoy (UF-03, UF-12, NFR-033).

## Description
As a **SpecForge user**, I want **a clean dashboard and a modern Kanban board with readable story cards** so that **I can see progress and plan work at a glance**.

## Acceptance Criteria
- [x] AC-1: Dashboard widgets are cards (header with title and action, body, footer) in a responsive grid. Counters use tabular numbers, the next-step recommendation is a prominent callout with its primary action, and the coverage strip and run summary use status colours with icon and text.
- [x] AC-2: Kanban columns sit on `--bg-subtle` with a header (name + count pill). Story cards show the ID (mono, muted), the title, an epic chip, a dependency badge and a status icon. Dragging lifts the card (`--shadow-md`, slight scale, none with reduced motion), drop targets are highlighted, and epic swimlane headers are sticky.
- [x] AC-3: The queue UI and the board/graph view toggle use the segmented control. The dependency graph (React Flow) styles nodes, edges, selection, minimap and background from tokens in both themes.
- [x] AC-4: The keyboard move of cards (dnd-kit) and its live announcements work as before (US-065 keyboard workflow green).
- [x] AC-5: Dashboard, board and graph pass the axe contrast check in light and dark, and `expectStyledControls` passes in their tests. Existing dashboard/board/graph UI and E2E tests pass, and the NFR-001 responsiveness check (`responsiveness.e2e.test.ts`) still passes.

## Technical Notes
- Related design document: `spec/03_design/functional_design/ui_design_concept.md` §4.2 (Kanban), §5; `user_flows.md` UF-03, UF-12, UF-15
- Related requirements: FR-019, FR-064, FR-085, NFR-001, NFR-030, NFR-033
- Release: R1
- React Flow ships its own stylesheet: import it into the `areas` layer and override it through tokens, not literals.

## Dependencies
- US-072 Redesign the application shell (sidebar, top bar, page header, phase stepper)

## Implementation Details
Files created / modified:
- `packages/ui/src/dashboard/DashboardArea.tsx` — widgets as cards in a responsive grid (`widget-header`, body, `widget-footer`); story counts as status badges with tabular `stat-value`s; "No stories yet" empty state; next step as a prominent info callout with a primary action; run summary with tabular numbers
- `packages/ui/src/board/StoryCard.tsx` — drag handle icon, mono story ID, status icon (spinning while running), title, epic `Tag` with colour marker, size tag, approval / "Blocked by" / "Blocks" / "Related" status badges, dependency toggle icon
- `packages/ui/src/board/KanbanBoard.tsx` — column count as pill; `packages/ui/src/board/KanbanArea.tsx` — Layout and View toggles as segmented controls
- `packages/ui/src/styles/areas/kanban.css` (rewritten: columns on `--bg-subtle`, highlighted drop target, card lift on drag — `--shadow-md` and `scale: 1.02`, none with reduced motion —, sticky swimlane headers, epic colours as `--epic` variable), `areas/graph.css` (React Flow variables from tokens: background, pattern, nodes, edges, controls, minimap), new `areas/dashboard.css`, `components/badge.css` (`pill-neutral`, epic tag marker)
- Tests adapted: `kanban-dependencies.test.tsx` (Related title on the badge), `swimlanes.test.tsx` (epic tag selector `.tag`)

Decisions / deviations:
- React Flow's stylesheet stays imported from JS (unlayered); it is themed only through its own CSS variables, which our layered rules set — so no specificity fight and no copy of its CSS.
- The story card keeps its `card` class names (area-scoped in `kanban.css`); dashboard cards use `dashboard-widget`.
- The epic coverage strip (US-035) already uses a `Callout` since US-070.
- Bundle: +135 kB minified for the whole redesign so far (esbuild measurement, HEAD 1,762 kB → 1,897 kB; Radix, Lucide and helpers 109 kB). The NFR-003 cold-start E2E passes when run alone (SpecForge share 4.0 s); in the full suite run while unit tests ran in parallel it measured 5.2 s — machine load, not a functional change.

## Test Coverage
- Coverage (lines): `StoryCard.tsx` 100 %, `DashboardArea.tsx` 100 %, `KanbanBoard.tsx` 88.7 %, `KanbanArea.tsx` 75.6 % (was 70.7 %; tests added for the toggles, the load error and the recovery dialog)
- Test files: `packages/ui/test/board-design.test.tsx` (5), `packages/ui/test/swimlanes.test.tsx` (+3); E2E suite: 18 of 19 green in the full run, cold start green alone; responsiveness (NFR-001) green
- 8 new tests
