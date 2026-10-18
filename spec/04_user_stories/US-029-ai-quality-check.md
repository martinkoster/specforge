---
id: US-029
title: Run AI quality checks on artifacts
status: done
size: M
epic: Specification phases
---

## Business Value
Improves specification quality with actionable findings per phase (FR-082).

## Description
As a **SpecForge user**, I want **an AI review of an artifact with findings and suggested fixes** so that **I catch gaps and contradictions early**.

## Acceptance Criteria
- [x] AC-1: *Quality check* on intent, requirements, design, epics or stories starts a `quality_check` run with phase-specific criteria.
- [x] AC-2: Findings (severity, location, explanation, suggested fix) are listed by severity; clicking jumps to the location.
- [x] AC-3: *Apply fix* shows a proposal diff (accept/discard); *Dismiss* records a reason; findings persist with state.
- [x] AC-4: Header badge shows open findings count.

## Technical Notes
- Related design document: `spec/03_design/functional_design/use_cases.md` — UC-032
- Related design document: `spec/03_design/functional_design/user_flows.md` — uf-10-ai-quality-check
- Related design document: `spec/03_design/technical_design/service_design.md` — qualityservice
- Related requirements: FR-082
- Release: R1

## Dependencies
- US-027 Run specification generation through the agent adapter

## Implementation Details
Files created / modified:
- `packages/application/src/specs/quality-service.ts` — `QualityService`: read-only `quality_check` run with phase-specific criteria (`qualityCriteria`), findings from the structured result (`parseFindings`, sorted by severity), `applyFix` (refine proposal of the finding's section; applied once kept), `dismiss` (reason required), `openCount`
- `packages/domain/src/permissions/built-in-denies.ts` — read-only runs: every write and shell command denied
- `packages/adapters/sqlite` — migration 16 (`quality_finding`), `replaceFindings`, `findings`, `finding`, `findingsFixedBy`, `updateFinding`
- `packages/core/src/composition.ts` — `quality.check`, `quality.findings`, `quality.applyFix`, `quality.dismiss`, event `quality.checked`; kept refine proposals mark their findings applied
- `packages/ui/src/specs/ArtifactAiPanel.tsx` — *Quality check*, findings by severity with location (jumps to the heading in the editor), Apply fix (proposal review), Dismiss with reason, open-findings badge (panel and editor header)
- `packages/ui/src/specs/MarkdownEditor.tsx`, `ArtifactEditor.tsx` — `focusLine` (jump), `openFindings` badge

Decisions / deviations:
- A new check replaces the open findings of the artifact; applied and dismissed findings stay as history.

## Test Coverage
- Coverage: `quality-service.ts` 98.3 % lines, `ArtifactAiPanel.tsx` 92.9 % (workspace total 95.8 % lines)
- Test files: `packages/application/test/quality-service.test.ts` (9), `packages/domain/test/built-in-denies.test.ts` (1 new), `packages/adapters/sqlite/test/execution-store.test.ts` (1 new), `packages/application/test/spec-run-service.test.ts` (1 new (onKept)), `packages/core/test/quality-ipc.test.ts` (1), `packages/ui/test/artifact-ai.test.tsx` (4 of 7)
- 17 tests
