# SpecForge — Functional Requirements

**Source:** `spec/01_intent/intent.md` v0.2 incl. §13 Clarified decisions (D1–D22)  
**Last updated:** 2026-10-13

Each requirement has a **Release** (R1 = MVP per intent §8, R2, R3, Later) and a MoSCoW **Priority** within that release. Capabilities deferred beyond the planned releases are listed as *Won't Have (MVP)* with Release *Later* so they stay traceable. The release overview is in `requirements_summary.md`.

---

## 1. Project and workspace management

### FR-001: Create a project linked to a local workspace
**Description**: The user can create a project by giving it a name and selecting (or creating) a local folder as its workspace. The workspace holds source code, specifications, configuration, and generated artifacts. New projects are created through the start wizard (FR-076, FR-078; adoption of existing code FR-079).
**Source**: §5.1 "Each project is associated with a local workspace containing source code, specifications, configurations, and generated artifacts."; §8 "create a project"; D14.
**Priority**: Must Have
**Release**: R1
**Acceptance**: After creating a project with a chosen folder, the project appears in the project list, the folder contains the SpecForge specification structure (e.g. `spec/`), and the project can be opened.

### FR-002: Reopen projects with full state across restarts
**Description**: Projects, their artifacts, Kanban state, execution history, and logs are persisted and restored when the application is restarted.
**Source**: §5.1 "Projects must be reopenable across application restarts without losing planning or execution state."; §8 "persistent project state".
**Priority**: Must Have
**Release**: R1
**Acceptance**: Create a project, generate artifacts, move stories, complete a run; quit and relaunch SpecForge; all artifacts, story states, run records and logs are shown unchanged.

### FR-003: Manage multiple projects
**Description**: The user can list, switch between, rename and remove (unlink, without deleting files) multiple projects.
**Source**: §5.1 "SpecForge shall support creating and managing multiple software projects."; D14 (recent projects in the start wizard).
**Priority**: Must Have
**Release**: R1
**Acceptance**: With two projects registered, the user can switch between them and each shows its own artifacts and board; removing a project leaves its workspace folder untouched.

### FR-004: Detect workspace version-control mode
**Description**: On project creation and opening, SpecForge detects whether the workspace is a Git repository and records the project as *git mode* or *non-git mode*. In non-git mode the UI displays a persistent notice that agent runs are not isolated (see FR-039).
**Source**: D6 "Git is optional … must clearly warn the user that runs are not isolated."
**Priority**: Must Have
**Release**: R1
**Acceptance**: Opening a git repo shows git mode with the current branch; opening a plain folder shows non-git mode and a visible isolation warning.

---

## 2. Intent management

### FR-005: Create and edit intents
**Description**: The user can create, edit and save natural-language intents as Markdown files in the workspace. An intent may describe a new application, a feature, or a change to existing software.
**Source**: §5.2 "Users shall be able to create, edit, and refine natural-language intents. Intents may describe an entirely new application, a feature, or a change to existing software."
**Priority**: Must Have
**Release**: R1
**Acceptance**: The user enters the MVP acceptance intent (§8) in the editor, saves it, and the text is stored as a Markdown file under `spec/01_intent/`.

### FR-006: AI-assisted intent clarification
**Description**: On request, SpecForge runs the configured agent (via the agent adapter, FR-028) to analyse the intent and return clarification questions, identified ambiguities, proposed alternatives, and assumptions. The user answers in the UI; answers and agreed assumptions are recorded with the intent. Multi-turn clarification continues the same agent session.
**Source**: §5.2 "The AI shall be able to ask clarification questions, identify ambiguities, propose alternatives, and document assumptions before generating specifications."; D1.
**Priority**: Must Have
**Release**: R1
**Acceptance**: For an ambiguous intent the agent returns at least one question; after the user answers, the answers and assumptions appear in the intent's Markdown and are used as input for requirements generation.

---

## 3. Specification-driven development

### FR-007: Generate requirements from the intent
**Description**: SpecForge generates functional and non-functional requirements and constraints from the intent by running the configured agent through the agent adapter, writing Markdown files to `spec/02_requirements/`.
**Source**: §4.2, §5.3 "Requirements"; D1 "Use the same vendor-neutral agent adapter … SpecForge does not call model APIs directly."
**Priority**: Must Have
**Release**: R1
**Acceptance**: From the MVP acceptance intent, a generation run produces requirement files with uniquely identified requirements; no direct model-API call is made by SpecForge (verifiable by network/process inspection: only the agent CLI is invoked).

### FR-008: Generate the design
**Description**: SpecForge generates a design (solution architecture, components, interfaces, data models) from intent and requirements via the agent adapter and stores it as Markdown in `spec/03_design/`.
**Source**: §4.2, §5.3 "Design — Solution architecture, components, interfaces, and data models".
**Priority**: Must Have
**Release**: R1
**Acceptance**: A design generation run produces Markdown files covering architecture, components, interfaces and data model, each referencing the requirement IDs it addresses.

### FR-009: Generate and record architecture decision records
**Description**: The design generation identifies important architecture decisions and records each as an ADR (context, decision, alternatives, consequences) in Markdown.
**Source**: §5.3 "ADRs — Important architecture decisions and rationale"; Goal 2.
**Priority**: Should Have
**Release**: R1
**Acceptance**: A generated design contains at least one ADR file with context, decision, alternatives and consequences sections.

### FR-010: Generate user stories with acceptance criteria
**Description**: SpecForge generates implementable user stories from the approved requirements and design via the agent adapter. Each story is a Markdown file with a unique ID, description, acceptance criteria, links to source requirements/design, proposed dependencies (FR-063), and status in front-matter. New stories start in *Backlog*.
**Source**: §4.3 "AI creates reviewable, testable user stories."; §5.3 "User stories"; D2; D11.
**Priority**: Must Have
**Release**: R1
**Acceptance**: From the MVP acceptance scenario, a set of stories is generated; each has an ID, ≥1 acceptance criterion, ≥1 requirement link, and `status: backlog`; all appear in the Backlog column.

### FR-011: Generate test concepts
**Description**: SpecForge can generate test concepts (validation scenarios and expected outcomes) linked to requirements and stories.
**Source**: §5.3 "Test concepts — Validation scenarios and expected outcomes".
**Priority**: Should Have
**Release**: R2
**Acceptance**: A test-concept generation produces Markdown scenarios, each referencing at least one requirement or story ID.

### FR-012: View and edit all artifacts in the application
**Description**: All artifacts (intent, requirements, design, ADRs, stories, test concepts) can be viewed with rendered Markdown and edited in the application. Changes are saved to the workspace files.
**Source**: §5.3 "All artifacts shall be editable, versionable, and stored in human-readable formats, preferably Markdown."
**Priority**: Must Have
**Release**: R1
**Acceptance**: Editing a requirement in SpecForge and saving changes the corresponding Markdown file on disk; the file remains readable in any text editor.

### FR-013: Human approval of generated artifacts
**Description**: AI-generated or AI-modified artifacts are marked *Draft* until a human explicitly approves them. Downstream generation (design from requirements, stories from design) uses approved artifacts by default and warns when inputs are still Draft.
**Source**: §4 "AI-generated artifacts must never automatically become approved requirements or implementation work without an appropriate human-controlled transition."; Goal 10.
**Priority**: Must Have
**Release**: R1
**Acceptance**: After generation, artifacts show status *Draft*; only a user action changes them to *Approved*; starting story generation with draft design shows a warning requiring confirmation.

### FR-014: Iterative refinement of artifacts
**Description**: The user can request AI regeneration or refinement of an artifact (or part of it) with free-text instructions; the result is presented as a change the user can accept or discard before it overwrites the file.
**Source**: §4 "Each stage must allow human review, refinement, and iteration."
**Priority**: Must Have
**Release**: R1
**Acceptance**: Requesting "add a password-reset requirement" produces a proposed change shown as a diff; discarding leaves the file unchanged, accepting writes it and sets the artifact to Draft.

### FR-015: Artifact versioning
**Description**: Artifact changes are versioned. In git mode this uses the repository history; in non-git mode SpecForge keeps local revision snapshots. The user can view an artifact's history and compare revisions.
**Source**: §5.3 "editable, versionable"; D6.
**Priority**: Should Have
**Release**: R2
**Acceptance**: After two edits to a requirements file, its history shows both revisions and a diff between them, in both git and non-git mode.

### FR-016: Traceability between artifacts
**Description**: Every artifact element carries a stable ID (e.g. FR-001, US-001). SpecForge maintains links intent → requirements → design/ADRs → stories → execution runs → changed files/tests, and can show these links in both directions.
**Source**: Goal 9 "Maintain traceability from original intent through specifications and stories to implemented code and tests."; §5.3 "maintain relationships between artifacts".
**Priority**: Must Have
**Release**: R1
**Acceptance**: From a requirement the user can navigate to all linked stories and their runs; from a run, back to its story and requirements.

### FR-017: Downstream impact analysis
**Description**: When an artifact changes, SpecForge identifies linked downstream artifacts and flags them as *Potentially impacted* until a human reviews and clears the flag.
**Source**: §5.3 "identify potentially impacted downstream artifacts when specifications change."
**Priority**: Should Have
**Release**: R2
**Acceptance**: In a sample project, editing requirement REQ-3 flags all stories linked to REQ-3 as potentially impacted; clearing the flag on a story removes it.

