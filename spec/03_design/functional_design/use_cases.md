# SpecForge — Use Cases

**Source:** `spec/02_requirements/` (FR-001 – FR-116), intent D1–D22  
**Last updated:** 2026-10-14

**Actors**
- **User** — the human operator (architect, developer, tech lead). The only actor that may approve artifacts, move stories into *Ready* / *In Progress*, and accept work.
- **Agent** — a coding-agent run (initially Claude Code) executing on the user's machine through the agent adapter.
- **Scheduler** — the SpecForge system component that starts queued runs and moves completed runs to *Review*.
- **File system / Git** — the project workspace, edited also by external tools.

---

## A. Projects and workspace

## UC-001: Create project
**Actor(s)**: User
**Trigger**: User selects "Create new project" in the start wizard (UC-029). The guided variant with folder creation and Git initialisation is UC-029 flow B; this use case describes the underlying registration.
**Preconditions**: SpecForge is installed and running.
**Main Success Flow**:
1. User enters a project name and selects or creates a workspace folder.
2. System detects whether the folder is a Git repository (FR-004) and shows *git mode* (with current branch) or *non-git mode*.
3. System creates the specification structure (`spec/01_intent` … `spec/05_test_concepts`) and a `.specforge/project.yaml` descriptor, if not present.
4. System registers the project in the local database and opens it on the Intent screen.
**Alternative Flows**:
- 2a. Non-git folder: system shows the isolation warning and explains that parallel execution needs Git (D12); offers "Initialise Git repository" (runs `git init` + initial commit on confirmation).
- 3a. Folder already contains a SpecForge structure: system imports existing artifacts instead of creating new ones (UC-002 step 3).
- 3b. Folder not writable: error naming the folder; user selects another.
**Postconditions**: Project exists, is listed, and is open.
**Related Requirements**: FR-001, FR-004, FR-027, FR-058

## UC-002: Open / reopen project
**Actor(s)**: User
**Trigger**: User selects a project from the list, or SpecForge starts with a last-opened project.
**Preconditions**: Project is registered.
**Main Success Flow**:
1. System verifies the workspace path exists.
2. System re-detects git/non-git mode.
3. System scans and indexes workspace artifacts (IDs, links, story status, dependencies) and reconciles with the database (FR-018).
4. System runs startup recovery for the project (UC-024).
5. System shows the last-used screen with board, artifacts and run history restored.
**Alternative Flows**:
- 1a. Workspace missing (moved/deleted): system offers "Locate folder" or "Remove project".
- 3a. Artifact parse errors (e.g. broken front-matter): affected files are listed as *Invalid* with the error; the rest loads normally.
**Postconditions**: Project state equals the state before the last close.
**Related Requirements**: FR-002, FR-004, FR-018, FR-041

## UC-003: Manage projects
**Actor(s)**: User
**Trigger**: User opens the Projects area.
**Preconditions**: —
**Main Success Flow**:
1. System lists registered projects with path, mode, and counts of active runs / pending decisions.
2. User switches, renames, or removes (unlinks) a project.
3. On remove, system asks for confirmation, removes database entries, and leaves workspace files untouched.
**Alternative Flows**:
- 2a. Project has active runs: removal is blocked until runs are cancelled.
**Postconditions**: Project list updated.
**Related Requirements**: FR-003

---

## B. Intent and specifications

## UC-004: Write and edit intent
**Actor(s)**: User
**Trigger**: User opens the Intent area.
**Preconditions**: Project open.
**Main Success Flow**:
1. User writes or edits the intent in the Markdown editor (template offered for new intents).
2. User saves; system writes `spec/01_intent/<name>.md` and marks the intent *Draft*.
3. User marks the intent *Approved* when satisfied.
**Alternative Flows**:
- 2a. File changed externally since opening: conflict dialog (keep mine / take theirs / view diff).
- 2b. (Release 3) Direct edit of an approved spec adds new scope (e.g. a new requirement section or a significant intent change): system suggests "This looks like a new feature — create a feature intent instead?" (UC-043); dismissing saves the edit normally (FR-114).
**Postconditions**: Intent stored in workspace.
**Related Requirements**: FR-005, FR-012, FR-013, FR-018, FR-114

## UC-005: Clarify intent with AI
**Actor(s)**: User, Agent
**Trigger**: User clicks "Analyse intent".
**Preconditions**: Intent saved; agent runtime configured and verified.
**Main Success Flow**:
1. System starts a *specification run* (type `clarify`) via the agent adapter with the intent and a clarification instruction.
2. Agent returns questions, ambiguities, alternatives and assumptions in the structured result.
3. System shows them as a question list; user answers each, or accepts/rejects proposed assumptions.
4. User submits answers; system resumes the same agent session with the answers (multi-turn).
5. When the agent reports no further questions, or the user ends the dialogue, system writes a "Clarified decisions / assumptions" section into the intent (as a proposed change, UC-008).
**Alternative Flows**:
- 1a. Agent executable missing/unauthenticated: error with link to settings (FR-056).
- 2a. Agent requests permission (e.g. read files): relayed as in UC-020.
- 4a. User cancels: run marked *Cancelled*; answers given so far are kept as a draft.
**Postconditions**: Intent contains documented answers and assumptions (Draft until approved).
**Related Requirements**: FR-006, FR-014, FR-028, FR-032

## UC-006: Generate specification artifacts
**Actor(s)**: User, Agent
**Trigger**: User clicks "Generate requirements" / "Generate design" / "Generate stories" / "Generate test concepts" (Release 2).
**Preconditions**: Upstream artifacts exist (intent for requirements; requirements for design; design for stories; requirements + stories for test concepts).
**Main Success Flow**:
1. System checks the approval state of the inputs (FR-013).
2. System starts a specification run with the inputs, the target folder, the ID conventions and the output templates.
3. Execution view shows the run streaming; permission requests are relayed (UC-020).
4. On completion, system parses the produced/changed files, assigns them *Draft*, indexes IDs and links (FR-016), and presents a summary with a diff of all changes.
5. User accepts the changes (files kept) or discards them (files restored).
**Alternative Flows**:
- 1a. Inputs are Draft: warning "Inputs not approved — continue?"; user confirms or cancels.
- 4a. Produced files violate the format (missing IDs, invalid front-matter): listed as validation issues; user can fix manually or "Ask agent to fix".
- 4b. For stories: proposed dependencies are validated (cycles, unknown IDs) and reported (FR-063).
**Postconditions**: New/updated Draft artifacts in workspace, indexed.
**Related Requirements**: FR-007, FR-008, FR-009, FR-010, FR-011, FR-013, FR-016, FR-063

