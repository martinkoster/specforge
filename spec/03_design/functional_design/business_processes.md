# SpecForge — Business Processes

**Last updated:** 2026-10-14

Roles: **[User]** human operator · **[SpecForge]** the application (incl. Scheduler) · **[Agent]** coding-agent run · **[Git/FS]** workspace and Git.

---

## BP-01: Specification lifecycle (Intent → approved stories)

**Purpose**: Turn a natural-language objective into approved, implementable stories with dependencies.  
**Trigger**: User creates or changes an intent; new projects enter this process automatically (BP-04) and are guided by the phase stepper (soft gates, D15).

Each phase (intent, requirements, design, stories) follows the same loop: **write/generate → AI quality check → review & refine (incl. decision review for open items) → approve**. The steps below show the loop per phase.

1. [User] Writes or edits the intent and saves it.
2. [User] Runs the AI quality check / intent analysis (recommended by the stepper).
3. [SpecForge] Starts a `clarify` specification run.
4. [Agent] Returns questions, ambiguities, alternatives, assumptions.
5. [User] Answers. If the agent reports further questions then goto 4, else goto 6.
6. [SpecForge] Proposes the clarified-decisions section as a diff → [User] accepts or discards → [User] approves the intent.
7. [User] Requests requirements generation. If the intent is not Approved then [SpecForge] warns; [User] confirms or goto 6.
8. [Agent] Produces requirements files → [SpecForge] validates format, indexes IDs, marks Draft, shows diff.
9. [User] Reviews; if changes needed then refines manually or via AI (goto 8 for AI refinement), else approves.
10. [User] Requests design generation → [Agent] produces design + ADRs → [SpecForge] validates/indexes → [User] reviews/refines/approves (same loop as 8–9).
11. [User] Requests epic generation → [Agent] proposes epics (goal, value, requirements, epic acceptance criteria) → [SpecForge] validates IDs and requirement coverage → [User] edits/merges/splits and approves the epic structure.
11b. [User] Requests story generation per approved epic → [Agent] produces stories with acceptance criteria, requirement links, epic reference and proposed dependencies (blocking/related + rationale).
12. [SpecForge] Validates dependencies (unknown IDs, cycles). If invalid then reports issues; [User] fixes or asks agent to fix (goto 11 partially).
13. [User] Reviews stories and dependency graph; edits; approves stories.
14. (Optional) [User] Requests test concepts → [Agent] produces → [User] approves.
15. [User] Optionally runs decision review for remaining open questions, assumptions and proposed ADRs.
16. [SpecForge] Opens the Kanban step: stories shown on the board (Backlog) and the implementation plan (waves, critical path) → BP-02.

At every phase: running the AI quality check after generation is recommended; starting a phase with unapproved inputs only warns (soft gate).

**End state**: Approved stories in Backlog with a validated dependency graph; all artifacts traceable; phase stepper shows Kanban; project in delivery.

**Change sub-process**: Whenever an approved upstream element changes (step 1, 9, 10 or externally), [SpecForge] flags linked downstream elements and dependent stories *Potentially impacted*; [User] reviews and clears or updates them.

---

## BP-02: Story delivery (Ready → Done), with dependencies and parallelism

**Purpose**: Implement stories through agents under human control, in parallel where possible, sequentially where blocking dependencies require.  
**Trigger**: User moves a story from Ready to In Progress.

1. [User] Prioritises Backlog; moves approved stories Backlog → Ready.
2. [User] Moves a Ready story to In Progress (= authorisation to execute, recorded).
3. [SpecForge] If any blocking predecessor is not Done then
   - if a predecessor is in Backlog/Ready then warns "would wait indefinitely"; [User] confirms (goto 4) or cancels (story back to Ready, end);
   - goto 4.
   Else goto 5.
4. [SpecForge] Puts the story in *Queued* (reason shown: dependency, slot, workspace, conflict). Waits for a trigger event (predecessor approved, slot freed, dependency removed, limit raised, workspace free, user *Re-check*). On trigger goto 3. [User] may remove the story from the queue at any time (→ Ready, end).
5. [SpecForge] If running implementation/correction/retry/resume runs ≥ concurrency limit then goto 4 (reason "waiting for slot"). In non-git mode, if a chat or specification run that may write is active then goto 4 (reason "waiting for workspace", FR-116b).
6. [SpecForge] In git mode: determines base (base branch, single predecessor branch, or integration merge of predecessor branches). If the integration merge conflicts then marks *Blocked (conflict)*, notifies [User], goto 4 (trigger: [User] resolves the conflict and clicks *Re-check* → ConflictResolved). If the main working copy has uncommitted changes then warns [User] that they are not part of the run's base (FR-116c). Creates branch + worktree. In non-git mode: [User] confirms the isolation warning; [SpecForge] snapshots the workspace.
7. [SpecForge] Assembles context (story, specs, instructions, dependency context, concurrent stories) and starts the agent.
8. [Agent] Implements and tests. For each permission-requiring action:
   - [SpecForge] If a rule matches (inside workspace) then auto-decides, else
   - [User] decides Allow/Deny ("Always allow" creates a rule).
