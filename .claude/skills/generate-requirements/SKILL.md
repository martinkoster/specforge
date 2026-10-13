---
name: generate-requirements
description: Create or update the software requirements (functional, non-functional, constraints, summary) in spec/02_requirements/ from the project intent in spec/01_intent/. Use for stage 2 of the spec-driven workflow, when the user asks to generate, derive, validate or refresh requirements, or runs /generate-requirements.
---

You are a requirements analyst. Your task is to create or update software requirements based on the project intent.

---

## Step 1: Read the Intent

Read **all files** in `spec/01_intent/`. Understand:
- Project vision and purpose
- In-scope and out-of-scope items
- Stakeholders and user types
- Key constraints
- Success criteria and assumptions

If `spec/01_intent/intent.md` is empty or still contains only the template placeholders, stop and ask the user to fill in the intent first.

---

## Step 2: Check for Existing Requirements

Check whether any files exist in `spec/02_requirements/` beyond `README.md`.

**If NO requirements files exist yet:** proceed to Step 3 (create).  
**If requirements files already exist:** read them all, then proceed to Step 4 (validate and update).

---

## Step 3: Create Requirements (first run)

Create the following files in `spec/02_requirements/`:

### `functional_requirements.md`

Derive one requirement per distinct system behaviour implied by the intent. Format each as:

```
### FR-001: [Short imperative title]
**Description**: What the system must do.
**Source**: Which intent item this derives from (quote the relevant phrase).
**Priority**: Must Have | Should Have | Could Have | Won't Have (MoSCoW)
**Acceptance**: How to verify this requirement is satisfied.
```

Cover all in-scope functionality. Number sequentially (FR-001, FR-002, …).

### `non_functional_requirements.md`

Cover at minimum: performance, security, scalability, availability, usability, maintainability, and any compliance or regulatory constraints mentioned in the intent. Format each as:

```
### NFR-001: [Short title]
**Category**: Performance | Security | Scalability | Availability | Usability | Maintainability | Compliance
**Description**: The quality attribute requirement.
**Source**: Intent reference.
**Measure**: A quantifiable target where possible (e.g., "response time < 2 s under 1000 concurrent users").
**Priority**: Must Have | Should Have | Could Have
```

### `constraints.md`

List all hard constraints (technical stack mandates, regulatory rules, budget ceilings, fixed deadlines, existing system integrations). Format:

```
### CON-001: [Short title]
**Description**: The constraint.
**Impact**: How this constrains the design and implementation choices.
```

### `requirements_summary.md`

A master table:

```markdown
# Requirements Summary

Last updated: [today's date]

## Functional Requirements
| ID | Title | Priority | Status |
|----|-------|----------|--------|
| FR-001 | ... | Must Have | Active |

## Non-Functional Requirements
| ID | Title | Category | Priority | Status |
|----|-------|----------|----------|--------|

## Constraints
| ID | Title | Impact |
|----|-------|--------|

## Changelog
| Date | Change |
|------|--------|
| [today] | Initial requirements created |
```

---

## Step 4: Validate and Update Existing Requirements

Compare each existing requirement against the current intent:

1. **Still aligned?** — Keep as-is.
2. **Changed?** — Update the description; note the change in the changelog.
3. **No longer valid?** — Mark `[DEPRECATED]` and add a deprecation reason.
4. **Gap (intent item not covered)?** — Add new requirements for it.

After updating, refresh the summary table and append a changelog entry with today's date.

---

## Step 5: Quality Check

Before finishing, verify:
- Every in-scope item from the intent is covered by at least one FR.
- Every constraint from the intent is captured in `constraints.md`.
- No FR contradicts another FR.
- Each FR has a measurable or verifiable acceptance criterion.

Flag any ambiguities in the intent that prevent writing a clear requirement — list them explicitly so the user can clarify.

---

## Step 6: Report

Summarise:
- How many requirements were created / updated / deprecated.
- Any intent ambiguities that need the user's clarification (list them).
- Requirements that appear particularly complex or risky (flag them).
- **Suggested next step**: run `/generate-design`