### FR-018: Detect and reconcile external edits
**Description**: SpecForge watches workspace artifacts and detects changes made outside the application (text editor, git checkout, agent). It reloads changed files, re-parses IDs, links and story status, and alerts the user if an open unsaved editor conflicts with an external change.
**Source**: D2 "SpecForge must detect and reconcile external edits to Markdown artifacts."
**Priority**: Must Have
**Release**: R1
**Acceptance**: Changing a story's `status` front-matter in an external editor moves the card on the board within 2 s; editing a file open with unsaved changes in SpecForge shows a conflict prompt.

---

## 4. Kanban-based execution

### FR-019: Kanban board with five states
**Description**: The project has a Kanban board with columns *Backlog*, *Ready*, *In Progress*, *Review*, *Done*, showing each story as a card with ID, title, execution indicator, and dependency indicators (FR-064). Queued stories (FR-065) are shown in *In Progress* with a distinct *Queued* sub-state.
**Source**: §5.4 table of states; §4.4.
**Priority**: Must Have
**Release**: R1
**Acceptance**: All stories appear in the column matching their `status` front-matter; the five columns are present in this order.

### FR-020: Persist story status in story files
**Description**: A story's board state is stored in its Markdown front-matter in the workspace; card order and other UI-only state are stored in the local database.
**Source**: D2.
**Priority**: Must Have
**Release**: R1
**Acceptance**: Moving a card to Ready changes `status: ready` in the story file; card order survives an app restart.

### FR-021: Enforce allowed state transitions
**Description**: The board enforces the following transitions:

| From | To | Initiated by |
|---|---|---|
| Backlog | Ready | Human (approval) |
| Ready | Backlog | Human |
| Ready | In Progress | Human only — starts execution or queues the story (FR-022, FR-065) |
| In Progress (Queued) | In Progress (Running) | System, when blocking predecessors are Done and a run slot is free (FR-066) |
| In Progress | Review | System, when a run completes (FR-024) |
| In Progress | Ready | Human, by cancelling the run or removing the story from the queue (FR-034, FR-065) |
| Review | Done | Human, by approving (FR-044) |
| Review | In Progress | Human, by requesting corrections (FR-045) |
| Review | Ready | Human, by rejecting (FR-046) |

Any other transition is rejected with an explanation. Backlog → Ready requires the story file to be *Approved* (FR-013); this is the only story approval — there is no separate approval step.

**Execution sub-states within *In Progress*** (DB-only, shown on the card):

| Sub-state | Meaning | Exits |
|---|---|---|
| Queued (reason: dependency / slot / workspace) | Authorised, waiting to start (FR-065, FR-116) | → Preparing (system, FR-066); → Ready (human: remove from queue) |
| Blocked (conflict) | Predecessor branches conflict when building the stacked base (FR-067) | → Queued (human: *Re-check* after resolving); → Ready (human) |
| Preparing | Execution space being created | → Running (system); → Failed (system) |
| Running | Agent working | → Awaiting permission; → Review (system: completed); → Failed (system); → Ready (human: cancel, FR-034) |
| Awaiting permission | Run paused for a human decision (FR-032) | → Running (decision); → Ready (human: cancel) |
| Failed | Run could not complete (agent error, timeout, agent crash) | → Queued (human: Retry / Resume, via Scheduler, FR-035); → Ready (human: discard) |
| Interrupted | Run stopped by app close/crash (FR-041) | same as Failed |

Correction rounds (FR-045) re-enter *In Progress* via the Scheduler (Queued → Preparing → Running) in the same execution space.
**Source**: §5.4; §4.4; D5; D11.
**Priority**: Must Have
**Release**: R1
**Acceptance**: Dragging a card from Backlog directly to In Progress is refused with a message; each permitted transition succeeds only via its designated initiator.

### FR-022: Start execution when a story is moved to In Progress
**Description**: When a human moves a story from *Ready* to *In Progress*, SpecForge starts a background run of the configured coding agent for that story in the project workspace (git: dedicated branch/worktree; non-git: workspace directly) — provided all blocking predecessors are *Done* and a run slot is free (FR-027). Otherwise the story is queued (FR-065).
**Source**: §5.4 "Moving a story from Ready to In Progress shall initiate execution through the configured AI coding agent."; Goal 4; §8; D10; D11.
**Priority**: Must Have
**Release**: R1
**Acceptance**: Dragging a Ready story without open blocking dependencies to In Progress, with a free run slot, creates a run record and starts the agent process within 5 s, without any manual CLI invocation.

### FR-023: Agents cannot initiate implementation work
**Description**: No agent output, tool call or result can move a story into *In Progress* or start a new implementation run. Agents may only write *recommendations* (e.g. "US-004 is ready"), which are shown to the user as suggestions.
**Source**: §5.4 "Agents may recommend transitions but shall not autonomously initiate new implementation work by moving stories into progress."; core principle.
**Priority**: Must Have (prohibition and display of recommendations — FR-068, FR-086 and FR-092 rely on recommendation cards)
**Release**: R1
**Acceptance**: An agent run that edits another story's front-matter to `status: in_progress` does not start a run; SpecForge reverts or flags the change and shows it to the user.

### FR-024: Move completed runs to Review
**Description**: When a run finishes (successfully or with failed tests), the story moves to *Review* and the run's result is attached. A run that fails to execute (crash, timeout, agent error) keeps the story in *In Progress* with sub-state *Failed* (FR-021) and frees its run slot.
**Source**: §8 "move completed implementations into a human review state."; §4.5–4.6.
**Priority**: Must Have
**Release**: R1
**Acceptance**: A successfully completed run moves the card to Review automatically; a run killed by timeout leaves the card in In Progress marked Failed.

### FR-025: Never mark a story Done automatically
**Description**: Only an explicit human approval moves a story to *Done*, regardless of the agent's reported outcome.
**Source**: §5.6 "An agent reporting success must not automatically mark a story as Done."
**Priority**: Must Have
**Release**: R1
**Acceptance**: A run reporting full success leaves the story in Review until the user approves.

### FR-026: Visible failed and interrupted runs with recovery actions
**Description**: Failed, cancelled, and interrupted runs are visibly marked on the card and in the execution view, keep their logs, and offer *Retry*, *Resume* (where the agent supports session resume), and *Cancel/Discard* actions.
**Source**: §5.4 "Failed or interrupted executions must remain visible and support retry, cancellation, and recovery."; D8.
**Priority**: Must Have
**Release**: R1
**Acceptance**: A failed run shows a failure badge on the card; Retry starts a new run for the same story; the previous run's log remains accessible.

### FR-027: Parallel implementation runs with a configurable limit
**Description**: Multiple stories can be implemented in parallel, each by its own agent run (separate agent process, session, branch and worktree). The maximum number of concurrently running implementation runs is configurable per project (default 3). Stories moved to *In Progress* beyond the limit are queued (FR-065). In non-git mode the limit is forced to 1 and the settings explain that parallel execution requires Git (D12). **Slot rules**: implementation, correction, retry and resume runs count toward the limit and are all started by the Scheduler (corrections and resumes before new stories, then FIFO by authorisation time); runs that are Failed, Interrupted or Cancelled free their slot; specification, chat, quality-check, impact, feature-review, analysis, decision-option and connection-test runs do not count toward the limit (in non-git mode FR-116 applies).
**Source**: D10; D12; §5.7 "concurrency limits".
**Priority**: Must Have
**Release**: R1
**Acceptance**: With the default limit of 3, moving 4 independent Ready stories to In Progress starts 3 runs concurrently in 3 separate worktrees and queues the 4th, which starts automatically when one run finishes; in a non-git project the limit field is fixed at 1 with an explanation.

---

## 5. Agent orchestration

### FR-028: Vendor-neutral agent adapter interface
**Description**: All agent interaction goes through an adapter interface independent of any vendor, covering at least: capability discovery, start run (prompt, working directory, configuration), stream events (output, progress, tool use), permission requests and responses, cancel, resume session, and structured final result. Both specification-generation runs and implementation runs use this interface.
**Source**: §5.5 "vendor-independent agent abstraction that separates the application workflow from the specific coding tool."; Goal 5; D1; D7.
**Priority**: Must Have
**Release**: R1
**Acceptance**: The core application code contains no references to Claude-Code-specific commands or formats outside the Claude Code adapter module; a test/mock adapter can drive the full workflow.

### FR-029: Claude Code adapter
**Description**: SpecForge provides an adapter that runs the locally installed Claude Code CLI in non-interactive mode, maps its streamed output to adapter events, relays its permission requests, supports cancellation and session resume, and extracts the structured result.
**Source**: §5.5 "Initially, Claude Code shall be supported through its locally installed CLI."; §8.
**Priority**: Must Have
**Release**: R1
**Acceptance**: With Claude Code installed, the MVP acceptance scenario (§8) runs end-to-end through this adapter.

### FR-030: Background execution
**Description**: Runs execute in background processes. While a run is active the user can navigate and use all other parts of the application.
**Source**: §5.5 "Agent execution shall run in the background"; Goal 7; §6.
**Priority**: Must Have
**Release**: R1
**Acceptance**: During an active run the user can open and edit artifacts, browse the board, and change settings without blocking (see NFR-001).

### FR-031: Live execution view
**Description**: An execution view shows, for each run, the live streamed output, current status (preparing, running, awaiting approval, completed, completed without result, failed, cancelled, interrupted; queued stories are shown via their queue entry), elapsed time, tool activity, and files touched so far.
**Source**: §5.5 "streamed output and execution status available through the UI"; Goal 8; §8 "display execution output, track status".
**Priority**: Must Have
**Release**: R1
**Acceptance**: While a run is active, new agent output appears in the view within 1 s of being emitted (NFR-002), and the status updates on state changes.

