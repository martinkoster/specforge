---
id: US-070
title: Core controls, status badges, callouts and icons
status: done
size: M
epic: UI design system
---

## Business Value
Buttons, fields, status badges and warnings are on every screen. Making them modern and consistent removes most of the "dusty" impression, and status shown with icon plus text supports NFR-020 (status not by colour alone).

## Description
As a **SpecForge user**, I want **buttons, inputs, status labels and warnings that look and behave the same everywhere** so that **I can recognise actions and states at a glance**.

## Acceptance Criteria
- [x] AC-1: Button styles `btn` with `primary`, `secondary`, `ghost` and `danger` variants and `sm`/`md`/`lg` sizes, with hover, active, focus-visible, disabled and loading states (spinner, width kept). Icon-only buttons require an accessible name and show a tooltip (tooltip behaviour arrives with US-071; until then `title`).
- [x] AC-2: Field styles for text inputs, textareas, selects, checkboxes, radios and an on/off switch (label above, hint, error with icon and `aria-invalid`), following `ui_design_concept.md` §5.
- [x] AC-3: A `StatusBadge` component maps every story, run, phase and artifact status to the status colours of §2.1 plus a Lucide icon and a text label. A `Callout` component (info/success/warning/danger, icon, title, text, optional action) replaces the ad-hoc `banner banner-warning` paragraphs. Count pills and neutral tags (epic chip) exist as well.
- [x] AC-4: `lucide-react` is added (ISC, passes `check:licenses`). The icon mapping of §5.1 is defined in one module, and decorative icons are `aria-hidden`.
- [x] AC-5: All buttons, inputs, selects and checkboxes in `packages/ui/src` use these styles. A shared test helper `expectStyledControls(container)` (fails on a `button`/`input`/`select`/`textarea` without a component class) is applied in the existing tests of every area. A test-only component gallery (only with `SPECFORGE_TEST=1`) shows all variants and passes the axe contrast check in light and dark.

## Technical Notes
- Related design document: `spec/03_design/functional_design/ui_design_concept.md` §2.1, §5, §5.1, §7
- Related requirements: NFR-033, NFR-020; intent D25; ADR-023
- Release: R1
- Keep accessible names, roles and button texts unchanged so that the UI and E2E tests keep working; icons are added next to the text, not instead of it.

## Dependencies
- US-069 Design tokens, CSS architecture and light/dark foundation

## Implementation Details
Files created / modified:
- `packages/ui/src/styles/components/button.css` — `.btn` with `primary` / `secondary` / `ghost` / `danger`, `sm` / `lg`, `btn-icon`, hover / active / focus-visible / disabled / `aria-busy` loading (spinner, width kept), `.link` (text button), `.icon`, `.icon-spin`
- `packages/ui/src/styles/components/field.css` — `.field` (label above, `.field-hint`, `.field-error`), `.input` / `.select` / `.textarea` (incl. `aria-invalid`, disabled, read-only), `.checkbox` / `.radio` (`accent-color`), `.switch` (native checkbox, `role="switch"`), fieldset / legend
- `packages/ui/src/styles/components/badge.css` (status badges per tone, `.pill`, `.tag` with epic colour marker), `callout.css`, `gallery.css`
- `packages/ui/src/components/` — `icons.tsx` (Lucide mapping for areas, status tones and callouts; `Icon`, decorative `aria-hidden`), `StatusBadge.tsx` (`statusTone`, `statusLabel`; icon + text; spinning icon for running/preparing), `Callout.tsx` (icon, title, text, optional action; role alert/status or custom role + label), `Pill.tsx` (`CountPill`, `Tag`), `ComponentGallery.tsx` (test-only, `?test=1#gallery`), `index.ts`
- All 39 components with controls: component classes added to every `button`, `input`, `select`, `textarea` (195 elements, by a JSX-aware codemod; default `btn btn-secondary`, inputs `input` / `checkbox` / `radio`); top-bar buttons ghost, start cards `btn-lg`, recent-project names `link`, phase steps `btn-sm`
- Ad-hoc `banner banner-warning` blocks replaced by `Callout` in `App.tsx` (limited mode, non-git warning, empty folder), `KanbanBoard.tsx`, `ReviewPanel.tsx` (warnings, merge instructions), `CommitSpecDialog.tsx`, `EpicsPanel.tsx`, `SpecificationsArea.tsx`, `TracePanel.tsx`; old `.banner*` / `.badge` / `.link` rules removed from `areas/shell.css`
- `packages/ui/package.json` — `lucide-react` (ISC)
- Tests: `packages/ui/test/styled-controls.ts` (`styledClasses`, `unstyledControls`, `expectStyledControls`, `cleanupChecked`); every UI test file (34) now cleans up with `cleanupChecked`, so each rendered state of every area is checked; `packages/main/test/e2e-support.ts` exports `contrastViolations` (moved from the accessibility test)

Decisions / deviations:
- The guard accepts a class on the control or on its wrapping label, as long as the class appears in a selector of `src/styles` — no hard-coded allow list. React Flow's own controls are skipped (styled by React Flow, themed in US-074).
- Button variants are chosen per area in US-072 – US-076; this story sets `secondary` as the safe default.
- Icon-only buttons with tooltips arrive with US-071; existing icon-like buttons keep their text labels.

## Test Coverage
- Coverage: `packages/ui/src/components/**` 94.7 % lines / 91.4 % branches (`Callout` 100 %, `StatusBadge` 100 %, `Pill` 100 %, `icons` 100 %, `ComponentGallery` 75 %)
- Test files: `packages/ui/test/controls.test.tsx` (8), `packages/ui/test/styles.test.ts` (+2), `packages/main/test/gallery.e2e.test.ts` (1, contrast light + dark); guard applied in 34 existing UI test files; accessibility, shell, projects and theme E2E pass
- Full suite: 1025 passed; lint, `check:tokens`, `check:licenses`, `audit:deps` green
- 11 new tests