9. [SpecForge] Streams/persists events; enforces timeouts. If the agent fails, times out or crashes then marks run *Failed*, frees the slot, notifies [User], goto BP-03.
10. [Agent] Emits structured result. [SpecForge] validates, computes changed files, checks overlaps with other active/unmerged stories, moves the story to *Review*, frees the slot (→ queued stories re-evaluated, step 3 for each), notifies [User].
11. [User] Reviews diff, tests and summary.
   - If **approve** then [SpecForge] sets Done, shows branch + merge order; triggers re-evaluation of dependents (step 3). goto 12.
   - If **request corrections** then [User] writes feedback (pre-filled if in-flight feedback is pending, Release 2); [SpecForge] posts CorrectionRequested to the Scheduler, which resumes the agent session in the same worktree via the RunLauncher (priority "correction"; if no slot, queued ahead of normal entries); goto 8.
   - If **reject** then [SpecForge] sets Ready, marks branch rejected (git) or offers snapshot restore (non-git); dependents stay queued and [User] is notified. End.
12. [User] Merges the branch manually with own tooling, predecessors first. [SpecForge] detects the merge (`git merge-base --is-ancestor`; on project open, window focus, after its own git operations, every 60 s or on *Refresh*, FR-115) and marks the story *Merged* (informational; later stacked bases use the base branch).
13. [SpecForge] If the story belongs to an epic and all stories of that epic are now Done then sets the epic to *Ready for epic review* and notifies [User].
14. (Release 2) [User] Optionally performs the epic review (combined changes, epic acceptance criteria, AI completeness check):
   - If complete then confirms epic Done. End.
   - If gaps then adds follow-up stories to the epic (Backlog) → epic back to In progress → BP-01 step 13 (approve) and BP-02 step 1.
   - Or skips the review → epic Done.
15. [SpecForge] When all story branches of a Done epic are merged, marks the epic *Merged*.

Stories can be started individually or per epic (*Start epic*, Release 2, moves all Ready stories of the epic to In Progress, each as a human authorisation, entering step 3).

**End state**: Story Done (and eventually merged) or returned to Ready; epics Done/Merged when all their stories are.

---

## BP-03: Failure and recovery

**Purpose**: Ensure no run is lost silently and the user can recover.  
**Trigger**: Run fails, times out, is cancelled, or SpecForge is closed/crashes during a run.

1. [SpecForge] On close with active runs: shows active runs; [User] confirms or aborts close. If confirmed then terminates process trees, marks runs *Interrupted*, exits.
2. [SpecForge] On start after crash: marks runs found active as *Interrupted*; kills orphaned processes from the process registry.
3. [SpecForge] Shows failed/interrupted runs on cards and in pending decisions with log and reason.
4. [User] Chooses:
   - **Resume** (if session resumable) → [SpecForge] posts ResumeRequested to the Scheduler (priority "correction"), which resumes the session in the existing worktree → BP-02 step 8.
   - **Retry** → [SpecForge] posts RetryRequested to the Scheduler; fresh run, reuse or recreate branch → BP-02 step 5.
   - **Discard** → story → Ready; worktree cleanup offered.

**End state**: Every failed/interrupted run is resolved by a human decision.

---

## BP-04: First start, setup and project start

**Purpose**: Get a new user from installation to an open project, with a working (or knowingly limited) configuration.  
**Trigger**: First launch (no setup recorded), or user re-runs setup.

