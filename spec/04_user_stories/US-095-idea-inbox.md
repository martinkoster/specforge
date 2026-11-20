---
id: US-095
title: Idea inbox
status: done
size: M
epic: Feature workflow
---

## Business Value
Quick ideas are captured in seconds and triaged later, so nothing gets lost and flow is not interrupted (FR-111, NFR-032).

## Description
As a **SpecForge user**, I want to **capture one-line ideas and later turn them into features, merge or dismiss them** so that **I keep ideas without starting work on them**.

## Acceptance Criteria
- [x] AC-1: *Capture idea* (Add feature menu, dashboard widget input, **Ctrl/Cmd+Shift+I**) opens a popover with a text line and an optional note; Enter saves — at most 2 interactions from any screen.
- [x] AC-2: Ideas are appended to `01_intent/ideas.md` (format per data_model §1.6) with date and source and indexed into `idea`.
- [x] AC-3: The inbox (dashboard widget with untriaged counter, expandable list) offers *Turn into feature* (wizard pre-filled; after saving the idea shows "→ FI-xxx"), *Merge into…* (feature picker) and *Dismiss* (reason).
- [x] AC-4: FR-111 acceptance passes.

## Technical Notes
- Related design document: spec/03_design/functional_design/user_flows.md UF-19; use_cases.md UC-047; technical_design/data_model.md §1.6
- Related requirements: FR-111, NFR-032
- Release: R2

## Dependencies
- US-082 Add feature: entry points and wizard (describe, save, resume)

## Implementation Details
Files created / modified:
- `packages/application/src/specs/ideas.ts` (new) — `ideas.md` format (data_model §1.6): `parseIdeas`, `appendIdea` (creates the file with `kind: ideas`), `updateIdea` (meta line: state, `→ FI-x`, `— reason`), `nextIdeaId`
- `packages/application/src/specs/idea-service.ts` (new) — capture (date, source; serialised per project), list with untriaged counter, merge, dismiss (reason), `turnedIntoFeature`; triaged ideas cannot be triaged again
- `packages/application/src/indexing/parse-artifact.ts` — `kind: ideas` → `ideas`; `packages/adapters/sqlite/src/index-repository.ts` — index table `idea` (replaced per file, part of *Rebuild index*), `schema.ts` — migration 29
- `packages/application/src/specs/feature-wizard.ts` — `source_idea` in the feature intent; saving reports the feature to the inbox ("→ FI-xxx")
- `packages/ipc-contract/src/contract.ts` — `ideas.list`, `ideas.capture`, `ideas.merge`, `ideas.dismiss`, `features.wizard.create` with `sourceIdea`; `packages/core/src/composition.ts` — wiring
- UI: `features/CaptureIdeaDialog.tsx` (new: text line + optional note, Enter saves), `features/IdeaInbox.tsx` (new: dashboard widget with counter, capture line, *Turn into feature*, *Merge into…* (feature picker), *Dismiss…* (reason), *Show all*), `features/FeatureWizard.tsx` (pre-filled from the idea, draft linked to it), `dashboard/DashboardArea.tsx` (*Capture idea* in the Add feature menu, inbox widget), `App.tsx` (**Ctrl/Cmd+Shift+I**), `styles/areas/features.css`

Decisions / deviations:
- *Merge into…* records the merge on the idea (`state: merged → FI-x`); the feature intent file is not edited.
- Capturing from the chat ("save as idea") is part of US-100.

## Test Coverage
- Coverage (lines): `idea-service.ts` 100 %, `index-repository.ts` 100 %, `ideas.ts` 97.8 %, `IdeaInbox.tsx` 97.8 %, `feature-wizard.ts` 96.8 %, `FeatureWizard.tsx` 94 %, `DashboardArea.tsx` 94 %, `CaptureIdeaDialog.tsx` 85 %, `App.tsx` 78.5 %; overall 95.2 %
- Test files: `packages/application/test/ideas.test.ts` (4), `idea-service.test.ts` (3), `feature-wizard.test.ts` (+1), `packages/adapters/sqlite/test/feature-index.test.ts` (+1), `packages/core/test/feature-wizard-ipc.test.ts` (+1: FR-111 acceptance — capture, turn into feature, "→ FI-002"), `packages/ui/test/idea-inbox.test.tsx` (5), `app.test.tsx` (+2: shortcut from any screen, Add feature menu, wizard pre-filled)
- Full suite: 1358 passed; lint, build and layering green
- 17 new tests