## UC-007: Review and approve artifacts
**Actor(s)**: User
**Trigger**: User opens a Draft artifact or the "Pending approvals" list.
**Preconditions**: Draft artifact exists.
**Main Success Flow**:
1. User reads the rendered artifact and its trace links.
2. User edits if needed and saves.
3. User clicks "Approve"; system sets `approval: approved` (front-matter) with approver timestamp.
**Alternative Flows**:
- 3a. Approving stories: approving a story file = Backlog story becomes eligible to be moved to Ready (it stays in Backlog).
**Postconditions**: Artifact Approved.
**Related Requirements**: FR-012, FR-013

## UC-008: Refine artifact with AI
**Actor(s)**: User, Agent
**Trigger**: User selects an artifact (or section) and "Refine with AI", entering an instruction.
**Preconditions**: Artifact exists.
**Main Success Flow**:
1. System starts a specification run (type `refine`) with the artifact, the instruction and linked context.
2. On completion, system shows the proposed change as a diff.
3. User accepts (file written, status → Draft) or discards (no change).
**Alternative Flows**:
- 3a. (Release 2) Accepted change modifies elements that have downstream links: impacted artifacts flagged (UC-010).
**Postconditions**: Artifact refined or unchanged.
**Related Requirements**: FR-014, FR-017

## UC-009: Navigate traceability
**Actor(s)**: User
**Trigger**: User opens the "Trace" panel of any artifact element, story, run or changed file.
**Preconditions**: Indexed artifacts.
**Main Success Flow**:
1. System shows upstream and downstream links (intent ↔ requirements ↔ design/ADRs ↔ stories ↔ runs ↔ changed files/tests).
2. User clicks a link to navigate; changed files open as diff or in the default editor.
**Postconditions**: —
**Related Requirements**: FR-016, FR-055

## UC-010: Handle changes and impact (Release 2)
**Actor(s)**: User
**Trigger**: An artifact element with downstream links is changed (in-app, by agent, or externally).
**Preconditions**: Trace links exist.
**Main Success Flow**:
1. System computes downstream elements (incl. dependent stories, FR-071) and flags them *Potentially impacted* with the source change.
2. User reviews each flagged item and either edits it, or clears the flag.
**Postconditions**: Impact flags reflect unresolved potential impacts.
**Related Requirements**: FR-017, FR-071

## UC-011: View artifact history (Release 2)
**Actor(s)**: User
**Trigger**: User opens "History" of an artifact.
**Main Success Flow**:
1. System lists revisions (git log for the file, or local revisions in non-git mode).
2. User selects two revisions; system shows the diff.
**Related Requirements**: FR-015

## UC-012: Reconcile external edits
**Actor(s)**: File system (external editor, git checkout, agent)
**Trigger**: A watched workspace file changes.
**Preconditions**: Project open.
**Main Success Flow**:
1. System debounces the change, re-parses the file, and updates the index (IDs, links, status, dependencies). Only the main workspace is watched and indexed; run worktrees never are (FR-116a).
2. Board and open views refresh.
3. If a story's status changed to a value that requires a human transition the file change did not legitimately make (e.g. → `in_progress` written by an agent), system reverts it in the index, flags the file and notifies the user (FR-023).
**Alternative Flows**:
- 1a. File open with unsaved changes: conflict prompt.
- 1b. Parse error: file marked *Invalid*; previous indexed state retained.
**Related Requirements**: FR-018, FR-020, FR-023, FR-116

---

## C. Dependencies and Kanban

## UC-013: Manage story dependencies
**Actor(s)**: User
**Trigger**: User edits dependencies in the story view, or drags a "depends on" connector between cards on the board.
**Preconditions**: Stories exist.
**Main Success Flow**:
1. User adds a blocking (`depends_on`) or related (`related_to`) dependency to another story.
2. System validates: target exists, no self-reference, no cycle in the blocking graph.
3. System writes the dependency to the story front-matter and updates badges/highlighting.
**Alternative Flows**:
- 2a. Cycle: refused with the cycle path (e.g. US-001 → US-003 → US-001).
- 3a. Story is queued or running: change applies to queue evaluation immediately; adding a blocking dependency to a *running* story only shows a warning (the run is not stopped).
**Postconditions**: Dependency graph updated.
**Related Requirements**: FR-062, FR-063, FR-064

## UC-014: Prioritise and approve stories for implementation
**Actor(s)**: User
**Trigger**: User works on the Kanban board.
**Preconditions**: Stories in Backlog.
**Main Success Flow**:
1. User orders cards in Backlog and Ready.
2. User moves a story Backlog → Ready (requires story file Approved — artifact approval; there is no separate story approval).
3. System updates front-matter `status: ready`.
**Alternative Flows**:
- 2a. Story not Approved: move refused with "Approve the story first" and a shortcut.
- 2b. Story flagged *Potentially impacted*: warning; user confirms.
**Related Requirements**: FR-019, FR-020, FR-021

## UC-015: Start implementation (move to In Progress)
**Actor(s)**: User, Scheduler
**Trigger**: User moves a Ready story to In Progress.
**Preconditions**: Story in Ready; agent runtime configured.
**Main Success Flow**:
1. System records the human authorisation (user, timestamp) and sets `status: in_progress`.
2. System evaluates start conditions (via the Scheduler): all blocking predecessors *Done*, free run slot (limit, D10/D12), in non-git mode no write-capable chat/spec run active, no conflict in stacked base.
3. All satisfied: system prepares the execution workspace (UC-016) and starts the run (UC-017).
**Alternative Flows**:
- 2a. Open blocking predecessor(s): story enters *Queued* with reason "Waiting for US-x (state)" (UC-018).
- 2b. Predecessor in Backlog/Ready (not progressing): warning before queuing "US-x is not in progress — US-y would wait indefinitely"; user confirms or cancels.
- 2c. No free slot: story *Queued* with "Waiting for run slot (3/3)".
- 2d. Non-git mode: confirmation dialog with isolation warning (FR-039) before start.
- 2e. Non-git mode with an active chat or specification run that may write: story *Queued* with "Waiting for workspace" until that run ends (FR-116b).
- 2f. Git mode with uncommitted changes in the main working copy: warning "Your uncommitted changes are not part of this run's base"; user continues or cancels (FR-116c).
**Postconditions**: Story running or queued.
**Related Requirements**: FR-021, FR-022, FR-027, FR-039, FR-065, FR-116

