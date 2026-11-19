---
id: US-076
title: Redesign executions, logs, pending decisions, chat and settings
status: done
size: M
epic: UI design system
---

## Business Value
Watching runs, answering permission prompts and configuring SpecForge must feel just as polished as planning. This story completes the redesign so that no screen keeps the old look (UF-05, UF-08, UF-13, NFR-033).

## Description
As a **SpecForge user**, I want **run views, logs, permission prompts, chat and settings in the same modern style** so that **the whole application feels consistent and trustworthy**.

## Acceptance Criteria
- [x] AC-1: The executions view shows the run list as a table with status badges (running with a spinning icon, queued, completed, failed, cancelled), run tiles as cards and the run panel with a page-header action bar (cancel, retry, resume, discard as button variants, with `danger` for destructive ones).
- [x] AC-2: The live log view uses the monospace type tokens, a `--bg-subtle` gutter with line numbers, search highlights in `--warning-subtle` and an ANSI colour palette for light and dark that meets AA on the log background. Virtualisation and NFR-005 performance are unaffected.
- [x] AC-3: The pending-decisions panel and permission prompts show the tool, the command/path in mono, the risk hint as a callout and the decisions as clearly ranked buttons (*Allow once* primary, *Always allow…* secondary, *Deny* danger-outline). The keyboard order is unchanged.
- [x] AC-4: The project chat (read-only) uses message bubbles/cards with an author label, rendered Markdown in the document style and an input field in the field style. Settings sections (environment status, agent runtimes, default approval rules, project, plus *Appearance* from US-077) use the tabs/segmented navigation, forms and the table pattern.
- [x] AC-5: The areas pass the axe contrast check in light and dark, and `expectStyledControls` passes in their tests. After this story no area uses the old ad-hoc classes: unused rules are removed from `areas/*.css`, and `check:tokens` passes. Existing executions/settings/pending/chat UI and E2E tests pass.

## Technical Notes
- Related design document: `spec/03_design/functional_design/ui_design_concept.md` §4.2 (logs), §5; `user_flows.md` UF-05, UF-08, UF-13
- Related requirements: FR-031, FR-033, FR-049, FR-054, FR-089, NFR-005, NFR-033
- Release: R1

## Dependencies
- US-072 Redesign the application shell (sidebar, top bar, page header, phase stepper)
- US-077 Choose the colour theme (System / Light / Dark)

## Implementation Details
Files created / modified:
- `packages/ui/src/executions/ansi.tsx` — `parseAnsi` (SGR colours 30–37 / 90–97, bold, resets; other escape sequences dropped) and `AnsiText`; used by `RunLog.tsx` for every log line (virtualisation unchanged)
- `packages/ui/src/styles/tokens.css` — `--ansi-red|green|yellow|blue|magenta|cyan` for light and dark (AA on `--bg-subtle`, verified by a test that computes the contrast from the token file)
- `packages/ui/src/executions/ExecutionsArea.tsx` — run statuses as `StatusBadge`s (running spins), *Cancel* as destructive small button, run panel tabs as a segmented tab list
- `packages/ui/src/pending/PermissionPrompt.tsx` — tool name in mono, arguments block, outside-workspace risk as warning callout, *Allow* primary / *Deny* danger / *Always allow…* secondary (order unchanged), message field in field style
- `packages/ui/src/dashboard/ChatPanel.tsx` — message cards with author label
- `packages/ui/src/settings/SettingsArea.tsx` — `SettingsNav` (in-page section navigation) and sections as cards (Appearance, Agent, Project, Execution, Approval rules)
- CSS: `areas/executions.css` (rewritten: run table, panels, tabs, log, ANSI classes; old `.chip*` rules removed), `areas/overlays.css` (pending decisions, permission prompts), new `areas/settings.css`, chat styles in `areas/dashboard.css`; unused `.view-toggle` removed
- Tests adapted: `pending-decisions.test.tsx` (risk callout text "Outside the workspace")
- Spec / docs: `ui_design_concept.md` (ANSI tokens), `CLAUDE.md` (styling conventions)

Decisions / deviations:
- The log had no ANSI handling before (escape codes were shown raw); the renderer now colours SGR codes from tokens.
- Settings keep all sections on one page with an in-page navigation (instead of tabs that would hide sections), so existing flows and tests keep working.

## Test Coverage
- Coverage (lines): `ansi.tsx` 100 %, `PermissionPrompt.tsx` 100 %, `SettingsArea.tsx` 94.3 %, `RunLog.tsx` 93.5 %, `ExecutionsArea.tsx` 93.2 %, `ChatPanel.tsx` 89.8 %
- Test files: `packages/ui/test/executions-design.test.tsx` (4), `packages/ui/test/executions.test.tsx` (+1); full E2E suite (11 files, 19 tests, contrast light + dark) green; NFR-005 log performance unchanged
- Full suite: 1066 passed, overall 95.4 % lines; lint, `check:tokens` green
- 5 new tests