### FR-032: Interactive permission relay
**Description**: When a running agent requests permission for an action (e.g. running a shell command, editing a file, network access), SpecForge pauses that run (other runs continue), shows the request (story ID, run, tool, arguments, working directory) to the user, and forwards the user's *Allow* or *Deny* decision to the agent. Denials are reported back to the agent and logged.
**Source**: D3 "permission requests from a running agent are surfaced in the SpecForge UI for live human approval or denial."; §7 "Secure by default"; Goal 10.
**Priority**: Must Have
**Release**: R1
**Acceptance**: When the agent attempts to run a shell command, a permission prompt appears in SpecForge; choosing Deny prevents the command and the agent receives a denial; both decisions are recorded in the run log.

### FR-033: Pending-decisions queue and notifications
**Description**: SpecForge shows a global, always-visible indicator and list of pending human decisions (permission requests, stories in Review, failed runs, queue blockages such as conflicts in stacked branches), grouped by story/run when several runs are active. New permission requests raise an in-app notification and, if the window is not focused, an OS notification.
**Source**: D3 "the UI needs a pending-approvals queue and clear notifications."; §6 "clear feedback about … pending human decisions".
**Priority**: Must Have
**Release**: R1
**Acceptance**: With the window minimised, a permission request triggers an OS notification; the pending-decisions counter shows the number of open items from any screen.

### FR-034: Cancel a run
**Description**: The user can cancel an active run. The agent process (and child processes) is terminated, the run is marked *Cancelled* with logs preserved, and the story returns to *Ready*.
**Source**: §5.4 "support retry, cancellation, and recovery".
**Priority**: Must Have
**Release**: R1
**Acceptance**: Cancelling a running run terminates the agent process tree within 10 s; the story appears in Ready and the run in history as Cancelled.

### FR-035: Retry a run
**Description**: For a failed, cancelled, interrupted or rejected story, the user can start a new run (fresh session). In git mode the user chooses to reuse the existing branch or start from a fresh branch off the base branch.
**Source**: §5.4 "support retry"; D5 "a retry starts a fresh run."
**Priority**: Must Have
**Release**: R1
**Acceptance**: Retrying a failed story creates a new run record linked to the same story; prior runs remain in its history.

### FR-036: Structured run result
**Description**: Implementation runs instruct the agent to finish with a structured result conforming to a SpecForge-defined schema (at least: outcome, summary, tests run/passed/failed, coverage if available, changed files, open issues). SpecForge validates and stores it; if missing or invalid, the run is shown as completed with *result unavailable* and the raw log remains the reference.
**Source**: D7; §5.6 "present the generated changes and available test results."
**Priority**: Must Have
**Release**: R1
**Acceptance**: A completed run shows tests passed/failed counts from the parsed result; a run whose output lacks a valid result shows "result unavailable" without crashing.

### FR-037: Assemble agent context for a story
**Description**: For an implementation run, SpecForge builds the agent prompt from the story (incl. acceptance criteria), linked requirements, design and ADRs, project instructions and conventions (FR-050), dependency context (FR-068), and the result-schema instruction (FR-036).
**Source**: §10 "Claude Code should be guided by explicit requirements, architectural decisions, and testable acceptance criteria."; §5.5 "project instructions".
**Priority**: Must Have
**Release**: R1
**Acceptance**: The run detail shows the assembled prompt/context, which includes the story's acceptance criteria and the IDs of linked requirements.

### FR-038: Isolated branch/worktree per run (git mode)
**Description**: In git mode each story run executes in a dedicated branch and Git worktree created from the configured base branch — or, for stories with unmerged blocking predecessors, from the predecessor branch(es) (FR-067) — leaving the user's main working copy and other runs' worktrees untouched. Branch naming includes the story ID.
**Source**: §5.6 "Implementation should occur in an isolated Git branch or worktree where practical"; D6.
**Priority**: Must Have
**Release**: R1
**Acceptance**: During a run, files in the main working copy are unchanged; a branch such as `specforge/US-003` and a worktree exist; the run's changes are commits/changes on that branch only.

### FR-039: Pre-run snapshot and warning (non-git mode)
**Description**: In non-git mode, before a run starts SpecForge shows an explicit warning that the agent will modify the workspace directly and requires confirmation; it then snapshots the workspace files (respecting configurable exclusions) so that diffs can be computed and the pre-run state can be restored on rejection.
**Source**: D6 "For non-git workspaces SpecForge must snapshot files before a run to compute diffs, and must clearly warn the user that runs are not isolated."
**Priority**: Must Have
**Release**: R1
**Acceptance**: In a non-git project, starting a run shows the warning; after the run, Review shows a correct diff against the snapshot; restoring the snapshot returns all tracked files to their pre-run content.

### FR-040: Persist run records
**Description**: Each run is stored in the local database with: run ID, story ID, type (spec generation / implementation), adapter and configuration used, agent session ID, branch/worktree or snapshot reference, status history with timestamps, full log, permission decisions, and structured result. State is written continuously during the run.
**Source**: D2; D5 "Agent session identifiers must be persisted per run."; D8 "Run state must be persisted continuously."; Goal 9.
**Priority**: Must Have
**Release**: R1
**Acceptance**: Killing the SpecForge process mid-run and restarting shows the run with the log output received up to at most 1 s before the kill (NFR-015).

### FR-041: Handle application close and crash during a run
**Description**: Closing SpecForge while a run is active shows a warning naming the active run; on confirmation the agent process tree is terminated and the run marked *Interrupted*. On startup, runs left in an active state (e.g. after a crash) are marked *Interrupted* and any orphaned agent processes started by SpecForge are terminated. The user can retry, resume (session resume), or cancel interrupted runs.
**Source**: D8.
**Priority**: Must Have
**Release**: R1
**Acceptance**: Closing during a run shows the warning; after confirming and relaunching, the run shows *Interrupted* with its log and the Retry/Resume/Cancel actions; no agent process from the previous session is still running.

### FR-042: Run timeouts
**Description**: Each run is subject to a configurable maximum duration and maximum idle time (no output). Exceeding either terminates the run and marks it *Failed (timeout)*. Time spent awaiting a human permission decision pauses both the idle timeout and the maximum-duration timeout. Permission prompts themselves have no timeout; dismissal or shutdown counts as deny (NFR-007).
**Source**: §5.7 "Execution timeouts".
**Priority**: Must Have
**Release**: R1
**Acceptance**: With a 1-minute maximum duration configured, a longer run is terminated after ~1 minute and shows Failed (timeout).

---

## 6. Human review and quality control