## UC-016: Prepare execution workspace
**Actor(s)**: Scheduler
**Trigger**: A run is about to start.
**Main Success Flow (git mode)**:
1. System determines base: if every blocking predecessor is merged into the base branch (merge detection, UC-049) (or there are none) → base branch; else → predecessor branch (single) or a temporary integration merge of predecessor branches (several).
2. System creates branch `specforge/<story-id>[-n]` and a worktree in the configured worktree location.
3. System records base commit, stacked-on branches, branch and worktree path in the run.
**Alternative Flows**:
- 1a. Merge of several predecessor branches conflicts: abort, story *Blocked (conflict)*; pending decision created (FR-067). After resolving (e.g. merging predecessors) the user clicks *Re-check* → story re-queued (`ConflictResolved`), or removes it from the queue (→ Ready).
- 2a. Retry with "reuse branch": existing branch checked out in a new worktree.
- Non-git mode: system snapshots the workspace (respecting exclusions) and records the snapshot ID.
**Postconditions**: Isolated workspace ready.
**Related Requirements**: FR-038, FR-039, FR-053, FR-067, FR-115

## UC-017: Execute story run
**Actor(s)**: Agent, Scheduler, User (observer)
**Trigger**: Workspace prepared.
**Main Success Flow**:
1. System assembles the context: story, acceptance criteria, linked requirements/design/ADRs, epic context (goal, epic acceptance criteria, sibling stories with status/summaries — FR-099), project instructions, dependency context (predecessors' summaries and changed files; related and concurrently running stories with files touched), scope instruction, result schema (FR-037, FR-068).
2. System launches the agent via the adapter in the worktree; run status *Running*.
3. Events are streamed, persisted and displayed live (UC-019).
4. Permission requests are relayed (UC-020); writes to `spec/**` and `.specforge/**` are denied by a built-in rule, so story status, approval, epic and dependencies stay in the main workspace (FR-116a).
5. Agent finishes and emits the structured result; system validates it.
6. System computes changed files (diff vs. base commit / snapshot), stores the result, and moves the story to *Review*; notification "US-x ready for review".
**Alternative Flows**:
- 4a. Time awaiting a permission decision pauses both the idle and the max-duration timeout (FR-042).
- 5a. No/invalid structured result: run *Completed – result unavailable*; story still moves to Review.
- 5b. Agent exits with error / timeout / crash: run *Failed* with reason; story stays In Progress marked Failed (UC-023).
- 5c. Agent's result contains dependency recommendations: shown as suggestions (UC-013 shortcut).
- 6a. (Release 2) Overlap with files changed by another active/unmerged story: both flagged (FR-070).
**Postconditions**: Story in Review (or Failed).
**Related Requirements**: FR-022, FR-024, FR-028, FR-029, FR-030, FR-036, FR-037, FR-040, FR-042, FR-068, FR-070, FR-099, FR-116

## UC-018: Queue and auto-start
**Actor(s)**: Scheduler
**Trigger**: Any event that may unblock queued stories: a story approved (Done), a run finishes/cancels/fails/is interrupted (slot freed), a dependency removed, concurrency limit raised, conflict resolved (user *Re-check*), a write-capable chat/spec run ended (non-git), a correction, retry or resume requested.
**Preconditions**: Queued stories exist.
**Main Success Flow**:
1. Scheduler evaluates queued entries: corrections and resumes first, then FIFO order of human authorisation.
2. For each whose start conditions hold and while slots are free: start (UC-016, UC-017), logging the trigger.
**Alternative Flows**:
- 1a. Predecessor rejected/cancelled: dependents remain queued; notification to user (A11).
- User removes story from queue → back to Ready (FR-065).
**Postconditions**: Queue advanced; limit never exceeded.
**Related Requirements**: FR-065, FR-066

## UC-019: Monitor runs
**Actor(s)**: User
**Trigger**: User opens Agent executions, or clicks a running card.
**Main Success Flow**:
1. System shows all active and queued runs (story, status, elapsed time, pending permissions, files touched).
2. User selects a run to see its live stream, or tiles several side by side.
3. User searches the log, opens touched files.
**Related Requirements**: FR-031, FR-069, FR-056

## UC-020: Decide on a permission request
**Actor(s)**: Agent, User
**Trigger**: A running agent requests permission for a tool action.
**Preconditions**: Run active.
**Main Success Flow**:
1. Adapter receives the request; system evaluates project approval rules (FR-051) and confinement rules (NFR-008).
2. No rule matches: run status *Awaiting approval*; system creates a pending decision, shows a prompt (story, run, tool, arguments, working dir, *outside workspace* flag) and an OS notification if unfocused.
3. User chooses Allow, Deny (optionally with message to the agent), or "Always allow for this project".
4. System returns the decision to the agent, logs it (decider, time), and resumes the run.
**Alternative Flows**:
- 1a. Allow/deny rule matches (and action is inside workspace): auto-decided, logged as "by rule".
- 3a. User dismisses / app is closing: treated as Deny (NFR-007); there is no prompt timeout, and waiting time pauses the run timeouts (FR-042).
- Multiple runs: requests are queued per run and shown as separate labelled entries.
**Postconditions**: Decision recorded; run continues.
**Related Requirements**: FR-032, FR-033, FR-051, NFR-007, NFR-008, NFR-012

## UC-021: Cancel run
**Actor(s)**: User
**Trigger**: User clicks Cancel on a running or awaiting-approval run.
**Main Success Flow**:
1. System asks for confirmation.
2. System aborts the agent and kills its process tree; run *Cancelled*; logs kept.
3. Story → Ready; worktree retained (cleanup offered); slot freed → UC-018. If the story was queued or blocked, *Remove from queue* has the same effect without a run to abort.
**Related Requirements**: FR-034, FR-069

## UC-022: Review implementation
**Actor(s)**: User
**Trigger**: User opens a story in Review.
**Preconditions**: Run completed.
**Main Success Flow**:
1. System shows the result summary, test counts, coverage, open issues, overlap warnings, permission log, and the changed-file list with diffs (only the story's own changes, FR-043).
2. User chooses one of:
   - **Approve** → story *Done*; system shows branch, base branch and merge order (predecessors first); triggers UC-018.
   - **Request corrections** → user enters feedback (pre-filled if feature in-flight feedback is pending, UC-046); story → In Progress; system emits `CorrectionRequested` to the Scheduler, which resumes the same agent session in the same worktree with the feedback via the RunLauncher (priority *correction*; queued ahead of normal stories if no slot); on completion → Review again.
   - **Reject** → user enters optional reason; story → Ready; branch marked *rejected* (git) or snapshot restore offered (non-git).
**Alternative Flows**:
- 2a. Request corrections when the session can no longer be resumed (session expired): system offers a fresh run on the same branch with feedback + previous summary as context.
- 2b. Approve with *Potentially impacted* flag: warning; user confirms.
**Postconditions**: Story Done / In Progress / Ready.
**Related Requirements**: FR-025, FR-027, FR-043, FR-044, FR-045, FR-046, FR-047, FR-055

## UC-023: Retry / resume failed or interrupted run
**Actor(s)**: User
**Trigger**: User selects Retry or Resume on a Failed / Interrupted / Cancelled / Rejected story.
**Main Success Flow**:
1. *Retry*: user chooses "fresh branch from base" or "reuse existing branch" (git); system posts `RetryRequested` to the Scheduler, which creates the new run when a slot is free (UC-018, UC-016, UC-017).
2. *Resume*: system posts `ResumeRequested` to the Scheduler (priority *correction*), which resumes the agent session of the last run in its worktree with a "continue" prompt.
3. *Discard*: run closed, story → Ready.
**Related Requirements**: FR-026, FR-027, FR-035, FR-041

## UC-024: Recover after close or crash
**Actor(s)**: User, System
**Trigger**: (a) User closes SpecForge while runs are active; (b) SpecForge starts after a crash.
**Main Success Flow (a)**:
1. System shows a dialog listing active runs and queued stories.
2. On confirm, system terminates agent process trees, marks runs *Interrupted*, persists state, and exits. Queued stories remain queued.
**Main Success Flow (b)**:
1. On startup, system finds runs in an active state and marks them *Interrupted*; their persisted logs are complete except for at most the last 1 s before the crash (FR-040).
2. System kills any orphaned agent processes recorded in the process registry.
3. User is notified and can Retry / Resume / Discard each (UC-023).
**Related Requirements**: FR-040, FR-041, NFR-015

---

## D. Configuration

## UC-025: Configure agent runtime
**Actor(s)**: User
**Trigger**: Setup wizard step 1–2 (UC-028), or Settings → Agent runtimes.
**Main Success Flow**:
1. System auto-detects the Claude Code executable (PATH and per-OS common locations) and shows path + version.
2. User accepts or overrides the path; system verifies (version check, minimum version).
3. User sets defaults: model, effort/parameters, permission defaults, environment variables (secret values stored in OS credential store), timeouts.
4. (Release 2) System shows the execution-boundary notice for the runtime (FR-057).
**Alternative Flows**:
- 1a. Not found: instructions and link to install; "Browse…" for manual path.
- 2a. Unsupported version: warning with minimum version.
**Related Requirements**: FR-048, FR-049, FR-057, NFR-006

## UC-026: Configure project settings
**Actor(s)**: User
**Trigger**: Settings → Project.
**Main Success Flow**:
1. User edits project instructions and conventions.
2. User sets base branch, branch pattern, worktree location, snapshot exclusions.
3. User sets concurrency limit (fixed 1 in non-git), timeouts, log retention/verbosity.
4. User manages approval rules (allow/deny patterns).
5. User overrides agent settings per project.
**Related Requirements**: FR-027, FR-049, FR-050, FR-051, FR-052, FR-053

## UC-027: Handle pending decisions
**Actor(s)**: User
**Trigger**: User opens the pending-decisions panel (always-visible counter).
**Main Success Flow**:
1. System lists, grouped by story/run: permission requests, stories in Review, failed/interrupted runs, blocked queue items (conflicts), agent recommendations, impacted artifacts.
2. User acts on an item, which opens the corresponding screen/dialog.
**Related Requirements**: FR-033, FR-056, FR-023

---

## E. User workflow: setup, start, guided phases, dashboard, chat

## UC-028: First-start setup
**Actor(s)**: User
**Trigger**: SpecForge starts and no completed setup is recorded; or user opens Settings → Run setup.
**Preconditions**: —
**Main Success Flow**:
1. System shows the setup wizard with steps and their status.
2. **Agent runtime**: system detects Claude Code (PATH, per-OS locations), shows path + version; user confirms or browses (UC-025).
3. **AI provider**: user enters an API key or selects a cloud provider configuration; system stores secrets in the OS credential store and runs a short connection test run.
4. **Git**: system detects Git and version; shows "optional — required for parallel runs".
5. **Default approval rules**: system lists suggested rules (edit files inside run workspace, read-only tools, detected test/build commands); user enables the desired ones, may add own rules; none enabled by default.
6. **Execution defaults**: parallel runs (3), timeouts, notifications, log retention.
7. **Summary & health check**: all checks re-run; user clicks *Finish*; system records setup as complete and opens the start wizard (UC-029).
**Alternative Flows**:
- 2a. Claude Code not found: install instructions and *Re-check*; user may *Skip*.
- 3a. Connection test fails: error from the run shown (e.g. invalid key); user corrects or *Skip*.
- Any step: *Skip setup* → system records setup as incomplete, enters limited mode (UC-038), opens the start wizard.
**Postconditions**: Global settings and default rules stored; setup state = complete or incomplete.
**Related Requirements**: FR-073, FR-074, FR-075, FR-048, FR-049, FR-051, ADR-007

## UC-029: Start wizard
**Actor(s)**: User
**Trigger**: No project is open (after setup, at start without last project, after *Close project*).
**Main Success Flow**:
1. System shows *Open existing project*, *Create new project*, *Adopt existing code folder*, and recent projects with phase.
2. User selects an option.
   - **A – Open existing**: user picks a folder; if `.specforge/project.yaml` exists, system registers/opens it (UC-002) and shows its dashboard (UC-034).
   - **B – Create new**: user enters project name, parent location, folder name (pre-filled), Git checkbox (on); system creates folder, `git init`, SpecForge structure and initial commit, registers the project and opens the guided process at Intent (UC-031).
   - **C – Adopt existing code** (Release 2): see UC-030.
   - **Recent**: opens the project on its dashboard.
**Alternative Flows**:
- A-1a. Folder has no SpecForge metadata: system offers *Adopt this folder* (→ C) or, if empty, *Create new project here* (→ B).
- B-1a. Folder exists and is not empty: error; user chooses another name.
- B-1b. Git not installed: checkbox disabled with explanation; project created in non-git mode.
- Recent project path missing: *Locate* / *Remove from list*.
**Postconditions**: A project is open.
**Related Requirements**: FR-076, FR-077, FR-078, FR-001, FR-002, FR-004

## UC-030: Brownfield onboarding (Release 2)
**Actor(s)**: User, Agent
**Trigger**: User chooses *Adopt existing code folder*.
**Preconditions**: Folder contains files, no SpecForge metadata.
**Main Success Flow**:
1. System registers the project, creates `.specforge/` and `spec/` (offers `git init` + initial commit if no Git).
2. System asks "Analyse the codebase now?"; user confirms.
3. System starts an `analyze` specification run (read-only: write requests are denied by policy except into `spec/`).
4. Agent produces: current-state summary, draft intent (as-is + "Desired change" section to complete), draft current-state requirements and design.
5. System validates and shows the drafts as a diff; user keeps or discards.
6. System opens the guided process at Intent with the drafts (UC-031).
**Alternative Flows**:
- 2a. User declines: guided process starts with an empty intent.
- 3a. Large codebase: agent summarises top-level structure first; user may limit analysis to folders.
**Postconditions**: Draft current-state artifacts exist; no source files modified.
**Related Requirements**: FR-079, FR-007, FR-008, ADR-014

## UC-031: Guided phase process
**Actor(s)**: User, Agent
**Trigger**: New project created, or user clicks a phase in the stepper.
**Main Success Flow**:
1. System shows the stepper Intent → Requirements → Design → User stories → Kanban with derived status per phase and highlights the recommended phase.
2. User opens a phase; the phase screen shows the loop: *Write/Generate* → *Quality check* → *Review & refine* → *Approve* with the current step highlighted (UC-032, UC-033, UC-006, UC-007, UC-008).
3. User approves the phase's artifacts; system marks the phase approved and recommends the next phase.
4. After stories are approved, the *Kanban* step opens the board with the stories in Backlog; the plan view (UC-036, Release 2) is offered.
**Alternative Flows**:
- 2a. Phase inputs not approved: warning "Requirements are still Draft — continue anyway?" (soft gate); user confirms or returns.
- 3a. User reopens an earlier phase and changes an approved artifact: later phases show *Potentially impacted* (UC-010).
- Limited mode: *Generate* and *Quality check* disabled; manual writing and approval possible.
**Postconditions**: Phase statuses reflect artifact states.
**Related Requirements**: FR-080, FR-081, FR-013, FR-017

## UC-032: Run AI quality check
**Actor(s)**: User, Agent
**Trigger**: User clicks *Quality check* on an artifact or phase.
**Main Success Flow**:
1. System starts a `quality_check` specification run with the artifact, its inputs and the phase-specific criteria.
2. Agent returns findings (severity, location, explanation, suggested fix) and clarification questions in the structured result.
3. System lists findings grouped by severity next to the document; clicking one scrolls to the location.
4. For each finding user chooses *Apply fix* (→ proposal diff, accept/discard), *Dismiss* (with optional reason) or *Ask* (opens a chat thread with the finding as context).
5. Clarification questions are answered as in UC-005.
**Postconditions**: Findings stored with state (open/applied/dismissed); artifact Draft if fixes applied.
**Related Requirements**: FR-082, FR-006, FR-014

## UC-033: Decision review (Release 2)
**Actor(s)**: User, Agent
**Trigger**: User clicks *Review decisions* (dashboard, phase screen or pending decisions).
**Main Success Flow**:
1. System collects open items: open questions, assumptions to confirm, proposed ADRs, open agent recommendations.
2. For items without options, system runs an agent step to propose options with a recommendation and trade-offs.
3. System presents items one by one: context, options (recommended first), *Accept recommended* / *Choose alternative* / *Own answer* / *Defer*.
4. After the last item, system shows a summary and the proposed artifact changes (ADR statuses, decision tables, assumption resolutions) as a diff; user accepts.
**Alternative Flows**:
- 3a. User stops midway: decided items are kept, remaining stay open.
**Postconditions**: Decisions recorded in artifacts with date.
**Related Requirements**: FR-083

## UC-034: View project dashboard
**Actor(s)**: User
**Trigger**: User opens a project or clicks *Dashboard*.
**Main Success Flow**:
1. System shows: phase stepper, recommended next step with action button, story statistics per state, progress, approved-but-unmerged branches (UC-049), active/queued runs, pending decisions, epics widget (status, progress, *Review epic*; FR-101), active features widget with mini steppers and next steps (Release 2, FR-113), idea inbox counter (Release 2, FR-113), usage & cost (Release 2), recent activity, artifact list per phase with states (incl. epics), Kanban link, chat panel.
2. User clicks the next-step button → system navigates to the corresponding screen/action.
3. User clicks an artifact → artifact viewer; Kanban link → board; an epic → board filtered to its lane; a feature card → its current phase (Release 2).
**Alternative Flows**:
- 1a. No stories: Kanban link disabled with hint and shortcut to the User stories phase.
- 1b. Limited mode: banner "Complete setup to enable AI" with action.
**Related Requirements**: FR-033, FR-054, FR-085, FR-086, FR-087, FR-088, FR-090, FR-101, FR-113

## UC-035: Chat with the project agent
**Actor(s)**: User, Agent
**Trigger**: User types in the dashboard chat panel or opens a chat thread.
**Preconditions**: Setup complete (not limited mode).
**Main Success Flow**:
1. User selects an existing thread or creates a new one.
2. User sends a message; system starts or resumes the thread's agent session (`chat` run) in the main workspace with project context.
3. Agent answers, streaming into the thread; tool use is shown collapsed.
4. Release 1: the chat is read-only — write requests are denied by policy with an explanation shown inline (FR-089). From Release 2 (FR-091): if the agent wants to write a file or run a command, the permission relay applies (UC-020); prompts appear inline in the thread and in pending decisions.
5. (Release 2) Files changed by this message are listed under the answer with diffs and *Revert*.
6. (Release 2) Spec files changed → Draft + impact flags; code changes → activity "Chat change outside Kanban flow".
**Alternative Flows**:
- 2a. (Release 2) Non-git workspace with an active implementation run: write requests are refused automatically with explanation; while a write-capable chat run is active, implementation starts wait with "Waiting for workspace" (FR-116b).
- 3a. Agent proposes a story transition or run start: shown as recommendation card (never executed).
- 4a. (Release 2) Write to a file touched by an active run's branch: prompt shows *Overlap with US-x*.
- 5a. (Release 2) User clicks *Revert*: system restores the file(s) (git: previous content; non-git: pre-message snapshot) and records the revert.
**Postconditions**: Thread persisted; changes tracked.
**Related Requirements**: FR-089, FR-091, FR-092, FR-023, FR-032, FR-116, NFR-031

## UC-036: Plan implementation waves (Release 2)
**Actor(s)**: User
**Trigger**: User opens *Plan* (Kanban step of the stepper, board toolbar or dashboard).
**Preconditions**: Stories exist.
**Main Success Flow**:
1. System computes waves (topological levels of the blocking graph, split by concurrency limit) and the critical path.
2. System shows the graph with waves as columns, critical path highlighted, sizes per wave.
3. User selects a wave and *Start wave*; system moves its Ready stories to In Progress (each move recorded as human authorisation; non-Ready stories listed as skipped).
**Alternative Flows**:
- 3a. With *group by epic* enabled, user selects an epic and *Start epic* (FR-098): same as UC-041 step 5.
**Related Requirements**: FR-084, FR-022, FR-064, FR-098

## UC-037: Review usage and cost (Release 2)
**Actor(s)**: User
**Trigger**: User opens the usage widget on the dashboard or a run's details.
**Main Success Flow**:
1. System shows totals per project, per phase and per run, as reported by the runtime, with time filter.
**Related Requirements**: FR-090

## UC-038: Work in limited mode
**Actor(s)**: User
**Trigger**: Setup incomplete or runtime/provider check fails.
**Main Success Flow**:
1. System shows a persistent banner "AI functions disabled — complete setup".
2. All AI actions (generate, quality check, refine, chat, implementation start) are disabled with tooltip; manual editing, approval, dependencies and board planning work.
3. User clicks the banner → setup wizard opens at the first incomplete step (UC-028).
**Related Requirements**: FR-074, FR-075

## UC-039: Commit specification changes
**Actor(s)**: User
**Trigger**: User clicks the "n spec files changed" indicator → *Commit spec changes* (git mode).
**Main Success Flow**:
1. System lists uncommitted changes under `spec/` and `.specforge/` with diffs and a generated commit message (e.g. "specforge: approve requirements; move US-003 to Ready").
2. User edits the message if wanted and confirms.
3. System commits only those paths on the current branch of the main workspace (FR-116a).
**Alternative Flows**:
- 3a. Git hooks fail: error output shown; nothing committed.
**Related Requirements**: FR-072, FR-116

---

## F. Epics, features and branches

## UC-040: Generate and manage epics
**Actor(s)**: User, Agent
**Trigger**: User enters the User stories phase and clicks *Generate epics*, or creates an epic manually.
**Preconditions**: Requirements and design exist (soft gate if Draft).
**Main Success Flow**:
1. System starts a `generate` specification run (target: epics) with requirements and design.
2. Agent proposes epics (goal, value, linked requirements, acceptance criteria, rationale) as files under `spec/04_user_stories/epics/`.
3. System validates (unique IDs, requirement links, every Must-have requirement covered by ≥ 1 epic — uncovered ones reported) and shows the epic list with a coverage matrix.
4. User edits, merges, splits, reorders or deletes epics, optionally runs the quality check, and approves the epic structure.
5. User clicks *Generate stories* for all or selected approved epics; system runs story generation per epic (UC-006) with the epic as context; every story gets `epic: EP-xxx`.
**Alternative Flows**:
- 1a. Manual: user creates an epic from a template; assigns existing stories via the story drawer or by dragging cards into the epic's lane (UC-041).
- 4a. Deleting an epic with stories: stories move to *No epic* after confirmation.
**Postconditions**: Approved epics; stories linked to epics.
**Related Requirements**: FR-093, FR-094, FR-082, FR-010

## UC-041: Work with epics on the board
**Actor(s)**: User
**Trigger**: User opens the Kanban board with epics present.
**Main Success Flow**:
1. System shows the board *by epic*: one swimlane per epic (header: ID, title, derived status, progress, counts, derived epic dependencies (Release 2)) plus *No epic*.
2. User collapses/expands lanes, filters by epic, or toggles to the flat view (cards keep an epic colour tag).
3. User moves cards between columns (normal transition rules, UC-014/UC-015).
4. User drags a card into another lane → confirmation → story's `epic` changes.
5. (Release 2) User clicks *Start epic* in a lane header → confirmation lists Ready stories (and skipped ones) → each is moved to In Progress as a human authorisation (started or queued).
**Related Requirements**: FR-095, FR-096, FR-097, FR-098, FR-021, FR-022, FR-065

## UC-042: Epic review (Release 2)
**Actor(s)**: User, Agent
**Trigger**: All stories of an epic are Done → epic status *Ready for epic review* (pending decision).
**Main Success Flow**:
1. User opens the epic review.
2. System shows stories with review outcomes, combined changes (per-story diffs grouped, union of changed files), and the epic acceptance criteria as a checklist.
3. User optionally runs *AI completeness check*: system starts a `quality_check` run (target: epic) with epic criteria and combined changes; agent reports covered criteria and gaps.
4. User ticks the checklist and clicks *Confirm epic Done*.
**Alternative Flows**:
- 4a. *Add follow-up stories*: user (or a gap's *Create story* action) creates stories in the epic (Backlog, Draft); epic returns to *In progress*. The same applies to stories added after the review was confirmed or skipped: the stored review outcome is cleared.
- 4b. *Skip review*: epic becomes Done without review record.
**Postconditions**: Epic Done (later *Merged* once all branches are merged) or back In progress.
**Related Requirements**: FR-100, FR-095, FR-033

## UC-043: Add a feature (feature wizard) (Release 2)
**Actor(s)**: User, Agent
**Trigger**: User clicks *＋ Add feature* (dashboard header, Intent area, command palette/shortcut), *Turn into feature* (idea inbox) or accepts the chat's suggestion.
**Preconditions**: Main intent approved; not in limited mode (otherwise the wizard works without AI steps: describe → save).
**Main Success Flow**:
1. **Describe**: user enters the idea and optional motivation, target users, priority, related epic/area.
2. **AI review**: system starts a `feature_review` run with the idea, main intent, requirement/epic index and ADR titles; agent returns an enhanced draft (problem, goal, scope in/out, success criteria, constraints, assumptions), overlaps, conflicts and questions.
3. **Clarify**: user answers questions, accepts/rejects suggestions; each round resumes the session and updates the draft (live preview).
4. **Save**: system writes `spec/01_intent/FI-xxx-<slug>.md` (Draft) with clarified decisions; user clicks *Approve* (or *Save as draft*).
5. System shows the feature's stepper with *Continue to impact analysis*.
**Alternative Flows**:
- 2a. Agent finds the idea already covered by FR-x / EP-y: shown prominently; user may *Withdraw*, *Merge into FI-z* or continue.
- 2b. Conflict with an ADR or requirement: shown with the conflicting element; becomes a decision item (UC-033).
- Any step: *Close* keeps the wizard draft; reopening resumes at the same step.
- Later: *Withdraw* (terminal): open change sets discarded, applied delta changes kept (user may deprecate manually), linked not-started stories flagged for keep/delete.
**Postconditions**: Feature intent saved (Draft or Approved); idea (if any) linked.
**Related Requirements**: FR-102, FR-103, FR-104, FR-111

## UC-044: Analyse feature impact (Release 2)
**Actor(s)**: User, Agent
**Trigger**: User clicks *Continue to impact analysis* / *Impact* in the feature stepper.
**Preconditions**: Feature intent approved (soft gate).
**Main Success Flow**:
1. System computes the trace-based impact immediately (related epics/requirements → downstream elements, stories, runs, files) and shows it.
2. System starts an `impact` run in parallel; agent reads specs and code and adds/qualifies items with reasons and confidence.
3. System shows the categorised impact list: requirements (change/deprecate/add), design/ADRs, epics (extend/new), not-started stories, in-flight stories, Done stories (rework candidates), code areas.
4. User confirms, removes or adds items and approves the impact list.
**Postconditions**: Confirmed impact list scopes the delta phases.
**Related Requirements**: FR-106

## UC-045: Deliver a feature through delta phases (Release 2)
**Actor(s)**: User, Agent
**Trigger**: Impact list approved.
**Main Success Flow**:
1. **Requirements (delta)**: system runs delta generation scoped to the impact list; change set (new / modified / deprecated) shown grouped by file; user accepts/discards per change; quality check; approve.
2. **Design (delta)**: same for design elements and ADRs (new ADRs as Proposed → decision review).
3. **Epic & stories**: agent proposes new epic (default) or extension of existing epics; user approves; stories generated incl. adjustments to not-started stories (diffs) and rework stories for Done stories (`reworks:`); dependencies validated.
4. Before applying any change affecting queued/running/in-review stories, the in-flight protection dialog (UC-046) requires per-story decisions.
5. Stories appear in the epic lane on the Kanban; normal delivery (BP-02) incl. epic review.
6. When all stories linked to the feature (`feature: FI-xxx`) are Done, feature intent → *Done*; system offers a spec baseline (UC-048).
**Related Requirements**: FR-104, FR-105, FR-107, FR-108, FR-109, FR-110, FR-112

## UC-046: Decide on in-flight impact (Release 2)
**Actor(s)**: User
**Trigger**: Accepting a change set that touches queued, running or in-review stories.
**Main Success Flow**:
1. System lists the affected stories with state and the relevant changes.
2. User decides per story: *Continue unchanged* (flag potentially impacted) / *Cancel or dequeue* (→ Ready) / *Apply in corrections* (Review: correction feedback pre-filled, user confirms *Request corrections*; Running: feedback stored as pending and pre-filled into *Request corrections* when the story reaches Review — no system-initiated correction).
3. System applies the change set and the decisions, recording them on story and feature intent.
**Alternative Flows**:
- 2a. User cancels the dialog: change set not applied.
**Related Requirements**: FR-110, FR-045, FR-034

## UC-047: Capture and triage ideas (Release 2)
**Actor(s)**: User
**Trigger**: *Capture idea* (Add feature menu, inbox widget, chat, shortcut).
**Main Success Flow**:
1. User types a one-liner (optional note) → system appends it to `spec/01_intent/ideas.md` with date and source.
2. Later, in the inbox, user chooses per idea: *Turn into feature* (UC-043 pre-filled), *Merge into FI-x*, or *Dismiss* (reason).
**Related Requirements**: FR-111

## UC-048: Create a spec baseline (Release 2)
**Actor(s)**: User
**Trigger**: Feature intent becomes Done (offer) or user clicks *Create baseline*.
**Preconditions**: Git mode.
**Main Success Flow**:
1. If spec changes are uncommitted, system offers *Commit spec changes* (UC-039).
2. System proposes a tag name (next `spec-vX.Y`) and notes (included feature intents and epics).
3. User confirms; system creates an annotated tag on the base-branch commit.
**Related Requirements**: FR-112, FR-015, FR-072

## UC-049: Detect merged branches
**Actor(s)**: System, User
**Trigger**: Project opened, window focused, a git operation performed by SpecForge finished, periodic check (default every 60 s), or user clicks *Refresh*.
**Preconditions**: Git mode; approved stories with branches not yet detected as merged.
**Main Success Flow**:
1. System checks each such branch with `git merge-base --is-ancestor <branch> <base>`.
2. For each merged branch, system sets the story's `mergedAt`; the card shows *Merged*; the "merged" count and the "Merge n approved branches" next step update.
3. If all stories of a Done epic are merged, the epic shows *Merged*.
4. Queued or later stories whose predecessor is now merged are based on the base branch instead of the predecessor branch (UC-016).
**Alternative Flows**:
- 1a. Git fails (e.g. branch deleted, repository locked): check skipped for that branch, logged; last known state kept; retried on the next trigger.
**Postconditions**: Merge state of approved stories is current (SpecForge never merges itself).
**Related Requirements**: FR-115, FR-067, FR-086, FR-095

---

## Coverage matrix (FR → UC)

Generated from each use case's *Related Requirements*.

| FR | UC | FR | UC | FR | UC |
|---|---|---|---|---|---|
| FR-001 | UC-001, UC-029 | FR-040 | UC-017, UC-024 | FR-079 | UC-030 |
| FR-002 | UC-002, UC-029 | FR-041 | UC-002, UC-023, UC-024 | FR-080 | UC-031 |
| FR-003 | UC-003 | FR-042 | UC-017 | FR-081 | UC-031 |
| FR-004 | UC-001, UC-002, UC-029 | FR-043 | UC-022 | FR-082 | UC-032, UC-040 |
| FR-005 | UC-004 | FR-044 | UC-022 | FR-083 | UC-033 |
| FR-006 | UC-005, UC-032 | FR-045 | UC-022, UC-046 | FR-084 | UC-036 |
| FR-007 | UC-006, UC-030 | FR-046 | UC-022 | FR-085 | UC-034 |
| FR-008 | UC-006, UC-030 | FR-047 | UC-022 | FR-086 | UC-034, UC-049 |
| FR-009 | UC-006 | FR-048 | UC-025, UC-028 | FR-087 | UC-034 |
| FR-010 | UC-006, UC-040 | FR-049 | UC-025, UC-026, UC-028 | FR-088 | UC-034 |
| FR-011 | UC-006 | FR-050 | UC-026 | FR-089 | UC-035 |
| FR-012 | UC-004, UC-007 | FR-051 | UC-020, UC-026, UC-028 | FR-090 | UC-034, UC-037 |
| FR-013 | UC-004, UC-006, UC-007, UC-031 | FR-052 | UC-026 | FR-091 | UC-035 |
| FR-014 | UC-005, UC-008, UC-032 | FR-053 | UC-016, UC-026 | FR-092 | UC-035 |
| FR-015 | UC-011, UC-048 | FR-054 | UC-034, user_flows UF-00 | FR-093 | UC-040 |
| FR-016 | UC-006, UC-009 | FR-055 | UC-009, UC-022 | FR-094 | UC-040 |
| FR-017 | UC-008, UC-010, UC-031 | FR-056 | UC-019, UC-027 | FR-095 | UC-041, UC-042, UC-049 |
| FR-018 | UC-002, UC-004, UC-012 | FR-057 | UC-025 | FR-096 | UC-041 |
| FR-019 | UC-014 | FR-058 | UC-001, (install: technical) | FR-097 | UC-041 |
| FR-020 | UC-012, UC-014 | FR-059 | — (Later) | FR-098 | UC-036, UC-041 |
| FR-021 | UC-014, UC-015, UC-041 | FR-060 | — (Later) | FR-099 | UC-017 |
| FR-022 | UC-015, UC-017, UC-036, UC-041 | FR-061 | — (Later) | FR-100 | UC-042 |
| FR-023 | UC-012, UC-027, UC-035 | FR-062 | UC-013 | FR-101 | UC-034 |
| FR-024 | UC-017 | FR-063 | UC-006, UC-013 | FR-102 | UC-043 |
| FR-025 | UC-022 | FR-064 | UC-013, UC-036 | FR-103 | UC-043 |
| FR-026 | UC-023 | FR-065 | UC-015, UC-018, UC-041 | FR-104 | UC-043, UC-045 |
| FR-027 | UC-001, UC-015, UC-022, UC-023, UC-026 | FR-066 | UC-018 | FR-105 | UC-045 |
| FR-028 | UC-005, UC-017 | FR-067 | UC-016, UC-049 | FR-106 | UC-044 |
| FR-029 | UC-017 | FR-068 | UC-017 | FR-107 | UC-045 |
| FR-030 | UC-017 | FR-069 | UC-019, UC-021 | FR-108 | UC-045 |
| FR-031 | UC-019 | FR-070 | UC-017 | FR-109 | UC-045 |
| FR-032 | UC-005, UC-020, UC-035 | FR-071 | UC-010 | FR-110 | UC-045, UC-046 |
| FR-033 | UC-020, UC-027, UC-034, UC-042 | FR-072 | UC-039, UC-048 | FR-111 | UC-043, UC-047 |
| FR-034 | UC-021, UC-046 | FR-073 | UC-028 | FR-112 | UC-045, UC-048 |
| FR-035 | UC-023 | FR-074 | UC-028, UC-038 | FR-113 | UC-034 |
| FR-036 | UC-017 | FR-075 | UC-028, UC-038, UF-08 | FR-114 | UC-004 |
| FR-037 | UC-017 | FR-076 | UC-029 | FR-115 | UC-016, UC-049 |
| FR-038 | UC-016 | FR-077 | UC-029 | FR-116 | UC-012, UC-015, UC-017, UC-035, UC-039 |
| FR-039 | UC-015, UC-016 | FR-078 | UC-029 |  |  |
