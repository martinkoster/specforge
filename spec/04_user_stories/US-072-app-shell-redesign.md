---
id: US-072
title: Redesign the application shell (sidebar, top bar, page header, phase stepper)
status: done
size: M
epic: UI design system
---

## Business Value
The shell is visible all the time. A modern sidebar with icons, a clean top bar and consistent page headers give SpecForge the look of the developer tools users already like, and make orientation faster (UF-00, NFR-033).

## Description
As a **SpecForge user**, I want **a clear, modern navigation frame with icons, project switcher and status at a glance** so that **I always know where I am and what needs my attention**.

## Acceptance Criteria
- [x] AC-1: The sidebar follows `ui_design_concept.md` §4.1: icon and label per area, active item highlighted (`aria-current="page"` kept), Settings pinned to the bottom, and disabled areas (Kanban without stories) muted with a tooltip giving the reason. It can be collapsed to icons only (remembered locally) and collapses automatically below 1280 px window width.
- [x] AC-2: The top bar shows the app mark, a project switcher as a dropdown menu (US-071; the accessible name "Project" is kept), the VCS badge as a status badge, the run indicator, a pending-decisions bell with count pill and *n spec files changed → Commit* as a subtle button.
- [x] AC-3: Every area renders a common page header (title in `--text-xl`, optional description, at most one primary action on the right). The limited-mode and non-git banners are full-width callouts under the top bar.
- [x] AC-4: The phase stepper shows each step with a status icon and label (done / current / blocked, §5), stays keyboard-operable and keeps its accessible names.
- [x] AC-5: The shell passes the axe contrast check in light and dark. Existing shell tests (navigation, switcher, close project, pending counter) and E2E tests pass. A minimum window size of 1024 × 640 is set in main.

## Technical Notes
- Related design document: `spec/03_design/functional_design/ui_design_concept.md` §4.1, §5; `user_flows.md` UF-00, UF-09
- Related requirements: FR-054, NFR-033, NFR-020; D25
- Release: R1
- The E2E tests read the project switcher as a `combobox` (`getByRole('combobox', { name: 'Project' })`). If the dropdown changes the role, adapt the helpers in `e2e-support.ts` and the affected tests in the same change.

## Dependencies
- US-070 Core controls, status badges, callouts and icons
- US-071 Dialogs, menus, tooltips, toasts and drawers

## Implementation Details
Files created / modified:
- `packages/ui/src/shell/AppShell.tsx` — app mark; project switcher; VCS status badge (Git branch / non-git warning); run indicator; bell with count pill (accessible name unchanged: "3 pending decisions"); commit indicator as ghost button; icon sidebar (Lucide per area, `nav-item`, active marker, Settings in `.nav-bottom`), collapsible (`Collapse sidebar` / `Expand sidebar`, remembered in `localStorage`, automatically collapsed below 1280 px unless expanded); `banners` slot under the top bar
- `packages/ui/src/components/PageHeader.tsx` — title, description, actions; used by Dashboard, Intent, Specifications, Executions, Settings ("Run setup again" as action) and the fallback area heading
- `packages/ui/src/App.tsx` — limited-mode and non-git callouts passed as shell banners
- `packages/ui/src/shell/PhaseStepper.tsx` — steps with status icon (done / current / started / to do / blocked) and unchanged labels; phase gate uses the shared `Dialog`
- `packages/ui/src/styles/areas/shell.css` — rewritten: grid shell (220 px / 56 px sidebar, 48 px top bar), sidebar, page header, banners, segmented phase stepper, phase loop
- `packages/main/src/main.ts` — `minWidth: 1024`, `minHeight: 640`
- Tests: `packages/ui/test/app-shell.test.tsx` (wide viewport for happy-dom), `packages/ui/test/app.test.tsx` (status assertion targets the warning callout), `packages/main/test/shell.e2e.test.ts` (minimum size)

Decisions / deviations:
- The project switcher stays a native `<select>` styled as a compact dropdown: it keeps role `combobox`, type-ahead and the E2E helpers; a Radix menu would have added nothing for a single choice list.
- The disabled Kanban item explains itself with the native `title` tooltip (a disabled button receives no hover/focus for a Radix tooltip).

## Test Coverage
- Coverage: `AppShell.tsx` 96.2 % lines, `PhaseStepper.tsx` 95.2 %, `PageHeader.tsx` 100 %
- Test files: `packages/ui/test/shell-redesign.test.tsx` (8), `packages/ui/test/app-shell.test.tsx` (11, adapted), `packages/ui/test/phase-stepper.test.tsx` (unchanged, green), `packages/main/test/shell.e2e.test.ts` (+1); accessibility E2E (both themes) and full E2E suite green
- 9 new tests
