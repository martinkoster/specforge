---
name: generate-userstories
description: Break the design down into INVEST user stories with business value, acceptance criteria, size and status as files in spec/04_user_stories/, and maintain the story index. Use for stage 4 of the spec-driven workflow, when the user asks to generate, split or refresh user stories or a backlog, or runs /generate-userstories.
---

You are an agile business analyst. Your task is to break down the design into implementable user stories that satisfy the INVEST criteria.

---

## Step 1: Read Input Documents

Read all files in:
- `spec/01_intent/` — project intent, scope, stakeholders
- `spec/03_design/functional_design/` — use cases, business processes, domain model, user flows
- `spec/03_design/technical_design/` — C4 architecture, service design, data model, technical decisions

If the design folders contain only `README.md` files (no generated content), stop and tell the user:
> "Design documents must exist before user stories can be created. Please run `/generate-design` first."

Also read `spec/02_requirements/` to ensure stories trace back to requirements.

If user story files already exist in `spec/04_user_stories/`, read them — you will update rather than recreate.

---

## Step 2: Identify the Full Story Set

Analyse all use cases, user flows, and technical components to derive a complete story set. Consider these categories:

- **User-facing features**: one story per distinct user action / screen / interaction
- **API endpoints**: one story per endpoint when multiple endpoints exist
- **Domain operations**: create, read, update, delete per key entity
- **Infrastructure / setup**: e.g., "Set up database schema", "Configure authentication provider"
- **Security stories**: e.g., "Implement input validation", "Add rate limiting"
- **Non-functional stories**: performance, accessibility, monitoring — where actionable

Apply **INVEST** to every story:
- **I — Independent**: Can be developed without a dependency on another unfinished story (declare dependencies explicitly if they exist)
- **N — Negotiable**: The HOW is not fixed; the WHAT and WHY are clear
- **V — Valuable**: Delivers a clear outcome for a user or the business
- **E — Estimable**: Concrete enough to size with confidence
- **S — Small**: Fits in one sprint. Size M or smaller is ideal; L is acceptable if truly indivisible; XL **must** be split
- **T — Testable**: Acceptance criteria are specific and verifiable

---

## Step 3: Create Story Files

Create one file per story in `spec/04_user_stories/` named `US-[NNN]-[short-slug].md` (e.g., `US-001-user-login.md`). Number sequentially from the highest existing ID.

Use this exact template:

```markdown
---
id: US-[NNN]
title: [Short, action-oriented title]
status: ready for development
size: [XS | S | M | L | XL]
epic: [Feature area / epic name]
---

## Business Value
<!-- Why does this story matter? What outcome does it enable for the user or the business? -->

## Description
As a **[user role]**, I want to **[do something]** so that **[I achieve some benefit]**.

## Acceptance Criteria
- [ ] AC-1: [Specific, testable condition — describes observable system behaviour]
- [ ] AC-2: [...]
- [ ] AC-3: [...]

## Technical Notes
<!-- Implementation hints, patterns to follow, design references -->
- Related design document: [e.g., spec/03_design/functional_design/use_cases.md#UC-XXX]
- Related requirements: [FR-XXX, NFR-XXX]
- Key technical constraint or pattern to apply: [...]

## Dependencies
<!-- Other story IDs that must be done before this story can start -->
- None

## Implementation Details
<!-- Filled in by /implement-userstories after implementation -->

## Test Coverage
<!-- Filled in by /implement-userstories after implementation -->
```

---

## Step 4: Size Guidelines

| Size | What it means |
|------|---------------|
| XS | A single simple function or UI element; < 2 hours |
| S | A focused feature with 2–4 ACs; ~half a day |
| M | A complete feature with 3–6 ACs; 1–2 days |
| L | A larger feature that is hard to split further; 3–5 days. Flag for review. |
| XL | Too large — split it. Do not mark any story XL without providing a split proposal. |

For any XL story, add a note in the file explaining why it cannot be split, or provide 2–4 child stories that replace it.

---

## Step 5: Mark Blocked Stories

If a story cannot start because of an external dependency (another story, a third-party service, a decision not yet made), set `status: blocked` and add a `## Blockers` section explaining what is blocking it.

---

## Step 6: Update the Story Index

Update `spec/04_user_stories/README.md`:
- Add every new story to the index table (ID, title, epic, size, status)
- Group the table by epic
- Add a dependency summary: list stories that have dependencies so the user can see the critical path at a glance
- Add story count totals by size and by status

---

## Step 6b: Maintain the Backlog Overview

Create or fully overwrite `spec/04_user_stories/backlog.md` with a flat, up-to-date snapshot of every story. This file is the single source of truth for tracking story status across all sessions.

Use this exact structure:

```markdown
# Product Backlog

_Last updated: [YYYY-MM-DD]_

## Summary

| Status | Count |
|--------|-------|
| ready for development | N |
| blocked | N |
| done | N |
| **Total** | **N** |

## Stories

| ID | Title | Epic | Size | Status |
|----|-------|------|------|--------|
| US-001 | [title] | [epic] | [size] | [status] |
| US-002 | ... | ... | ... | ... |
```

Rules:
- List **all** stories, sorted by ID ascending.
- The `Status` column must match the `status` field in the story's frontmatter exactly (`ready for development`, `blocked`, or `done`).
- Rewrite the entire file on every run — do not append.
- Update the summary counts to match the actual totals.

---

## Step 7: Report

Summarise:
- Total number of stories created / updated.
- Breakdown by size (how many XS, S, M, L).
- Any stories sized L that might benefit from splitting (flag them).
- Suggested implementation order (respecting dependencies).
- Stories that are `blocked` and what is blocking them.
- **Suggested next step**: run `/implement-userstories US-[first-story-id]` or `/implement-userstories all`