### FR-043: Review changed files and diffs
**Description**: For a story in Review, SpecForge lists all files added, modified and deleted by the run and shows a side-by-side or unified diff per file (git: branch vs. the commit it was created from — base branch or stacked predecessor state — so only the story's own changes are shown; non-git: workspace vs. snapshot).
**Source**: §5.6 "inspect modified files, review diffs"; §4.6; §8.
**Priority**: Must Have
**Release**: R1
**Acceptance**: For a run that modified 3 files and added 1, the review view lists exactly these 4 files and shows correct diffs for each.

### FR-044: Approve an implementation
**Description**: The user can approve a story in Review, which moves it to *Done*, records the approval (timestamp), and — in git mode — shows the branch name and base branch with instructions for manual merge, including the required merge order for stacked branches (predecessors first). SpecForge does not merge. Approval may unblock queued dependent stories (FR-066).
**Source**: §5.6 "approve the result"; D4 "The user merges manually."
**Priority**: Must Have
**Release**: R1
**Acceptance**: Approving moves the card to Done; the story detail shows the branch to merge; the base branch is unchanged by SpecForge.

### FR-045: Request corrections
**Description**: The user can request corrections by entering feedback. The story returns to *In Progress* and the agent resumes the same session on the same branch/worktree with the feedback as input. The correction round is recorded as part of the story's run history.
**Source**: §5.6 "request corrections"; D5.
**Priority**: Must Have
**Release**: R1
**Acceptance**: Submitting feedback restarts the agent with the stored session ID; the new output appears in the same run thread; on completion the story returns to Review with an updated diff.

### FR-046: Reject an implementation
**Description**: The user can reject a story in Review with an optional reason. The story returns to *Ready*. In git mode the branch is retained and marked *rejected*; in non-git mode the user is offered to restore the pre-run snapshot.
**Source**: §5.6 "reject the implementation"; D5; D6.
**Priority**: Must Have
**Release**: R1
**Acceptance**: Rejecting moves the card to Ready, the run history shows *Rejected* with the reason, and the branch still exists (git mode).

### FR-047: Show execution results in review
**Description**: The review view shows the structured result (FR-036): outcome, summary, test counts, coverage, open issues; plus access to the full log and permission decisions.
**Source**: §5.6 "present the generated changes and available test results"; Success criterion 6.
**Priority**: Must Have
**Release**: R1
**Acceptance**: The review view shows tests passed/failed and the agent's summary for a completed run.

---

## 7. Configuration

### FR-048: Configure agent runtime executables
**Description**: In a graphical settings screen the user can configure installed agent runtimes. For Claude Code, SpecForge auto-detects the executable on PATH and common install locations on each OS, lets the user override the path, and verifies it (e.g. version check).
**Source**: §5.7 "Installed agent runtimes and executable paths."; §8 "basic configuration of the Claude Code executable".
**Priority**: Must Have
**Release**: R1
**Acceptance**: On a machine with Claude Code installed, settings show the detected path and version; entering an invalid path shows a validation error.

### FR-049: Configure agent execution settings
**Description**: Per runtime (global default) and per project (override), the user can configure: model (where supported), execution parameters, permitted/pre-denied tools, and environment variables. Available options are taken from the adapter's capability discovery.
**Source**: §5.5 "Agent configurations shall support selection of the runtime, model where supported, execution parameters, project instructions, permitted tools, and relevant environment settings."; Goal 6.
**Priority**: Must Have
**Release**: R1
**Acceptance**: Selecting a different model in project settings causes the next run to be started with that model (visible in the run record's configuration).

### FR-050: Project instructions and reusable conventions
**Description**: The user can maintain project-specific instructions and reusable development conventions (e.g. coding standards, test requirements) that are included in every agent run's context for that project.
**Source**: §5.7 "Project instructions and reusable development conventions."; Goal 6.
**Priority**: Must Have
**Release**: R1
**Acceptance**: Adding "Use TypeScript strict mode" to project instructions makes it appear in the assembled context of the next run (FR-037).

### FR-051: Approval policies
**Description**: The user can define global default permission rules (set in the first-start setup, FR-073) and per-project rules (e.g. always allow file edits inside the worktree, always allow `npm test`, always deny network commands). New projects inherit the global defaults; project rules can extend or override them, and the effective rule set shows each rule's origin (global / project). Requests matching an *allow* or *deny* rule are decided automatically and logged; all others are relayed interactively (FR-032). The default policy relays every request. From a permission prompt the user can choose "allow always for this project", creating a rule. New projects show suggested rules (e.g. file edits inside the run's worktree, detected test/build commands) that the user can enable with one click; none are enabled by default (ADR-013).
**Source**: §5.7 "Execution permissions and approval policies."; D3; D13 "which tools shall be accepted without prior approval".
**Priority**: Must Have (raised from Should Have by D13)
**Release**: R1
**Acceptance**: After creating an allow rule for `npm test`, the next run executes `npm test` without a prompt and the log shows "auto-allowed by rule".

### FR-052: Execution and logging preferences
**Description**: The user can configure run timeouts (FR-042), the concurrency limit (FR-027, default 3; fixed at 1 in non-git mode), log retention, and log verbosity.
**Source**: §5.7 "Execution timeouts, concurrency limits, and logging preferences."
**Priority**: Must Have
**Release**: R1
**Acceptance**: Changing log retention to 7 days removes logs older than 7 days at next startup; changed timeouts apply to the next run.

### FR-053: Configure workspace and repository settings
**Description**: Per project the user can view and change the workspace path, the base branch for runs (git mode), branch naming pattern, worktree location, and snapshot exclusions (non-git mode).
**Source**: §5.7 "Project workspaces and Git repositories."
**Priority**: Must Have
**Release**: R1
**Acceptance**: Changing the base branch to `develop` makes the next run's branch start from `develop`.

---

## 8. User experience

### FR-054: Primary navigation
**Description**: The main navigation exposes Dashboard (project home, FR-085), Projects, Intents, Specifications, Kanban, Agent executions, and Settings. The Kanban entry is disabled until at least one user story exists (FR-088).
**Source**: §6 "The primary navigation shall expose a project dashboard, projects, intents, specifications, Kanban, agent execution, and settings."; D16.
**Priority**: Must Have
**Release**: R1
**Acceptance**: Each of the seven areas is reachable with one click from any screen (Kanban once stories exist).

### FR-055: Cross-navigation between story, specification, execution and code
**Description**: From a story the user can open its linked requirements/design, its runs, and the changed files; from a run, its story and changed files; from a changed file, the diff and the file in the user's default editor/IDE.
**Source**: §6 "Users should be able to move naturally between a story, its underlying specification, the associated agent execution, and the resulting source code."
**Priority**: Must Have
**Release**: R1
**Acceptance**: Starting from a Done story, the user reaches a linked requirement, the run log, and a changed file's diff, each with one click.

### FR-056: Activity and status feedback
**Description**: SpecForge shows clear status for agent activity (running/waiting/idle), errors (with actionable messages), and completed work, including a run-completion notification.
**Source**: §6 "clear feedback about agent activity, pending human decisions, errors, and completed work."; Goal 8.
**Priority**: Must Have
**Release**: R1
**Acceptance**: When a run completes, an in-app notification appears and the card's indicator changes; when the agent executable is missing, the error message names the problem and links to settings.

### FR-057: Show execution boundaries
**Description**: SpecForge displays, per agent runtime, what leaves the machine (e.g. "Claude Code sends prompts and code to its configured AI provider") and which provider/model a run used, as far as the adapter can report it.
**Source**: §7 "SpecForge shall make these dependencies and execution boundaries understandable to users."
**Priority**: Should Have
**Release**: R2
**Acceptance**: The settings page for Claude Code and every run record show the external-provider notice and the model used.

### FR-058: Install and launch as a desktop application
**Description**: SpecForge is distributed as an installable desktop application for Windows, macOS and Linux and is launched like any native application.
**Source**: §8 "a locally installable desktop application"; D9.
**Priority**: Must Have
**Release**: R1
**Acceptance**: On a clean machine of each OS, the installer installs SpecForge and it launches to the project screen.

---

## 9. Story dependencies and parallel execution

### FR-062: Story dependency model
**Description**: A story can declare dependencies on other stories of two types: **blocking** (`depends_on`: the story must not start before the predecessor is *Done*) and **related** (`related_to`: non-blocking; the stories touch overlapping areas and may run in parallel). Dependencies are stored in the story's front-matter (D2) and are part of the traceability graph (FR-016).
**Source**: D11 "Stories can declare blocking ('strong') dependencies and non-blocking ('related') dependencies."
**Priority**: Must Have
**Release**: R1
**Acceptance**: Adding `depends_on: [US-002]` to US-005 in the UI writes it to US-005's front-matter; editing the front-matter externally updates the dependency in the UI (FR-018).

### FR-063: Propose, edit and validate dependencies
**Description**: During story generation (FR-010) the agent proposes blocking and related dependencies with a short rationale; they are Draft until the human approves the stories (FR-013). The user can add, change and remove dependencies in the story view and directly on the board. SpecForge rejects dependency cycles and references to unknown stories, naming the stories involved.
**Source**: D11 "requires dependency cycle detection"; §4 "AI-generated artifacts must never automatically become approved … without an appropriate human-controlled transition."
**Priority**: Must Have
**Release**: R1
**Acceptance**: Generated stories contain proposed dependencies with rationale; trying to add US-001 → US-003 when US-003 → US-001 already exists is refused with a message naming the cycle.

### FR-064: Visualise dependencies on the Kanban board
**Description**: Cards show dependency indicators: a *Blocked by n* badge with the open blocking predecessors, a *Blocks n* badge, and a *Related* marker. Selecting or hovering a card highlights its predecessors and successors on the board and draws connecting lines. A dependency graph view shows all stories and dependencies with their current state, with blocking chains distinguishable from related links.
**Source**: D11 "Dependencies are visualised on the Kanban board"; user request "it must be visualized in the Kanban board".
**Priority**: Must Have (badges, highlighting) / Should Have (graph view)
**Release**: R1
**Acceptance**: A story depending on an unfinished story shows *Blocked by 1 (US-002)*; selecting it highlights US-002; once US-002 is Done the badge disappears.

### FR-065: Queue stories with unmet blocking dependencies
**Description**: When a human moves a story to *In Progress* and any blocking predecessor is not *Done*, or no run slot is free, the story enters the *Queued* sub-state instead of starting. The card shows the reason (e.g. "Waiting for US-002 (Review)", "Waiting for free run slot (3/3)"). Before queuing, SpecForge warns if a predecessor is not itself in progress (Backlog/Ready), as the story would otherwise wait indefinitely. The user can remove a story from the queue (back to *Ready*). If a predecessor is rejected or cancelled, queued dependents stay queued and the user is notified.
**Source**: D11 "A story moved to In Progress whose blocking predecessors are not yet Done is queued"; user request "Stories that have strong linear dependencies must be queued."
**Priority**: Must Have
**Release**: R1
**Acceptance**: Moving US-005 (depends on US-002 in Review) to In Progress puts US-005 in Queued with the reason shown; moving it back to Ready removes it from the queue; no run is created while it is queued.

### FR-066: Automatic start from the queue
**Description**: A scheduler starts queued stories automatically as soon as all their blocking predecessors are *Done* and a run slot is free, in the order in which they were queued. The human move to *In Progress* counts as the authorisation for this start (D11); no agent can cause a start. Each automatic start is logged with its trigger (e.g. "US-002 approved").
**Source**: D11 "starts automatically once they are Done … an automatic start from the queue is not an autonomous agent decision."; FR-023; CON-005.
**Priority**: Must Have
**Release**: R1
**Acceptance**: With US-005 queued behind US-002, approving US-002 starts US-005's run within 5 s; the run record shows the trigger; with all slots busy, US-005 starts when the next slot is freed.

### FR-067: Stacked branches for dependent stories
**Description**: In git mode, if a blocking predecessor's branch is not yet merged into the base branch when the dependent story starts, the dependent's branch is created from the predecessor's branch. With several unmerged predecessors, SpecForge creates the dependent's branch from a merge of their branches; if that merge conflicts, the run is not started, the story stays Queued with status *Blocked (conflict)*, and the user is notified to resolve it (e.g. by merging the predecessors manually). The story records which branches it is stacked on. Predecessors already merged into the base branch are taken from the base branch.
**Source**: D11 "Its branch is stacked on the predecessor branch(es) when these are not yet merged into the base branch."; D4.
**Priority**: Must Have
**Release**: R1
**Acceptance**: With US-002 Done but unmerged, US-005's branch contains US-002's commits; the Review diff of US-005 (FR-043) shows only US-005's changes; with two conflicting predecessor branches, US-005 shows *Blocked (conflict)* and no run starts.

### FR-068: Dependency awareness of agents
**Description**: The context of each implementation run (FR-037) includes: (a) for blocking predecessors — their story text, acceptance criteria, run summary and changed files; (b) for related stories and other stories currently running in parallel — their story text, status and files changed so far; and (c) an instruction to stay within the story's scope and not modify functionality owned by other stories. Agents may report detected dependency issues (e.g. "needs US-007 first") in the structured result (FR-036); these appear as recommendations for the human (FR-023) and never change dependencies automatically.
**Source**: D11 "included in the agent's context"; user request "agents need to be aware of it".
**Priority**: Must Have
**Release**: R1
**Acceptance**: The assembled context of US-005's run lists US-002's summary and changed files and the currently running stories; an agent-reported missing dependency is shown as a suggestion that the user can accept to add the dependency.

### FR-069: Monitor and control multiple concurrent runs
**Description**: The execution view shows all active and queued runs at once (story, status, elapsed time, pending permission requests) and lets the user switch between their live streams, or view them side by side. Each run can be cancelled individually; cancelling one run does not affect others. Permission prompts (FR-032) and notifications always identify the story and run they belong to.
**Source**: D10 "Scheduler and run management must handle concurrent runs, concurrent permission prompts and concurrent reviews."; Goal 8.
**Priority**: Must Have
**Release**: R1
**Acceptance**: With 3 runs active, the overview lists all 3 with live status; cancelling one leaves the other 2 running; two simultaneous permission requests from different runs are shown as two separate, labelled entries.

### FR-070: Detect overlapping changes between parallel runs
**Description**: While runs execute in parallel, SpecForge tracks which files each run changes. If two active or unmerged story branches modify the same file, both cards and reviews show an *Overlap* warning naming the other story and file(s), and the overlap is included in the context of later correction rounds (FR-045). SpecForge may suggest adding a related or blocking dependency.
**Source**: D10; §5.6 "reducing the risk of overwriting unrelated changes".
**Priority**: Should Have
**Release**: R2
**Acceptance**: When US-003 and US-004 both edit `src/auth/session.ts`, both cards show an Overlap warning naming the other story and the file.

### FR-071: Cascade information to dependents
**Description**: When a story that has dependents changes in a way that may affect them — its story text or acceptance criteria are edited — SpecForge flags its dependents (queued, running, in Review or Done) as *Potentially impacted* (FR-017) and shows which predecessor changed.
**Source**: D11; §5.3 "identify potentially impacted downstream artifacts when specifications change."
**Priority**: Should Have
**Release**: R2
**Acceptance**: Editing the acceptance criteria of US-002 flags US-005 (depends on US-002) as potentially impacted with a reference to US-002.

### FR-072: Offer to commit specification changes
**Description**: In git mode SpecForge shows when files under `spec/` and `.specforge/` have uncommitted changes (e.g. from status transitions, approvals, generation) and offers a one-click *Commit spec changes* that commits only those paths on the current branch with a generated message. SpecForge never commits automatically and never commits other files.
**Source**: ADR-004 decision (2026-10-13); D2.
**Priority**: Should Have
**Release**: R1
**Acceptance**: After moving two stories, the indicator shows "2 spec files changed"; *Commit spec changes* creates one commit containing only those files; uncommitted code changes remain uncommitted.

---

## 10. User workflow: setup, start wizard, guided phases, dashboard, chat

### FR-073: First-start setup wizard
**Description**: On first start (no completed setup recorded) SpecForge opens a setup wizard with the steps: (1) agent runtime — detect and verify Claude Code (path, version, minimum version); (2) AI provider — enter API key or select cloud provider configuration (ADR-007), stored in the OS credential store, with a connection test run; (3) Git — detect Git and version (optional); (4) default approval rules — choose which tools/commands may run without prior approval (global defaults, FR-051), starting from suggested rules, none pre-enabled; (5) execution defaults — parallel runs, timeouts, notifications, log retention; (6) summary and health check. Each step shows status (OK / warning / missing) and help to fix it.
**Source**: D13; user request "on first start-up … the app starts in a configuration mode".
**Priority**: Must Have
**Release**: R1
**Acceptance**: On a fresh install the wizard opens; completing all steps with valid inputs records setup as complete, and the next start goes directly to the start wizard; the selected default rules appear as global rules.

### FR-074: Limited mode when setup is incomplete
**Description**: The user can skip setup or individual steps. Without a verified agent runtime and AI provider, SpecForge runs in limited mode: projects can be created/opened, artifacts edited manually, stories and the board managed, but all AI functions (generation, quality check, chat, runs) are disabled with an explanation and a persistent "Complete setup" banner that opens the wizard at the missing step.
**Source**: D13 "Setup can be skipped; SpecForge then runs in a limited mode".
**Priority**: Must Have
**Release**: R1
**Acceptance**: Skipping setup opens the start wizard; *Generate requirements* is disabled with tooltip "Agent not configured — complete setup"; moving a story to In Progress is refused with the same explanation.

### FR-075: Re-run setup and environment status
**Description**: The setup wizard can be re-opened from Settings at any time. An environment status page shows the current state of runtime, provider credentials (configured / not configured, never the value), Git, and default rules, and re-runs the health check on demand.
**Source**: D13 "setup can be re-opened from Settings".
**Priority**: Should Have
**Release**: R2
**Acceptance**: After uninstalling Claude Code, the status page shows the runtime as missing and AI functions switch to limited mode.

### FR-076: Start wizard
**Description**: When no project is open (after setup, on start, or via "Close project"), SpecForge shows a start wizard with: *Open existing project*, *Create new project*, *Adopt existing code folder* (from Release 2, FR-079), and a list of recent projects (name, path, last opened, phase).
**Source**: D14; user request "provide a wizard for 1.) opening an existing project 2.) create a new project".
**Priority**: Must Have
**Release**: R1
**Acceptance**: With no project open the start wizard is shown with its elements (without *Adopt* in Release 1); clicking a recent project opens it on its dashboard.

### FR-077: Open an existing SpecForge project
**Description**: *Open existing project* lets the user select a folder. If it contains `.specforge/project.yaml`, the project is registered (if not yet) and opened on its dashboard. If not, SpecForge explains that this is not a SpecForge project and offers *Adopt this folder* (FR-079) or *Create new project here* (empty folder only).
**Source**: D14 "open an existing SpecForge project (folder with `.specforge` metadata)".
**Priority**: Must Have
**Release**: R1
**Acceptance**: Selecting a folder cloned from a repository that contains SpecForge metadata opens it with all artifacts, stories and dependencies indexed; selecting a folder without metadata shows the adopt/create choice.

### FR-078: Create a new project with a new folder
**Description**: *Create new project* asks for project name, parent location and folder name (pre-filled from the project name), creates the folder, initialises Git by default (checkbox, explained: required for parallel runs and isolation), creates the SpecForge structure and an initial commit, and starts the guided phase process at *Intent* (FR-080).
**Source**: D14; user request "when creating a new project, the user is asked to create a new project folder".
**Priority**: Must Have
**Release**: R1
**Acceptance**: Creating "Task Manager" under a chosen parent creates `task-manager/` with `.git`, `.specforge/`, `spec/` and one initial commit, and opens the Intent phase.

### FR-079: Brownfield onboarding (adopt existing code)
**Description**: *Adopt existing code folder* registers a folder that contains code but no SpecForge metadata. SpecForge creates the SpecForge structure (Git detected; offer `git init` if absent), then — on request — runs an analysis run in which the agent reads the codebase (read-only) and drafts: a current-state summary, a draft intent ("as-is" description plus a section for the desired change, to be completed by the user), and draft current-state requirements and design (architecture, components, technologies). All drafts are *Draft* and enter the guided phase process.
**Source**: D14 "adopt an existing code folder … AI analyses the codebase and drafts intent and current-state specifications".
**Priority**: Should Have
**Release**: R2
**Acceptance**: Adopting a sample repository produces a Draft intent and a current-state design document naming the detected languages, frameworks and main components; no source file is modified.

### FR-080: Guided phase process (stepper)
**Description**: Every project shows a phase stepper *Intent → Requirements → Design → User stories → Kanban*, with per-phase status (not started / in progress / awaiting approval / approved / potentially impacted) derived from artifact states. The stepper recommends the next phase. Gates are soft: starting a phase whose inputs are not approved shows a warning that the user can confirm (FR-013). Earlier phases can be reopened at any time; changes there flag later phases as potentially impacted (FR-017). The *Kanban* step becomes available once stories exist and opens the board.
**Source**: D15; user request "guided through a process 1.) intent 2.) requirements 3.) designs 4.) user stories 5.) Kanban".
**Priority**: Must Have
**Release**: R1
**Acceptance**: In a new project the stepper shows Intent as current; after approving the intent, Requirements is recommended; starting Design with Draft requirements shows the warning; after story generation the Kanban step shows the stories on the board.

### FR-081: Uniform phase loop
**Description**: Each phase screen offers the same loop: (1) *Write / Generate* (manual or AI generation from approved inputs), (2) *AI quality check* (FR-082), (3) *Review & refine* (manual edit, refine with AI, decision review FR-083), (4) *Approve*. The screen shows which step the phase is in and what is recommended next.
**Source**: D15 "Each phase follows the loop generate → AI quality check → review/refine → approve".
**Priority**: Must Have
**Release**: R1
**Acceptance**: For the Requirements phase all four steps are available; after generation the screen recommends "Run quality check"; after approval it recommends "Continue to Design".

### FR-082: AI quality check of artifacts
**Description**: For any artifact (intent, requirements, design, ADRs, stories, test concepts) the user can run an AI quality check. The agent evaluates phase-specific criteria — e.g. intent: completeness, ambiguity, scope, success criteria, constraints, conflicts; requirements: testability, measurability, coverage of the intent, contradictions; design: coverage of requirements, consistency with constraints, open decisions; stories: INVEST, acceptance criteria, dependencies — and returns findings (severity, location, explanation, suggested fix) plus clarification questions. Findings are listed; each suggested fix can be applied as a proposal (diff, FR-014) or dismissed. For the intent this includes the clarification dialogue (FR-006).
**Source**: D15; user request "AI support to check, validate and enhance the created written intent".
**Priority**: Must Have
**Release**: R1
**Acceptance**: Running the check on an intent lacking success criteria returns a finding "No success criteria" with a suggested section; applying it shows a diff and, on accept, adds the section and sets the intent to Draft.

### FR-083: Decision review mode
**Description**: SpecForge collects open items from the project's artifacts — open questions, assumptions to confirm, proposed ADRs, agent recommendations — and lets the user walk through them one by one. Each item shows context, options (with a recommended option and trade-offs, generated by the agent where not present) and allows *Accept recommended*, *Choose alternative*, *Enter own answer*, or *Defer*. Decisions are written back to the source artifacts (e.g. ADR status → Accepted, assumption → decision table) as proposals for acceptance, with date.
**Source**: D18.
**Priority**: Should Have
**Release**: R2
**Acceptance**: With three proposed ADRs, decision review presents them one at a time; accepting the recommended option sets the ADR status to Accepted with today's date; deferring keeps it Proposed and lists it again next time.

### FR-084: Implementation plan view
**Description**: After stories exist, a plan view shows the dependency graph with suggested *waves* (sets of stories without mutual blocking dependencies that can run in parallel within the concurrency limit), the critical path (longest blocking chain), and per-wave size totals. The user can select a wave and move its Ready stories to In Progress in one action (each move remains a human authorisation, FR-022).
**Source**: D19.
**Priority**: Should Have
**Release**: R2
**Acceptance**: For stories A→B→C and independent D, E, the plan shows wave 1 {A, D, E}, wave 2 {B}, wave 3 {C} and critical path A→B→C.

### FR-085: Project dashboard
**Description**: Opening a project shows its dashboard (project home) with: current phase and phase stepper (FR-080); recommended next step with a one-click action (FR-086); story statistics (total; per state Backlog / Ready / In Progress incl. queued / Review / Done; merged); implementation progress (Done vs. total, by wave if available); active and queued runs; pending decisions (FR-033); usage & cost summary (from Release 2, FR-090); recent activity (last generations, approvals, runs, reviews).
**Source**: D16; user request "a Dashboard … overview on the current project status".
**Priority**: Must Have
**Release**: R1
**Acceptance**: For a project with 10 stories (3 Done, 2 In Progress, 1 Review, 4 Ready) the dashboard shows these counts, 30 % progress, the running stories and the next-step recommendation.

### FR-086: Recommended next step
**Description**: SpecForge determines the recommended next step deterministically from project state (rule-based, not AI), e.g. "Complete setup", "Write your intent", "Run quality check on intent", "Approve requirements", "Generate user stories", "Review US-003", "Answer 2 permission requests", "Merge 3 approved branches", "Move Ready stories to In Progress". Rules are evaluated in a fixed priority order (blocking human decisions first). Steps for capabilities of later releases (e.g. feature intents, epic review) are included once those capabilities exist. The chat agent may additionally suggest steps, shown as agent suggestions.
**Source**: D16 "what is recommended next".
**Priority**: Must Have
**Release**: R1
**Acceptance**: With an approved intent and no requirements, the recommendation is "Generate requirements"; when a permission request is pending, it takes precedence.

### FR-087: Artifact links on the dashboard
**Description**: The dashboard lists all project artifacts grouped by phase (intent, requirements, design incl. ADRs, stories, test concepts) with approval state, impact flags, last change and generating run. Each entry opens the artifact in the viewer/editor for review.
**Source**: D16 "include links to the created artifacts … so that the user can easily access the documents and review them".
**Priority**: Must Have
**Release**: R1
**Acceptance**: After requirements generation the dashboard shows the four requirement files as Draft; clicking one opens it.

### FR-088: Kanban link on the dashboard
**Description**: The dashboard contains a prominent link to the Kanban board with story counts. While no user story exists, the link (and the Kanban navigation entry) is disabled with the hint "No user stories yet — generate or write stories first" and a shortcut to the User stories phase.
**Source**: D16 "The dashboard must include a link to the Kanban. In case there is no user story written yet, the link to the Kanban is disabled."
**Priority**: Must Have
**Release**: R1
**Acceptance**: In a new project the Kanban link is disabled with the hint; after the first story file is indexed it becomes enabled.

### FR-089: Project chat with the AI agent
**Description**: The dashboard contains a chat panel (also openable full-screen) to converse with the configured agent about the project: ask questions, get explanations, request analyses or suggestions. The chat agent works in the project's main workspace and receives project context (intent summary, artifact index, board state, project instructions). Conversations are organised in multiple threads per project (title, created/last used); each thread is a resumable agent session and can be continued after restarts. Chat runs are specification-type runs (not counted toward the concurrency limit, ADR-009). **In Release 1 the chat is read-only**: all write requests are denied by policy with an explanation; write capability (FR-091) follows in Release 2.
**Source**: D17; user request "the Dashboard also allows the user to chat with the underlying AI CLI".
**Priority**: Must Have
**Release**: R1
**Acceptance**: Asking "Which stories depend on US-002?" returns an answer referencing the correct stories; closing and reopening SpecForge shows the thread, and a follow-up question continues the same session.

### FR-090: Usage and cost overview
**Description**: For every run (including chat and specification runs) SpecForge records token usage and cost as reported by the adapter and shows them per run, aggregated per phase (intent, requirements, design, stories, implementation, chat) and per project, on the dashboard and in the execution view. Values are labelled "as reported by <runtime>"; when not reported, "n/a".
**Source**: D20.
**Priority**: Should Have
**Release**: R2
**Acceptance**: After two implementation runs reporting $0.42 and $0.31, the dashboard shows $0.73 for Implementation and the project total includes it.

### FR-091: Chat agent may edit specifications and code
**Description**: The chat agent may create and modify files in the main workspace — specifications and source code — but every write (and every other permission-requiring action) goes through the permission relay and approval rules (FR-032, FR-051). SpecForge records all files changed by each chat message and shows them inline in the thread as a diff, with *Revert this change* (git: restore from HEAD/previous content; non-git: from a pre-message snapshot). Specification files changed by the chat become Draft and trigger impact analysis (FR-013, FR-017). Code changes made via chat are labelled as "outside the Kanban flow" in the activity feed.
**Source**: D17 "may read the project and edit specifications and code in the main workspace; every write goes through the permission relay".
**Priority**: Must Have
**Release**: R2
**Acceptance**: Asking the chat to fix a typo in `README.md` triggers a permission prompt; after allowing, the thread shows the diff and *Revert*; reverting restores the original content.

### FR-092: Chat restrictions
**Description**: The chat agent can never move stories, change story status, or start, queue or cancel implementation runs; it can only recommend (FR-023). It may draft new stories (as Draft, status Backlog). In non-git workspaces chat writes are refused while an implementation run is active (shared working copy, D12). In git workspaces, writes to files currently touched by active runs' branches show an *overlap* warning in the permission prompt.
**Source**: D17 "It can never move stories or start implementation runs. … In non-git workspaces chat writes are blocked while an implementation run is active."
**Priority**: Must Have
**Release**: R1
**Acceptance**: Asking the chat to "start US-004" results in an explanation and a recommendation card, not a run; in a non-git project with an active run, a chat edit request is refused with the reason.

---

## 11. Epics

### FR-093: Epic artifact
**Description**: An epic is a Markdown artifact (`spec/04_user_stories/epics/EP-xxx-<slug>.md`) with ID, title, goal, business value, linked requirements/design elements, epic-level acceptance criteria, scope notes and approval state. A story references at most one epic via `epic: EP-xxx` in its front-matter; stories without an epic are allowed. Epics are part of the traceability graph (requirement → epic → story).
**Source**: D21.
**Priority**: Must Have
**Release**: R1
**Acceptance**: Creating epic EP-001 writes the file with front-matter; assigning US-003 to EP-001 writes `epic: EP-001` to US-003; the trace panel (FR-016) of a requirement linked to EP-001 shows EP-001 and its stories.

### FR-094: Epic-first story generation
**Description**: The User stories phase has two steps: (1) *Generate epics* — the agent proposes epics from the approved requirements and design (goal, value, linked requirements, acceptance criteria, rationale), the user reviews, edits, merges/splits and approves the epic structure; (2) *Generate stories* — stories are generated per approved epic (all or selected epics), each linked to its epic, with dependencies (FR-063). Epics and stories can also be created and assigned manually. The quality check (FR-082) covers epics (coverage of requirements, overlap between epics, size balance).
**Source**: D21 "the AI first proposes epics (user approves the structure), then generates stories per epic".
**Priority**: Must Have
**Release**: R1
**Acceptance**: For the MVP acceptance intent, *Generate epics* proposes epics such as "User authentication", "Task management", "Kanban board"; after approval, *Generate stories* for "User authentication" creates stories all carrying `epic: EP-001`.

### FR-095: Derived epic status and progress
**Description**: Epic status is derived from its stories and never set on the board: *Not started* (no story beyond Ready), *In progress* (≥ 1 story In Progress, Review or Done, not all Done), *Ready for epic review* (all stories Done, epic review not confirmed), *Done* (epic review confirmed or explicitly skipped — the outcome `confirmed` / `skipped` is stored in the epic file), *Merged* (Done and all story branches merged into the base branch, detected per FR-115). Adding a story to an epic that is Done or Merged clears the stored review outcome and returns the epic to *In progress*. Progress = Done stories / total (count and size-weighted).
**Source**: D21 "Epic status is derived from its stories; epics are never executed by agents."
**Priority**: Must Have
**Release**: R1
**Acceptance**: With EP-001 having 8 stories of which 5 are Done and 1 In Progress, EP-001 shows *In progress* and 5/8; when the last story is approved it shows *Ready for epic review*.

### FR-096: Kanban swimlanes per epic
**Description**: The board can be shown *by epic* (default when epics exist) or *flat*. In epic view each epic is a horizontal swimlane spanning the five columns, with a lane header (ID, title, status, progress bar, story counts) and collapse/expand; stories without an epic appear in a *No epic* lane. Cards show an epic colour tag in both views; an epic filter limits the board to selected epics. Moving cards between columns follows the normal transition rules (FR-021); dragging a card into another lane changes its epic after confirmation. Lane order follows epic order in the backlog (reorderable by drag).
**Source**: D21 "The Kanban board shows swimlanes per epic (toggle to flat board)."
**Priority**: Must Have
**Release**: R1
**Acceptance**: With two epics, the board shows two lanes plus *No epic*; collapsing EP-002 hides its cards but keeps its header with counts; dragging US-009 from the *No epic* lane into EP-002 asks for confirmation and then writes `epic: EP-002`.

### FR-097: Derived epic dependencies
**Description**: SpecForge derives epic-level dependencies from story dependencies (EP-B depends on EP-A if any story of EP-B has a blocking dependency on a story of EP-A) and shows them in lane headers ("depends on EP-001"), in the dependency graph (grouped by epic) and in the plan view. Epic dependencies are not declared separately.
**Source**: D21; FR-062.
**Priority**: Should Have
**Release**: R2
**Acceptance**: When US-012 (EP-002) depends on US-003 (EP-001), EP-002's lane header shows "depends on EP-001".

### FR-098: Start an epic
**Description**: From the lane header or the plan view the user can *Start epic*, which moves all Ready stories of the epic to In Progress in one action. Each move is a human authorisation (FR-022); stories with open blocking dependencies or beyond the concurrency limit are queued (FR-065); non-Ready stories are listed as skipped.
**Source**: D21; FR-084.
**Priority**: Should Have
**Release**: R2
**Acceptance**: *Start epic* on EP-001 with 4 Ready stories (one depending on another) starts 3 runs and queues 1; the confirmation lists all 4.

### FR-099: Epic context for agents
**Description**: The context of an implementation run (FR-037) includes the story's epic: goal, epic acceptance criteria, and the other stories of the epic with status and (for Done stories) run summaries and changed files, so the agent builds consistent parts of one feature.
**Source**: D21.
**Priority**: Must Have
**Release**: R1
**Acceptance**: The assembled context of a run for US-004 (EP-001) contains EP-001's goal and lists US-001 – US-003 with status and summaries.

### FR-100: Epic review
**Description**: When all stories of an epic are Done, the epic shows *Ready for epic review* (pending decision, FR-033). The epic review shows: all stories with their review outcomes; the combined changes (per-story diffs grouped, with the union of changed files); the epic acceptance criteria as a checklist; and an optional AI completeness check (agent evaluates the combined changes against the epic acceptance criteria and reports gaps). The user can *Confirm epic Done*, *Add follow-up stories* (created in the epic, status Backlog; epic returns to In progress), or *Skip review* (epic becomes Done).
**Source**: D21 "an optional epic review (combined changes, epic acceptance criteria, AI completeness check) lets the user confirm the epic or add follow-up stories".
**Priority**: Should Have
**Release**: R2
**Acceptance**: After the last EP-001 story is approved, the epic review lists 8 stories and the union of changed files; the AI check reports "Password reset email not covered"; *Add follow-up story* creates US-021 in EP-001 and EP-001 returns to In progress.

### FR-101: Epics on the dashboard
**Description**: The dashboard shows an epics widget with each epic's status and progress, and links to the epic artifact, its board lane and (from Release 2) its epic review. The artifact list includes epics. The next-step engine includes "Review epic EP-x" and "Approve epic structure" (FR-086).
**Source**: D21; D16.
**Priority**: Must Have
**Release**: R1
**Acceptance**: The dashboard lists EP-001 *In progress 5/8* and EP-002 *Not started 0/6*; clicking EP-001 opens the board filtered to its lane.

---

## 12. Evolving an existing project: feature intents

### FR-102: "Add feature" entry points
**Description**: Once the main intent is approved, the dashboard shows a prominent primary action **＋ Add feature** in its header (with a split-button menu: *Add feature*, *Capture idea* (FR-111), *Edit specs directly*). The same action is available from the Intent area, from the idea inbox (*Turn into feature*), from the chat (agent may suggest "Create a feature intent from this conversation?"), and via the command palette / shortcut (e.g. Ctrl/Cmd+Shift+F). Before the main intent is approved, the action points the user to the main intent instead.
**Source**: D22; user request "a button … in the Dashboard like 'Add feature'".
**Priority**: Must Have
**Release**: R2
**Acceptance**: On the dashboard of a project with an approved intent, *Add feature* is visible in the header; clicking it opens the feature wizard; the shortcut opens the same wizard from any screen.

### FR-103: Feature wizard with AI review, enhancement and clarification
**Description**: The feature wizard guides the user in four steps: (1) **Describe** — free text for the idea, optional fields motivation, target users, priority, and related epic/area (pickers); (2) **AI review** — a `feature_review` agent run analyses the idea against the main intent and existing specs and returns an enhanced draft (problem, goal, scope in/out, success criteria, constraints, assumptions), detected overlaps with existing requirements/epics, conflicts with requirements/ADRs, and clarification questions; (3) **Clarify** — the user answers questions and accepts/rejects suggestions in a multi-turn dialogue (same session); the draft updates live; (4) **Save** — the feature intent is written as Markdown `spec/01_intent/FI-xxx-<slug>.md` beside the main intent (Draft), with the Q&A recorded as clarified decisions; the user can approve immediately or later. The wizard can be closed and resumed (draft kept).
**Source**: D22; user request "the user can enter his feature idea, the feature is reviewed by AI and enhanced, questions are asked by the AI, the feature intent is documented as Markdown beside the main intent".
**Priority**: Must Have
**Release**: R2
**Acceptance**: Entering "Users can comment on tasks" produces a draft with goal, scope and success criteria, flags an overlap with an existing requirement on task details, and asks at least one question (e.g. "Should comments support mentions?"); after answering and saving, `spec/01_intent/FI-001-task-comments.md` exists with the answers recorded.

### FR-104: Feature intent artifact and lifecycle
**Description**: A feature intent has ID `FI-xxx`, title, problem, goal, scope (in/out), success criteria, constraints, assumptions, clarified decisions, related epics/requirements, and a status: *Draft* → *Approved* → *In delivery* (delta specs or stories exist) → *Done* (all stories linked to the feature via `feature: FI-xxx` are Done) or *Withdrawn* (terminal, set by the user: open change sets are discarded, already applied delta changes remain and may be deprecated by the user, linked stories not yet started are listed for a keep/delete decision). All requirements, design elements, ADRs, epics and stories created or changed for the feature link to it (`feature: FI-xxx` / trace links `introduces` / `changes`).
**Source**: D22.
**Priority**: Must Have
**Release**: R2
**Acceptance**: After delta requirements are accepted for FI-001, FI-001 shows *In delivery* and its trace panel lists the new and changed requirements.

### FR-105: Feature-scoped guided phases
**Description**: Each feature intent has its own stepper: *Feature intent → Impact → Requirements (delta) → Design (delta) → Epic & stories → Kanban → Epic review*, with the same loop per phase (generate → quality check → review/refine → approve, FR-081) and soft gates (FR-080). After the feature intent is approved, the wizard's final screen offers *Continue to impact analysis*. Several features can be in progress at the same time, each with its own stepper. The project-level stepper switches to *Maintenance* once the initial delivery is complete (all initial epics Done) and shows active features instead.
**Source**: D22 "the user is then guided through feature-scoped phases"; user request "guided through the further phases like requirements generations, design generation, epic and user story breakdown".
**Priority**: Must Have
**Release**: R2
**Acceptance**: After saving FI-001 and approving it, the feature's stepper shows *Impact* as next step; the dashboard shows FI-001 with its stepper among active features.

### FR-106: Impact analysis for a feature
**Description**: For an approved feature intent SpecForge runs an impact analysis combining (a) the trace graph (elements linked to the feature's related epics/requirements and their downstream stories, runs and files) and (b) an `impact` agent run that reads specs and code. Result: a categorised impact list — requirements to change / deprecate / add, design elements and ADRs affected (or new ADRs needed), epics to extend or create, stories not started to adjust, in-flight stories (queued, running, in review) affected, Done stories whose implementation is affected (→ rework candidates, FR-109), and code areas likely touched. Each item has a reason and a confidence level (high / medium / low; trace-derived items are always high); the user confirms, removes or adds items. The confirmed impact list scopes the following delta phases.
**Source**: D22.
**Priority**: Must Have
**Release**: R2
**Acceptance**: For FI-001 "task comments", the impact list includes the data-model design element for tasks, the epic "Task management", and the Done story implementing the task detail view as rework candidate, each with a reason.

### FR-107: Delta specification generation
**Description**: In the Requirements (delta) and Design (delta) phases, the agent generates only changes scoped by the confirmed impact list: new elements with new IDs, modified elements as diffs, deprecated elements marked `[DEPRECATED]` with reason (never deleted or renumbered), new ADRs. Each change links to the feature intent and is presented in a single change set (grouped by file) for accept/discard per change. Accepted changes set the affected artifacts to Draft until approved and trigger impact flags downstream (FR-017). Changelogs/summary tables are updated with an entry referencing the feature.
**Source**: D22 "Approved artifacts are changed only via reviewed diffs with stable IDs."
**Priority**: Must Have
**Release**: R2
**Acceptance**: Delta requirements for FI-001 add new requirements with the next free IDs and modify one existing requirement as a diff; discarding one change leaves that element untouched; accepted elements carry `feature: FI-001`.

### FR-108: Feature epic and story breakdown
**Description**: In the Epic & stories phase the agent proposes either a new epic for the feature (default) or extending existing epic(s) identified in the impact analysis, then generates stories per epic (FR-094), including adjustments to not-started stories (as diffs) and rework stories (FR-109). All stories link to the feature intent. Dependencies on existing stories (including Done ones) are proposed and validated (FR-063).
**Source**: D22.
**Priority**: Must Have
**Release**: R2
**Acceptance**: For FI-001 the agent proposes new epic "Task comments" with 4 stories, one of them a rework story for the existing task view; all link to FI-001 and appear in the new epic's lane in Backlog.

### FR-109: Rework stories for implemented functionality
**Description**: When a feature affects functionality implemented by Done stories, SpecForge never reopens them. Instead it proposes **rework stories** (`reworks: [US-008]`) describing the required change, with acceptance criteria and a link to the feature intent. Rework stories are normal stories (Backlog, approval, Kanban, agent run); their agent context includes the original story, its run summary and changed files (FR-068). The original story shows "Reworked by US-xxx".
**Source**: D22 "Done stories are never reopened; affected implemented functionality gets new rework stories."
**Priority**: Must Have
**Release**: R2
**Acceptance**: The rework story for US-008 carries `reworks: [US-008]`; US-008 stays Done and displays "Reworked by US-023"; the run context for US-023 includes US-008's summary and changed files.

### FR-110: In-flight protection
**Description**: When the user accepts delta specifications or story changes that affect stories currently queued, running or in Review, SpecForge requires an explicit decision per affected story before applying: *Continue unchanged* (change applies to future work only; story flagged *Potentially impacted*), *Cancel / dequeue* (story returns to Ready to be updated), or *Apply in corrections* (the change is stored as pending correction feedback and pre-filled into *Request corrections* when the story is — or reaches — Review; the human still triggers the correction, FR-045; there is no system-initiated transition). Decisions are recorded on the story and the feature intent.
**Source**: D22 "Accepting deltas that affect queued, running or in-review stories requires an explicit per-story decision".
**Priority**: Must Have
**Release**: R2
**Acceptance**: Accepting a requirement change linked to running US-011 opens a dialog requiring a choice for US-011; choosing *Continue unchanged* flags US-011 as potentially impacted and records the decision.

### FR-111: Idea inbox
**Description**: Users can capture one-line ideas (with optional note) without processing them — from the *Add feature* menu, the dashboard inbox widget, the chat ("save as idea") or the shortcut. The inbox lists ideas with date and source; each idea can be *Turned into feature* (opens the feature wizard pre-filled), *Merged* into an existing feature intent, or *Dismissed* (with reason). Ideas are stored as Markdown in `spec/01_intent/ideas.md` (versionable).
**Source**: D22 "An idea inbox captures quick ideas for later triage".
**Priority**: Should Have
**Release**: R2
**Acceptance**: Capturing "Export board as PDF" adds it to the inbox; *Turn into feature* opens the wizard with the text pre-filled; after saving the feature intent, the idea shows "→ FI-002".

### FR-112: Spec baselines
**Description**: When a feature intent reaches *Done* (or on demand), SpecForge offers to create a spec baseline: a Git tag (e.g. `spec-v1.3`, name editable) on the current base-branch commit, with notes listing the included feature intents and epics. Requires git mode and committed spec changes (offers *Commit spec changes* first, FR-072). The dashboard shows baselines in a history view; artifacts can be compared with a baseline (FR-015).
**Source**: D22 "completing a feature offers a spec baseline (Git tag)".
**Priority**: Should Have
**Release**: R2
**Acceptance**: Completing FI-001 shows *Create baseline spec-v1.1*; confirming creates the tag; comparing a requirement changed by FI-001 with baseline spec-v1.0 shows the delta introduced by FI-001.

### FR-113: Active features on the dashboard
**Description**: The dashboard shows an *Active features* widget: each feature intent with status, its mini stepper (current phase highlighted), linked epic progress and next step; completed features are listed collapsed with their baseline. The next-step engine (FR-086) includes feature steps ("Answer 2 questions for FI-002", "Review impact of FI-001", "Approve delta requirements for FI-001"). An inbox counter shows untriaged ideas.
**Source**: D22; D16.
**Priority**: Must Have
**Release**: R2
**Acceptance**: With FI-001 in *Design (delta) · awaiting approval* and FI-002 *Draft*, both appear with their steppers; clicking FI-001 opens its current phase.

### FR-114: Direct edits remain possible
**Description**: Small corrections can still be made directly in existing specifications (normal edit, approval and impact flags, FR-012/FR-017). When a direct edit of approved specs adds new scope — defined as adding a new element-ID heading (e.g. a new requirement) or a new top-level section to an approved artifact, or changing more than 30 % of the main intent's lines — SpecForge suggests "This looks like a new feature — create a feature intent instead?" without blocking the edit.
**Source**: D22 "Small corrections may still be edited directly in existing specs."
**Priority**: Could Have
**Release**: R3
**Acceptance**: Adding a new requirement heading to an approved requirements file shows the suggestion; dismissing it saves the edit normally.

---

## 13. Consistency and integration rules

### FR-115: Merge detection
**Description**: SpecForge detects when a story branch has been merged by the user into the base branch (e.g. `git merge-base --is-ancestor <branch> <base>`) — on project open, on window focus, after Git operations it performs, periodically (default every 60 s) and via a manual *Refresh*. Detection sets the story's merged timestamp and drives the *Merged* epic status (FR-095), the merged count on the dashboard (FR-085), the next step "Merge n approved branches" (FR-086), the removal of overlap records (FR-070) and the switch of stacked bases to the base branch for later stories (FR-067).
**Source**: D4 (user merges manually); D11; FR-095.
**Priority**: Must Have
**Release**: R1
**Acceptance**: After the user merges `specforge/US-003` into `main` outside SpecForge and returns to the window, US-003 shows *Merged* within 5 s; a story depending on US-003 started afterwards branches from `main`.

### FR-116: Workspace consistency rules
**Description**: (a) Story status, approval, epic and dependency information is read only from the main workspace; run worktrees are never indexed; implementation runs cannot write `spec/**` or `.specforge/**` (built-in deny). *Commit spec changes* (FR-072) commits on the current branch of the main workspace. (b) Non-git mode (shared working copy): an implementation run does not start while a chat or specification run that may write is active — it is queued with reason "waiting for workspace" — and chat/specification writes are denied while an implementation run is active (FR-092). (c) Git mode: when a run starts while the main working copy has uncommitted changes, the user is warned that these changes are not part of the run's base.
**Source**: D2, D6, D12, D17; quality review 2026-10-14.
**Priority**: Must Have
**Release**: R1
**Acceptance**: An agent edit of a story file inside a worktree is denied; in a non-git project, moving a story to In Progress while a chat answer is being generated queues it with "waiting for workspace" and starts it after the chat run ends; in a git project with an uncommitted change in `src/`, starting a run shows the warning.

---

## 14. Deferred capabilities (traceability only)

### FR-059: Additional agent adapters (OpenCode, Cline, others)
**Description**: Adapters for further agent runtimes, selectable through configuration without changes to the application core.
**Source**: §9 "Support for OpenCode, Cline, and other agent runtimes shall follow the initial Claude Code integration."; Success criterion 7.
**Priority**: Won't Have (MVP) — architecture must allow it (see NFR-022).
**Release**: Later
**Acceptance**: (Future) A second adapter can be added as a new module and selected in settings with no change to core modules.

### FR-060: Parallel execution across different agent runtimes
**Description**: Run concurrent stories with different agent runtimes (e.g. Claude Code and OpenCode) and per-story runtime selection. (Parallel execution with multiple instances of the same runtime is in MVP scope — see FR-027.)
**Source**: §5.5 "Collaboration between different agent runtimes remains a long-term capability."; §9.
**Priority**: Won't Have (MVP)
**Release**: Later
**Acceptance**: (Future) Two stories run simultaneously, one with each of two configured runtimes.

### FR-061: Advanced and collaborative capabilities
**Description**: Multi-user collaboration, cloud project management, distributed execution, automated deployment, enterprise identity, external issue-tracker integration, automatic agent selection, cross-agent collaboration, cost optimisation, autonomous backlog refinement, specialised agents (§11).
**Source**: §9; §11.
**Priority**: Won't Have (MVP)
**Release**: Later
**Acceptance**: n/a for MVP.