1. [SpecForge] Opens the setup wizard.
2. [SpecForge] Detects Claude Code. If not found then shows install instructions; [User] installs it and clicks *Re-check* (goto 2), browses to the executable, or skips (goto 9 with runtime missing).
3. [SpecForge] Verifies the version; shows the execution-boundary notice.
4. [User] Enters an API key or selects a cloud provider. [SpecForge] stores secrets in the OS credential store and runs a connection test. If it fails then [User] corrects (goto 4) or skips (goto 9 with provider missing).
5. [SpecForge] Detects Git (optional) and explains its role for parallel runs.
6. [User] Chooses global default approval rules from suggestions (none pre-enabled) and may add own rules.
7. [User] Confirms execution defaults (parallel runs 3, timeouts, notifications, log retention).
8. [SpecForge] Runs the health check and records setup = complete. Goto 10.
9. [SpecForge] Records setup = incomplete; enables limited mode (AI functions disabled, banner shown).
10. [SpecForge] Shows the start wizard.
11. [User] Chooses:
    - **Open existing** → [SpecForge] opens the project on its dashboard. End.
    - **Recent project** → same. End.
    - **Create new** → [User] enters name and location; [SpecForge] creates folder, Git repo (default), SpecForge structure, initial commit → BP-01 (guided phases) at Intent.
    - **Adopt existing code** → BP-05.

**End state**: A project is open; SpecForge is fully configured or in limited mode.

---

## BP-05: Brownfield onboarding (Release 2)

**Purpose**: Bring an existing codebase under specification-driven development.  
**Trigger**: User selects *Adopt existing code folder*.

1. [User] Selects the folder.
2. [SpecForge] Registers the project, creates `.specforge/` and `spec/`; if no Git then offers `git init` + initial commit.
3. [User] Confirms codebase analysis (or skips → BP-01 with empty intent).
4. [Agent] Reads the codebase (writes allowed only into `spec/`) and drafts current-state summary, intent (as-is + desired change placeholder), current-state requirements and design.
5. [SpecForge] Validates the drafts and shows them as a diff; [User] keeps or discards.
6. [User] Completes the "Desired change" section of the intent → BP-01 from step 2 (quality check / clarification).

**End state**: Existing code described by Draft current-state specifications; guided process continues with the intended change.

---

## BP-06: Project chat

**Purpose**: Let the user explore, question and change the project conversationally while keeping every change approved and traceable.  
**Trigger**: User sends a message in a chat thread.

1. [User] Selects or creates a thread and sends a message.
2. [SpecForge] Starts or resumes the thread's agent session in the main workspace with project context.
3. [Agent] Reads and answers. For each permission-requiring action:
   - In Release 1 (read-only chat, FR-089): if the action is a write then [SpecForge] denies with explanation. From Release 2 (FR-091):
   - If non-git workspace and an implementation run is active and the action is a write then [SpecForge] denies with explanation.
   - Else if a rule matches then [SpecForge] auto-decides; else [User] decides (overlap warning if the file is touched by an active run).
4. (Release 2) [SpecForge] Records changed files per message with diffs; spec files → Draft + impact flags; code changes → activity "outside Kanban flow".
5. If the agent recommends story transitions or run starts then [SpecForge] shows recommendation cards; only [User] can act on them (BP-02).
6. [User] Continues (goto 1), reverts changes of a message, or leaves the thread (resumable later).

**End state**: Answers and tracked, reversible changes; no story state changed by the agent.

---

## BP-07: Feature delivery in an existing project (Release 2)

**Purpose**: Bring a new idea into an existing project with focused, traceable delta specifications.  
**Trigger**: User clicks *Add feature* (or turns an inbox idea into a feature).

1. [User] Describes the idea in the feature wizard.
2. [Agent] Reviews it against the main intent and existing specs: enhanced draft, overlaps, conflicts, questions.
3. [User] Answers questions / accepts suggestions. If the agent reports the idea is already covered then [User] withdraws, merges into another feature, or continues. If further questions then goto 2.
4. [SpecForge] Saves `spec/01_intent/FI-xxx-<slug>.md`; [User] approves.
5. [SpecForge] Shows trace-based impact; [Agent] adds code/spec impact; [User] confirms the impact list.
6. [Agent] Generates delta requirements → [User] accepts per change, quality check, approves. If changes affect in-flight stories then [User] decides per story (continue / cancel / apply in corrections — Review: pre-fills correction feedback; Running: feedback stored and pre-filled when the story reaches Review; [User] always triggers the correction).
7. [Agent] Generates delta design / ADRs → [User] reviews (new ADRs via decision review) and approves (same in-flight rule).
8. [Agent] Proposes the feature epic (new or extend) and stories, incl. adjusted not-started stories and rework stories for affected Done stories → [User] approves.
9. [User] Delivers the stories via Kanban (BP-02), incl. epic review.
10. [SpecForge] When all stories linked to the feature (`feature: FI-xxx`) are Done: feature intent → Done; offers *Create spec baseline*; [User] confirms or skips.

**End state**: Feature delivered and traceable from FI-xxx to code; optional baseline tag. (If [User] withdraws the feature at any step: open change sets discarded, applied delta changes kept, linked not-started stories flagged for keep/delete; Withdrawn is terminal.)
