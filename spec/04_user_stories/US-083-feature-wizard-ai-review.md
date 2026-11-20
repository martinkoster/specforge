---
id: US-083
title: Feature wizard: AI review and clarification
status: done
size: M
epic: Feature workflow
---

## Business Value
The AI turns a rough idea into a complete feature intent and finds overlaps and conflicts early (FR-103).

## Description
As a **SpecForge user**, I want to **have the agent review, enhance and question my feature idea** so that **the feature intent is complete and consistent with my existing specifications before work starts**.

## Acceptance Criteria
- [x] AC-1: *Review with AI* starts a `feature_review` run with the idea, the main intent, the requirement and epic index and the ADR titles; progress is shown live.
- [x] AC-2: The result shows the enhanced draft (problem, goal, scope in/out, success criteria, constraints, assumptions) with AI-added parts marked *Keep / Remove / Edit*, and findings: overlaps (with *View*), conflicts with requirements/ADRs and a suggested epic.
- [x] AC-3: If the agent reports the idea as already covered, this is shown prominently with *Withdraw*, *Merge into FI-x* (appends to that feature intent) and *Continue*.
- [x] AC-4: Clarification questions appear as cards with suggested answers and free text; *Send answers* resumes the same session and updates the draft in place; *Answer later* is possible.
- [x] AC-5: On save, the answers are recorded under *Clarified decisions* and unresolved conflicts under *Open questions* of the feature intent; with the scripted agent, the FR-103 acceptance example ("Users can comment on tasks") produces `FI-001-task-comments.md` with the answers.

## Technical Notes
- Related design document: spec/03_design/functional_design/use_cases.md UC-043; user_flows.md UF-17; business_processes.md BP-07
- Related requirements: FR-103
- Release: R2
- Structured result: enhanced draft + findings + questions in the `specforge-result` block; extend the scripted test agent with `feature_review`.

## Dependencies
- US-082 Add feature: entry points and wizard (describe, save, resume)

## Implementation Details
Files created / modified:
- `packages/application/src/specs/feature-review.ts` (new) — `FeatureReviewService`: `review` (read-only `feature_review` run with the idea and its details, the main intent path, the requirement, epic, ADR and feature intent index), `answer` (resumes the same agent session with the answers), `editPart` (*Keep / Remove / Edit*; an edited part becomes the user's), `deferQuestion` (*Answer later*), `dismissCovered` (*Continue*), `withdraw`, `mergeInto` (appends the idea under "## Merged ideas" of FI-x and drops the draft); `parseFeatureReview` for the structured result (title, enhanced draft, overlaps, conflicts, suggested epic, covered, questions, done); answer rounds update the draft in place (removals and edits of earlier rounds survive, answered/deferred questions stay)
- `packages/application/src/specs/feature-wizard.ts` — `WizardDraft.review` (`FeatureReview`, parts per section, questions); the file renders kept parts per section, the *Clarified decisions* table from the answers and *Open questions* from unanswered questions and conflicts; `update` never lets a client copy overwrite the review
- `packages/adapters/sqlite/src/index-repository.ts` — `elementsOfTypes()` (review context)
- `packages/ipc-contract/src/contract.ts` — `features.wizard.review/answer/editPart/deferQuestion/dismissCovered/withdraw/merge`, event `features.wizardUpdated`, the review in the wizard draft
- `packages/core/src/composition.ts` — `FeatureReviewService` wiring (run store, permission relay, live `run.output`); `packages/core/src/test-agent.ts` — `feature_review` behaviour for the FR-103 example (first round: enhanced draft + formatting question; answer round: records the answer, done; an idea mentioning "duplicate" is reported as covered)
- `packages/ui/src/features/FeatureReviewPanel.tsx` (new) — live progress with the agent output, enhanced draft with AI badges and Keep / Remove / Edit, findings (overlaps with *View*, conflicts, suggested epic with *Use this epic*), "Already covered" with *Withdraw* / *Merge into FI-x* / *Continue*, question cards with suggested answers, free text, *Answer later*, *Send answers*, *Done clarifying*; `FeatureWizard.tsx` — *Review with AI* (disabled with the explanation in limited mode), review/clarify steps, refresh on `features.wizardUpdated`; `App.tsx` — *View* opens the element, a merge opens the feature intent; `styles/areas/features.css`

## Test Coverage
- Coverage (lines): `test-agent.ts` 100 %, `index-repository.ts` 98.8 %, `feature-review.ts` 98.4 %, `feature-wizard.ts` 96.8 %, `FeatureReviewPanel.tsx` 94.7 %, `FeatureWizard.tsx` 93.8 %, `composition.ts` 91.7 %, `App.tsx` 80.2 %; overall 95.2 %
- Test files: `packages/application/test/feature-review.test.ts` (11, new), `packages/core/test/test-agent.test.ts` (+2), `packages/core/test/feature-wizard-ipc.test.ts` (+1: FR-103 example with the scripted agent → `FI-001-task-comments.md` with the answer), `packages/ui/test/feature-review.test.tsx` (6, new), `packages/main/test/feature-wizard.e2e.test.ts` (+1 E2E: review, answer, save)
- Full suite: 1211 passed; lint, build and layering green
- 21 new tests
