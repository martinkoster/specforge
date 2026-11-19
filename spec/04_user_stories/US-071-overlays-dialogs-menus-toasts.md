---
id: US-071
title: Dialogs, menus, tooltips, toasts and drawers
status: done
size: M
epic: UI design system
---

## Business Value
Dialogs and pop-ups are where users make decisions (approve, reject, create, commit). Modern overlays with a focus trap, Esc to close and a clear primary action make those moments safer and more pleasant (NFR-033, NFR-020).

## Description
As a **SpecForge user**, I want **dialogs, menus, tooltips and notifications that look modern and behave predictably** so that **decisions and feedback are clear and never get lost**.

## Acceptance Criteria
- [x] AC-1: A shared `Dialog` component (Radix Dialog) with overlay, title, description, footer actions (primary right), focus trap, Esc/overlay close (except while busy) and a `danger` variant for destructive confirmations. All existing dialogs (create project, commit spec changes, pending decisions, review, settings dialogs) use it, and their accessible names stay the same.
- [x] AC-2: `DropdownMenu` and `Tooltip` components (Radix) styled per `ui_design_concept.md` §5 and fully keyboard-operable. Icon-only buttons from US-070 use the tooltip.
- [x] AC-3: Toasts restyled: bottom-right stack, status icon, left status stripe, auto-dismiss after 5 s for info/success, errors stay until dismissed, optional action, `role="status"` / `role="alert"` kept.
- [x] AC-4: The right drawer (trace panel, story drawer) uses `--surface`, `--shadow-lg`, the slide-in motion tokens (none with reduced motion) and closes with Esc. Focus returns to the element that opened it.
- [x] AC-5: The `@radix-ui/*` packages pass `check:licenses` and `audit:deps`. The CSP stays strict (Radix positioning uses CSSOM styles only). The existing UI tests, the E2E suite and the keyboard workflow of US-065 pass.

## Technical Notes
- Related design document: `spec/03_design/functional_design/ui_design_concept.md` §4.1 (drawer), §5
- Related requirements: NFR-033, NFR-020; ADR-023
- Release: R1
- Radix portals render into `document.body`, so make sure E2E selectors that scope to a dialog still find their elements by role and name.

## Dependencies
- US-070 Core controls, status badges, callouts and icons

## Implementation Details
Files created / modified:
- `packages/ui/src/components/Dialog.tsx` — Radix Dialog: overlay, title, description, body, footer, focus trap, Esc / overlay close (blocked while `busy`), `danger` tone, `alertdialog` role
- `packages/ui/src/components/Drawer.tsx` — non-modal Radix Dialog on the right (page stays usable, outside clicks keep it open), header with title and Close, Esc closes, optional accessible label
- `packages/ui/src/components/Menu.tsx` (Radix DropdownMenu, "⋯" trigger or custom, danger items), `Tooltip.tsx` (Radix Tooltip on hover/focus), `focus.ts` (`useReturnFocus`: focus back to the opener when an overlay unmounts, never stealing focus)
- `packages/ui/src/pending/Toasts.tsx` — status icon and stripe, tones info / success / warning / danger, info and success dismiss after 5 s, danger toasts are alerts, optional action; `App.tsx` maps run outcomes (completed → success, failed → danger) and keeps the dismiss callback stable
- `packages/ui/src/styles/components/overlay.css` — dialog, drawer (slide-in), menu, tooltip, toasts with motion tokens; old dialog/drawer/toast rules removed from `areas/overlays.css`
- All dialogs migrated to `Dialog`: create project, commit spec changes, run recovery, spec-run review, conflict, close guard, phase gate, epic move / early queue (board), remove project, skip setup, draft inputs, delete epic (cancel left, confirm `primary` / `danger` right); drawers migrated to `Drawer`: story drawer, pending decisions
- `packages/ui/src/main.tsx` — `get-nonce` `setNonce(styleNonce)`: Radix's scroll lock tags its runtime `<style>` with the CSP nonce
- `packages/ui/package.json` — `@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-tooltip`, `get-nonce` (MIT)
- `packages/main/test/workflow.e2e.test.ts` — Esc now closes the story drawer (no extra Close click)

Decisions / deviations:
- Radix returns focus only to a `Dialog.Trigger`; our overlays are mounted while open, so `useReturnFocus` restores the opener's focus itself.
- A drawer with an explicit label clears Radix's `aria-labelledby` (which would otherwise win over `aria-label`).
- No icon-only buttons existed yet; the tooltip is used from US-072 on (sidebar toggle, row menus).

## Test Coverage
- Coverage: `Dialog.tsx` 80 % lines, `Drawer.tsx` 100 %, `Menu.tsx` 100 %, `Tooltip.tsx` 100 %, `focus.ts` 100 %, `components/**` overall 93 % lines
- Test files: `packages/ui/test/overlays.test.tsx` (8); existing dialog/drawer tests unchanged in names; full E2E suite (11 files, 19 tests) green with this build
- 8 new tests
