---
id: US-069
title: Design tokens, CSS architecture and light/dark foundation
status: done
size: M
epic: UI design system
---

## Business Value
Gives the whole UI one source of truth for colours, type, spacing, radii and shadows. That is the base for a consistent modern look and a complete dark theme (NFR-033, NFR-020, D25), and it stops new code from adding ad-hoc colours.

## Description
As a **SpecForge user**, I want **the application to use one consistent, modern visual foundation in light and dark** so that **it looks calm and coherent and follows my OS appearance**.

## Acceptance Criteria
- [x] AC-1: `packages/ui/src/styles/` holds `index.css` with the cascade layers `reset, tokens, base, components, areas, utilities` and the files of `ui_design_concept.md` §6. `tokens.css` defines every token of §2 (colours for light and, under `@media (prefers-color-scheme: dark)`, dark; type scale; spacing; control heights; radii; shadows; motion; z-index). The old `styles.css` rules are moved into the matching `areas/*.css` and use tokens instead of literals; the renderer loads only `styles/index.css`.
- [x] AC-2: `base.css` applies the font stacks, the 14 px base size in rem (OS zoom still works), body text and background from tokens, a 2 px `--focus` ring for `:focus-visible`, `prefers-reduced-motion` (no transitions) and `forced-colors` (borders and focus stay visible).
- [x] AC-3: A repository check (`pnpm check:tokens`, part of `pnpm lint` and CI) fails on colour literals (`#…`, `rgb()`, `hsl()`, named colours except `transparent`/`currentColor`), `box-shadow` values and `font-size` values outside `tokens.css`. Its own tests cover a passing and a failing stylesheet, and the current code passes.
- [x] AC-4: The automated WCAG 2.1 AA contrast check (`accessibility.e2e.test.ts`, axe `color-contrast`) runs in **both** colour schemes (Playwright `emulateMedia({ colorScheme })`) for all primary areas and passes.
- [x] AC-5: The renderer CSP is unchanged (`style-src 'self'` + nonce, no `unsafe-inline`). Build, layering check and the existing UI and E2E tests stay green; accessible names and roles do not change.

## Technical Notes
- Related design document: `spec/03_design/functional_design/ui_design_concept.md` §2, §3, §6, §7
- Related design document: `spec/03_design/technical_design/c4_architecture.md` — ADR-023
- Related requirements: NFR-033, NFR-020; intent D25
- Release: R1
- This story only lays the foundation: a visible change (neutral greys, focus ring, dark mode) is expected, but the component redesign is US-070 / US-071 and the area redesigns are US-072 – US-076.
- The token check can be a small `tooling/src/cli` script (like `check-spdx`) instead of adding stylelint; either is fine.

## Dependencies
- None

## Implementation Details
Files created / modified:
- `packages/ui/src/styles/index.css` — entry: layer order `reset, tokens, base, components, areas, utilities` and imports
- `packages/ui/src/styles/tokens.css` — all tokens of `ui_design_concept.md` §2 (light on `:root`, dark under `prefers-color-scheme: dark`), plus `--review*`, `--overlay`, `--highlight*`, `--epic-0…7`, font weights
- `packages/ui/src/styles/reset.css`, `base.css` (font stacks, 14 px root via `--font-size-root: 87.5%`, headings, links, mono, selection, 2 px focus ring, reduced motion, forced colours), `utilities.css` (`visually-hidden`, `hint`, `path`/`mono`, `truncate`)
- `packages/ui/src/styles/areas/{shell,overlays,kanban,graph,specs,review,setup,executions}.css` — the former `styles.css` rules, migrated to tokens (no literals)
- `packages/ui/src/styles.css` — removed; `packages/ui/src/main.tsx` imports `./styles/index.css`
- `tooling/src/tokens.ts` + `tooling/src/cli/check-tokens.ts` — token guardrail (colour literals incl. hex, colour functions and named colours; `box-shadow` other than `none`/tokens; `font-size` other than tokens/keywords) for every `.css` below `packages/` except `tokens.css`; `package.json`: `check:tokens`, appended to `pnpm lint` (so CI runs it)
- `packages/main/test/accessibility.e2e.test.ts` — contrast check per area in `light` and `dark` (`page.emulateMedia({ colorScheme })`)
- Spec: `ui_design_concept.md` §2.1 lists the additional tokens

Decisions / deviations:
- System colours (e.g. `CanvasText`) stay allowed for `forced-colors` rules; they are not named colours.
- Vite's CSS minifier drops the explicit `@layer` order statement but keeps the order of first appearance (with an empty `@layer components;` placeholder), which is equivalent.
- React Flow's own stylesheet (imported from JS) is still unlayered; it only targets `.react-flow*` and is moved into the `areas` layer with US-074.
- No stylelint dependency: the check is a small tooling module like `check-spdx`.

## Test Coverage
- Coverage: `tooling/src/tokens.ts` 100 % (statements, branches, functions, lines); CSS is verified by the structure tests and the E2E contrast check
- Test files: `tooling/test/tokens.test.ts` (4), `packages/ui/test/styles.test.ts` (5), `packages/main/test/accessibility.e2e.test.ts` (adapted: both colour schemes, passes)
- Full suite: 1006 passed; build, layering, lint and `check:tokens` green
- 9 new tests
