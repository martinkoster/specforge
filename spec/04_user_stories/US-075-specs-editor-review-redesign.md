---
id: US-075
title: Redesign intent, specifications, editor and review screens
status: done
size: M
epic: UI design system
---

## Business Value
Reading, editing and approving specifications and reviewing code diffs are the core human decisions in SpecForge. A clean document layout and editor and diff views that match the theme make those decisions easier and less tiring (UF-02, UF-06, NFR-033).

## Description
As a **SpecForge user**, I want **specification documents, the editor and diffs to look clean and match the app theme** so that **I can read, decide and approve comfortably for a long time**.

## Acceptance Criteria
- [x] AC-1: The intent and specification areas use the page header, a readable document column (max 1200 px, comfortable line length for rendered Markdown), the artifact list as a table/list pattern with status badges, and approve/refine/quality-check actions as `primary`/`secondary` buttons.
- [x] AC-2: A CodeMirror theme extension reads the tokens (background, text, selection, gutter, cursor, search match, Markdown highlighting) and looks right in light and dark. It switches with the colour scheme without reloading the editor, and the CSP nonce mechanism stays as is.
- [x] AC-3: The review screen (merge diffs, side-by-side/unified toggle as a segmented control, file list, approve/reject/request corrections) uses the same CodeMirror theme. Additions and deletions get AA-compliant `--success-subtle` / `--danger-subtle` backgrounds plus +/− markers.
- [x] AC-4: Clarification questions, AI quality-check findings and spec-run Keep/Discard reviews use cards, callouts and status badges instead of plain paragraphs.
- [x] AC-5: The areas pass the axe contrast check in light and dark, and `expectStyledControls` passes in their tests. Existing intent/spec/editor/review UI and E2E tests pass with unchanged accessible names.

## Technical Notes
- Related design document: `spec/03_design/functional_design/ui_design_concept.md` §3 (third-party views), §4.2, §5; `user_flows.md` UF-02, UF-06, UF-09, UF-10
- Related requirements: FR-043, FR-080, FR-081, NFR-033; technical decision "Diff view" (CodeMirror merge)
- Release: R1

## Dependencies
- US-072 Redesign the application shell (sidebar, top bar, page header, phase stepper)

## Implementation Details
Files created / modified:
- `packages/ui/src/specs/editor-theme.ts` — `editorThemeSpec` (editor, gutter, active line, selection, cursor, search matches, merge-view inserted / changed / deleted lines with +/− markers — all colours as CSS variables) and `editorAppearance` (theme, `sf-editor` class, Markdown highlighting from tokens); used by `MarkdownEditor.tsx` and `review/DiffView.tsx` (side by side and unified). The editor follows the light/dark switch without being recreated; the CSP nonce mechanism is unchanged.
- `packages/ui/src/specs/ArtifactList.tsx` — list rows (`artifact-item`, current item highlighted) with approval / invalid status badges
- `packages/ui/src/specs/ArtifactEditor.tsx` — toolbar with approval badge, *Approve* as primary, open findings as warning badge
- `packages/ui/src/specs/ArtifactAiPanel.tsx` — findings as cards with severity badges (critical danger, major warning, minor info, info neutral)
- `packages/ui/src/review/ReviewPanel.tsx` — diff layout toggle as segmented control
- `packages/ui/src/specs/ReviewChangesDialog.tsx` — validation issues as warning callout (spec-run Keep/Discard dialog already restyled in US-071)
- `packages/ui/src/styles/areas/specs.css` — rewritten: sticky artifact list, toolbar bar, readable preview column (`72ch`, tables, code), side panels and finding / clarification cards
- `packages/ui/package.json` — `@codemirror/language`, `@lezer/highlight` as direct dependencies (were transitive)

Decisions / deviations:
- Page headers for Intent and Specifications came with US-072; clarification items are styled as cards through their existing `clarify-item` class.

## Test Coverage
- Coverage (lines): `editor-theme.ts` 100 %, `DiffView.tsx` 100 %, `ArtifactList.tsx` 100 %, `ReviewChangesDialog.tsx` 100 %, `ArtifactEditor.tsx` 94.9 %, `ArtifactAiPanel.tsx` 93.0 %, `ReviewPanel.tsx` 91.7 %, `ClarificationPanel.tsx` 90.7 %
- Test files: `packages/ui/test/specs-design.test.tsx` (4); existing intent / spec / editor / review tests green; full E2E suite (11 files, 19 tests, contrast light + dark) green
- Full suite: 1066 passed, overall 95.4 % lines
- 4 new tests
