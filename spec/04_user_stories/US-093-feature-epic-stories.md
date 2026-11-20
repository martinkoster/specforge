---
id: US-093
title: Feature epic and story breakdown
status: done
size: M
epic: Feature workflow
---

## Business Value
The feature becomes deliverable work on the board — new or extended epics with linked stories (FR-108).

## Description
As a **SpecForge user**, I want to **let the agent propose the epic and stories for a feature, including adjustments and rework stories** so that **the feature can be delivered through the Kanban board like any other work**.

## Acceptance Criteria
- [x] AC-1: In the *Epic & stories* phase the agent proposes a new epic (default) or extending epics from the impact list; the user approves the epic choice first.
- [x] AC-2: Stories are generated per epic (FR-094) and linked via `feature: FI-xxx`; adjustments to not-started stories are change items (diffs); Done stories in scope get rework stories (US-092).
- [x] AC-3: Proposed dependencies — including on existing Done stories — are validated (FR-063); the in-flight dialog (US-091) applies when adjusted stories are queued, running or in Review.
- [x] AC-4: After approval the stories appear in the epic's lane in Backlog; *Open on Kanban* jumps there. FR-108 acceptance passes with the scripted agent.

## Technical Notes
- Related design document: spec/03_design/functional_design/use_cases.md UC-045; user_flows.md UF-18
- Related requirements: FR-108, FR-094, FR-063
- Release: R2

## Dependencies
- US-090 Apply accepted changes with stable IDs and feature links
- US-092 Rework stories for Done functionality

## Implementation Details
Files created / modified:
- `packages/application/src/specs/feature-stories.ts` (new) — `EpicChoice`/`EpicProposal`, `splitStoryFile` (one change item per story/epic file; Done stories must not be changed), `applyStoryFile` (new files get `feature: FI-x` and Backlog status, adjusted files `Changed by FI-x.`; conflicts when a new file exists or a file changed since the generation), `storiesPrompt`, `BLOCKING_STORY_ISSUES`
- `packages/application/src/specs/delta-service.ts` — delta phase `stories` (folder `04_user_stories`, next free `EP`/`US` IDs, generation needs the approved epic choice, produced files validated with `validateSpecFiles` — unknown dependencies, cycles, invalid rework targets, duplicate IDs fail the change set), `epicProposal` / `chooseEpic`, an adjusted story that is itself queued/running/in Review needs the in-flight decision ("adjusted US-xxx")
- `packages/domain/src/feature/feature-phases.ts` — `storiesDelta`: an open stories change set puts *Epic & stories* in awaiting approval with the next step "Review the epic and stories proposed for FI-x"; `packages/application/src/specs/feature-service.ts` — passes it
- `packages/adapters/sqlite/src/change-set-repository.ts` — `EpicChoiceRepository`; `schema.ts` — migration 27 `feature_epic_choice`
- `packages/ipc-contract/src/contract.ts` — `delta.*` phase `stories`, `delta.epicProposal`, `delta.chooseEpic`; `packages/core/src/composition.ts` — wiring; `packages/core/src/test-agent.ts` — scripted Epic & stories run (new epic, four stories incl. a rework story, one adjustment)
- UI: `features/StoriesPanel.tsx` (new: epic choice — new epic with editable title (recommended) or *Extend EP-x* from the impact list, *Approve epic choice*, then the change set), `features/ChangesPanel.tsx` (single-phase mode, badges *New* / *Adjusted* / *Rework of US-xxx*, *Generate stories*, *Open on Kanban*), `features/FeaturePage.tsx`, `App.tsx` (*Open on Kanban* → Kanban area), `styles/areas/features.css`

Decisions / deviations:
- The epic proposal is derived from the confirmed impact list (itself trace- and AI-based, US-087/US-088): a new epic with the next free ID and the feature title is the default, epics in the impact list can be extended; no separate agent run proposes the epic.
- The stories run proposes everything as one change set reviewed per file (reusing the delta flow of US-089/US-090/US-091) instead of a separate approval screen.

## Test Coverage
- Coverage (lines): `feature-phases.ts` 100 %, `change-set-repository.ts` 100 %, `test-agent.ts` 100 %, `ChangesPanel.tsx` 98.6 %, `delta-service.ts` 96.6 %, `feature-stories.ts` 94.7 %, `composition.ts` 91.4 %, `FeaturePage.tsx` 88.7 %, `StoriesPanel.tsx` 81.3 %; overall 95.2 %
- Test files: `packages/application/test/delta-service.test.ts` (+7: epic choice, prompt, per-file items, validation of dependencies/reworks/Done stories, in-flight adjustment, apply with feature link and Backlog status, conflict), `packages/domain/test/feature-phases.test.ts` (+2), `packages/adapters/sqlite/test/impact-flags.test.ts` (+1), `packages/core/test/delta-ipc.test.ts` (+1: FR-108 acceptance with the scripted agent — new epic with four stories incl. a rework story in the epic's lane in Backlog), `packages/ui/test/stories-panel.test.tsx` (4), `feature-page.test.tsx` (extended)
- Full suite: 1358 passed; lint, build and layering green
- 15 new tests
