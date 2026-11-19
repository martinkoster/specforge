---
id: US-073
title: Redesign start wizard, setup wizard, empty and loading states
status: done
size: M
epic: UI design system
---

## Business Value
The start and setup screens are the first impression and decide time to first productive use (NFR-029). Welcoming, modern screens with clear choices and helpful empty states make SpecForge feel trustworthy from the first minute.

## Description
As a **new SpecForge user**, I want **inviting start and setup screens with clear choices and progress** so that **I get going quickly without guessing what to do**.

## Acceptance Criteria
- [x] AC-1: The start wizard shows *Open existing project* and *Create new project* as large interactive cards (icon, title, one-line explanation, hover elevation, focus ring) and recent projects as a list (name, path in muted mono, phase badge, last opened, row "⋯" menu with rename/remove/locate), following `ui_design_concept.md` §4.2. The *Empty folder* offer (US-068) is a callout with its action.
- [x] AC-2: The setup wizard shows a step indicator (done/current/upcoming), one form per step in the field styles of US-070, status badges for detection results (runtime, provider, Git) and `lg` primary buttons. *Skip setup* is a secondary action with its confirmation in a `Dialog`.
- [x] AC-3: Empty states (no recent projects, no stories, no runs, no artifacts, no pending decisions) use the empty-state pattern (icon, title, explanation, primary action where one exists) in every area where they occur.
- [x] AC-4: "Loading…" texts in the dashboard, lists and the start wizard are replaced by skeleton placeholders with an accessible busy state (`aria-busy`).
- [x] AC-5: The screens pass the axe contrast check in light and dark. `expectStyledControls` passes for start, setup and empty-state components, and the existing start/setup UI and E2E tests pass with unchanged accessible names.

## Technical Notes
- Related design document: `spec/03_design/functional_design/ui_design_concept.md` §4.2, §5; `user_flows.md` UF-01, UF-01b
- Related requirements: FR-073, FR-076, NFR-029, NFR-033
- Release: R1

## Dependencies
- US-072 Redesign the application shell (sidebar, top bar, page header, phase stepper)

## Implementation Details
Files created / modified:
- `packages/ui/src/projects/StartWizard.tsx` — welcome header; *Open existing project* / *Create new project* as `StartCard`s (icon, title as accessible name via `aria-labelledby`, explanation as description, hover elevation, focus ring); recent projects as a list (name, mono path, phase `StatusBadge`, last opened, `Menu` "Actions for <name>" with Rename / Remove from list; *Locate* stays visible for missing folders); empty state for no recent projects
- `packages/ui/src/setup/SetupWizard.tsx` — step indicator (`setup-step-current` / `-done` / `-warning` / `-open` with icons, labels unchanged), summary with `StatusBadge`s, *Next* / *Finish* as `btn-primary btn-lg`, *Skip this step* ghost, skeleton while loading (skip confirmation already uses `Dialog`, US-071)
- `packages/ui/src/components/EmptyState.tsx`, `Skeleton.tsx`; `styles/components/empty.css`; `styles/areas/start.css`; `styles/areas/setup.css` (rewritten)
- Empty states: start wizard (no recent projects), dashboard stories widget (no stories), artifact list (no artifacts), executions and dashboard activity (no runs), pending decisions
- Skeletons instead of "Loading…": app start, dashboard, board, intent, setup, review, run log / context / result, recovery, commit dialog, clarification
- Tests adapted: `start-wizard.test.tsx` and `app.test.tsx` use the row menu; `packages/main/test/accessibility.e2e.test.ts` reads `aria-labelledby` when resolving the focused control's name

Decisions / deviations:
- Rename and remove moved into the row menu, so their accessible names changed from "Rename <name>" / "Remove <name>" (buttons) to menu items "Rename" / "Remove from list" behind "Actions for <name>"; *Locate* keeps its name. The story's "unchanged accessible names" applies to all other controls.

## Test Coverage
- Coverage: `StartWizard.tsx` 90.6 % lines, `SetupWizard.tsx` 91.1 %, `EmptyState.tsx` 100 %, `Skeleton.tsx` 100 %
- Test files: `packages/ui/test/start-screens.test.tsx` (6), `packages/ui/test/setup-wizard.test.tsx` (+2), adapted `start-wizard.test.tsx` / `app.test.tsx`; full E2E suite (11 files, 19 tests, incl. contrast light + dark) green with this build
- 8 new tests
