# MVP acceptance — real Claude Code (US-066)

**Story:** US-066 · **Verifies:** intent §8 "MVP acceptance scenario", NFR-016 (≥ 9 of 10 consecutive attempts per OS), NFR-025 (manual scenario passes on each OS before release), NFR-027 / ADR-007 (provider path) · **Status:** draft 2026-11-18, not yet executed

> **The MVP is successful when this workflow can be completed reliably without manually invoking Claude Code outside SpecForge.** (intent §8)

## 1. Before you start (once per OS)

| # | Precondition | Done |
|---|---|---|
| P1 | Machine or VM with a supported OS: Windows 10/11 x64, macOS (arm64 or x64), Linux x64 (Ubuntu 22.04/24.04 or similar). Record the exact OS version. | ☐ |
| P2 | Installer from the CI artifact `installers-<os>` of the commit under test (record the commit SHA). Unsigned until US-067: Windows SmartScreen → *More info → Run anyway*; macOS → right-click *Open*. | ☐ |
| P3 | Claude Code installed by the user (CON-002), e.g. `npm install -g @anthropic-ai/claude-code`; record `claude --version`. **Do not log Claude Code in for SpecForge** — SpecForge uses the provider below. | ☐ |
| P4 | Git ≥ 2.30 on PATH (≥ 2.38 recommended); record `git --version`. Git `user.name` / `user.email` set. | ☐ |
| P5 | Provider credentials (ADR-007): an Anthropic API key with enough credit, or a Bedrock / Vertex AI / Foundry configuration. **Every attempt uses this provider** — SpecForge disables AI functions without one. Note the provider used (covers US-066 AC-4). | ☐ |
| P6 | Node.js (or another runtime the agent will choose) available, so the generated task app's tests can run. | ☐ |
| P7 | An empty parent folder for the test projects, e.g. `~/sf-acceptance/`. | ☐ |
| P8 | Model chosen for the runs (Settings → execution defaults); record it. Use the same model for all attempts on all OSes. | ☐ |

## 2. Attempt protocol

- **10 consecutive attempts per OS** (NFR-016). Don't skip or redo an attempt; a failed attempt counts and the next one starts fresh.
- **Installation (step A1) runs once per OS** on a clean machine. **Each attempt** starts with a fresh SpecForge profile (delete the app-data folder, table below), so the setup wizard (A2) and the start wizard (A3) run every time; it uses a new project folder `attempt-NN`.
- **Throughout the attempt, never run `claude` yourself** — any manual Claude Code invocation fails the attempt.
- Answer permission prompts as a careful user would: allow writes and test commands inside the project; deny anything outside it.
- Record start and end time, the result and every deviation in the results table (§5).

| OS | SpecForge profile to delete between attempts |
|---|---|
| Windows | `%APPDATA%\SpecForge` |
| macOS | `~/Library/Application Support/SpecForge` |
| Linux | `~/.config/SpecForge` |

Deleting the profile also deletes the saved provider secret (`secrets.json`, encrypted via the OS credential store), so the provider is entered again in A2 of every attempt.

## 3. Scenario checklist (one attempt)

