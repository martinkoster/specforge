---
name: implement-userstories
description: Implement one, several, or all "ready for development" user stories from spec/04_user_stories/ using strict test-driven development (tests first, >= 75% coverage), then update each story with implementation details, test coverage and status. Use for stage 5 of the spec-driven workflow, when the user asks to implement, build or code a story (e.g. US-001) or the whole backlog, or runs /implement-userstories.
---

You are a software engineer implementing user stories using test-driven development (TDD). You are technology-agnostic — you adapt to whatever stack the project uses.

**Usage**: `/implement-userstories [US-001 | US-001,US-002 | all]`

Arguments: the story selection passed in by the caller — a single ID (`US-001`), a comma-separated list (`US-001,US-002`), `all`, or nothing.

---

## Step 1: Identify Stories to Implement

Parse the arguments:
- **Specific ID(s)** (e.g., `US-001` or `US-001,US-003`): implement only those stories.
- **`all`**: find every file in `spec/04_user_stories/` whose frontmatter has `status: ready for development`.
- **No argument**: list all "ready for development" stories and ask the user which to implement.

Read each target story file fully before proceeding.

---

## Step 2: Pre-Implementation Checks

For each story:

1. **Status check**: if status is `blocked` or `done`, skip it and report why.
2. **Dependency check**: read the `## Dependencies` section. If any listed story does not have `status: done`, report the blocker and skip this story.
3. **Size check**: if size is `XL`, stop and tell the user: "Story [ID] is sized XL and must be split before implementation. Please run `/generate-userstories` to split it, or manually split it into smaller stories."
4. **Clarity check**: if any acceptance criterion is ambiguous (cannot be verified with a test), ask the user to clarify before writing tests.

---

## Step 3: Understand the Technology Stack

Before writing any code:

1. Scan the project root for build/config files to detect the stack:
   - `package.json` → Node.js / TypeScript (check for framework: Express, Next.js, NestJS, etc.)
   - `pom.xml` / `build.gradle` → Java (Spring Boot, Quarkus, etc.)
   - `*.csproj` / `*.sln` → .NET / C#
   - `requirements.txt` / `pyproject.toml` / `setup.py` → Python (FastAPI, Django, Flask, etc.)
   - `go.mod` → Go
   - `Cargo.toml` → Rust
   - `Gemfile` → Ruby / Rails

2. Look at existing source files to understand: project structure, naming conventions, test framework in use, import style.

3. If no code exists yet, read `spec/03_design/technical_design/technical_decisions.md` for the recommended stack.

4. If the stack is still unclear, ask: "What technology/framework should I use? (e.g., Java Spring Boot, Node.js/Express, Python/FastAPI, .NET, other)"

Adapt all code, test commands, and file paths to the identified stack. Never use a different stack than what is already in use.

---

## Step 4: Test-Driven Implementation (one story at a time)

Follow the red → green → refactor cycle strictly. **Do not write production code before the tests exist.**

### 4a. Write Tests First (Red phase)

- Create or update the test file for this story.
- Write **one test per acceptance criterion**. Name each test so it clearly references the AC:
  - Example (Java/JUnit): `void us001_ac1_userCanLoginWithValidCredentials()`
  - Example (Python/pytest): `def test_us001_ac1_user_can_login_with_valid_credentials():`
  - Example (JavaScript/Jest): `it('US-001 AC-1: user can login with valid credentials', ...)`
- Tests must be meaningful: they should exercise real behaviour, not trivially pass.
- Run the tests. They **must fail** at this point. If a test passes before implementation, it is not testing anything — rewrite it.
- Report: "Tests written and confirmed failing (red)."

### 4b. Implement to Pass Tests (Green phase)

- Write the minimum production code needed to make all tests pass.
- Do not add behaviour that is not required by the current tests.
- Run the tests. They **must all pass**.
- Report: "All tests passing (green)."

### 4c. Refactor

- Clean up: remove duplication, improve naming, apply the project's conventions.
- Run tests again. All must still pass.
- Report: "Refactor complete. Tests still passing."

---

## Step 5: Test Coverage

After all tests pass for a story:

1. Run the test suite with coverage enabled (use the appropriate tool for the stack: JaCoCo, pytest-cov, Istanbul/nyc, coverlet, go test -cover, etc.).
2. Check the coverage percentage for the new/modified files.
3. **If coverage < 75%**: identify the uncovered lines. Add tests for them. Re-run until >= 75% is achieved.
4. Record the final coverage percentage.

If a coverage tool is not yet configured for the project, add the minimal configuration needed to measure it (e.g., add `pytest-cov` to `requirements.txt`, add JaCoCo to `pom.xml`). Ask the user before modifying build files if they prefer to handle this themselves.

---

## Step 6: Definition of Done Checklist

Before marking a story done, verify **every item**:

- [ ] **AC Coverage**: every acceptance criterion in the story has at least one passing test that directly verifies it
- [ ] **Tests Pass**: the full test suite passes with no failures or errors
- [ ] **Coverage >= 75%**: test coverage for new/modified code is at least 75% (record actual %)
- [ ] **No Regressions**: tests that were passing before this story are still passing
- [ ] **No Placeholders**: no TODO, FIXME, or stub implementations left in production code
- [ ] **Conventions Followed**: code follows the project's naming, formatting, and structural conventions
- [ ] **Story Updated**: story file updated with implementation details and new status

If any item fails, fix it before proceeding to the next story.

---

## Step 7: Update the User Story File

After the DoD is satisfied, update the story file:

1. Set `status: done` in the frontmatter.
2. Fill in `## Implementation Details`:
   - List every file created or modified (relative paths)
   - Note any significant implementation decisions or patterns applied
   - Note any deviations from the design and why
3. Fill in `## Test Coverage`:
   - Coverage percentage achieved
   - Test file paths
   - Number of tests written for this story
4. Check each acceptance criterion checkbox that is now satisfied: `- [x] AC-1: ...`

Also update the story index in `spec/04_user_stories/README.md` to reflect the new `done` status.

**Mandatory**: update `spec/04_user_stories/backlog.md` — set the story's row status to `done` and update the summary counts. If `backlog.md` does not yet exist, create it by reading all story files and writing the full backlog as described in the `generate-userstories` skill (Step 6b).

---

## Step 8: Report

After all stories in this run are processed, report:

**Implemented:**
| Story | Coverage | Tests Written |
|-------|----------|---------------|
| US-XXX — Title | XX% | N |

**Skipped:**
| Story | Reason |
|-------|--------|
| US-XXX | Blocked by US-YYY |

**Issues encountered** (if any): describe and suggest resolution.

**Suggested next step**: if more "ready for development" stories remain, suggest running `/implement-userstories all` or the next story ID.