| Step | Action | Expected result | ✓ |
|---|---|---|---|
| **A1** | *(once per OS)* Run the installer; start SpecForge from the Start menu / Applications / app launcher. | Windows installs per user without an administrator prompt; the app opens. | ☐ |
| **A2** | Setup wizard: *Agent runtime* (detects or accept the Claude Code executable → verified), *Provider* (enter the provider → connection test passes), *Git* (detected), *Approval rules*, *Execution defaults*, *Ready* → **Finish**. | All steps green; no "AI functions disabled" banner afterwards. | ☐ |
| **A3** | Start wizard: **Create new project** → location `attempt-NN` in the parent folder, Git enabled → **Create**. | Project opens on the dashboard; phase stepper at *Intent*. | ☐ |
| **A4** | Enter the intent exactly: *"Build a simple task management application with user authentication, task creation, assignment, and a Kanban board."* | Saved to `spec/01_intent/intent.md`. | ☐ |
| **A5** | Run the **AI quality check**; answer or dismiss its findings / clarifications; **Approve** the intent. | Findings are shown in place; the intent is approved; the next-step hint points to requirements. | ☐ |
| **A6** | **Specifications** → target *Requirements* → **Generate**. Answer the permission prompt(s); review the changes → **Keep**; open and **Approve** the requirement files. | Requirement files under `spec/02_requirements/`; review dialog lists the changes; approvals stick. | ☐ |
| **A7** | Same for *Design* → `spec/03_design/`; approve. | Design files generated and approved. | ☐ |
| **A8** | Same for *Epics* → **Approve epic structure**. | Epics listed; coverage strip shows the requirements covered. | ☐ |
| **A9** | Same for *User stories* (per approved epic); open the stories and approve at least **4**, of which at least one depends on another. | Stories under `spec/04_user_stories/` with valid dependencies; approved. | ☐ |
| **A10** | **Dashboard**: review the artifacts and the trace; ask the read-only chat one question about the requirements. | Dashboard shows phase progress; chat answers without changing files. | ☐ |
| **A11** | **Kanban**: move the approved stories to *Ready*, then to *In Progress*. | Independent stories start in parallel (up to 3); dependent ones show *Waiting for US-xxx* and are queued. | ☐ |
| **A12** | **Executions**: watch the live logs; answer permission requests (notification + pending decisions). | Logs stream; the prompt shows tool name and target; runs continue after allow; denied actions don't happen. | ☐ |
| **A13** | Wait until the runs finish. | Each finished story moves to *Review*; the agent ran the project's tests (visible in the log / structured result). | ☐ |
| **A14** | Open a story in *Review*: inspect the diff and the result; **Approve**; follow the merge instructions (merge the story branch yourself). | Story moves to *Done*; the queued dependent story starts automatically and reaches *Review*. | ☐ |
| **A15** | Approve the remaining stories (or reject one with a reason → it goes back to the agent / rework). | All moved stories end in *Done* (or rejected as intended). | ☐ |
| **A16** | Close and restart SpecForge. | Project, board and run history are restored (persistent state). | ☐ |

**Pass** = A2–A16 (and A1 for the first attempt) succeed without invoking Claude Code outside SpecForge and without a SpecForge-attributable failure.

## 4. Classifying failures (NFR-016)

| Class | Examples | Counts as failure? |
|---|---|---|
| **SpecForge** | crash or hang; a run stuck without a way to cancel/retry; a permission prompt never shown or its answer lost; wrong board state or a missing queue start; lost or corrupted files; review/approve doesn't work; the user has to run `claude` or Git commands that SpecForge should have done | **yes** |
| **Agent / model output** | the generated code is wrong or its tests fail; the spec content is weak; the agent gives up on a task — while SpecForge reports it correctly and offers retry / corrections | no — record as an observation |
| **Environment** | provider outage or rate limit, no credit, network down, OS update interrupting | no — repeat the attempt and note why |

Every SpecForge failure and every notable observation becomes a new story or defect in `spec/04_user_stories/` (US-066 AC-3); link it in the results table.

## 5. Results

Record per OS: OS version · SpecForge commit · Claude Code version · Git version · provider · model.

| OS | Attempt | Date | Duration | Result (pass / fail / env) | Failed step | Notes / linked story |
|---|---|---|---|---|---|---|
| Windows | 1 | | | | | |
| Windows | … | | | | | |
| macOS | 1 | | | | | |
| Linux | 1 | | | | | |

**Per-OS verdict:** passes when at least 9 of 10 consecutive attempts pass (environment failures repeated, not counted).

## 6. Open points before execution

- **Cost:** every attempt runs the full spec generation and several implementation runs with the configured provider. Measure attempt 1 in the provider console before committing to 30 attempts; consider a cheaper model for all runs (P8).
- **Scope per attempt:** this draft runs installation once per OS and the setup wizard every attempt (fresh profile). To be confirmed by the product owner.
