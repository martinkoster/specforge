# SpecForge — User Flows

**Last updated:** 2026-10-14

## UF-00: Application shell (always visible)

- **Left navigation**: Dashboard · Projects · Intent · Specifications · Kanban (disabled until stories exist) · Executions · Settings (FR-054).
- **Top bar**: project switcher, git/non-git badge (with isolation warning in non-git mode), **run indicator** ("2 running · 1 queued"), **pending-decisions bell** with counter (FR-033), "n spec files changed → Commit" indicator (git, FR-072).
- **Limited-mode banner** (when setup incomplete): "AI functions are disabled — Complete setup" (FR-074).
- **Right drawer** (toggle): Trace panel for the current selection (FR-055).
- Toasts for run completion, failures, permission requests; OS notification when the window is unfocused.

## UF-01: First launch — setup wizard

Full-window wizard with a step list on the left (✓ / ⚠ / ✗ per step) and *Skip setup* always visible.

1. **Welcome**: "SpecForge orchestrates AI coding agents on your machine. Let's set up your environment." → *Start*.
2. **Agent runtime**: "Claude Code found at … (v x.y) ✓" or "Not found" with install guide, *Re-check*, *Browse…*.
3. **AI provider**: choose *Anthropic API key* (masked input) or *Cloud provider* (Bedrock / Vertex AI / Foundry fields); *Test connection* runs a tiny agent run and shows ✓ or the error. Notice: "Claude Code sends your prompts and code to this provider. SpecForge itself sends nothing."
4. **Git**: "Git 2.56 found ✓ — needed for parallel runs and isolated branches" or "Not found (optional)".
5. **Tools allowed without asking**: checklist of suggested rules, all unticked by default, grouped: *Read & search files* · *Edit files inside the run's workspace* · *Run tests* (`npm test`, `pytest`, `mvn test`, …) · *Build* · *Git read commands*; plus *Add rule…*. Note: "Everything else will ask you first. Actions outside the workspace always ask."
6. **Execution defaults**: parallel runs (3), max run duration, idle timeout, notifications on/off, log retention.
7. **Ready**: health check summary → *Finish* → start wizard.

*Skip setup* at any step → confirmation "AI features will be disabled until setup is complete" → start wizard in limited mode.

## UF-01b: Start wizard

Centered start screen with three large cards and a recent-projects list:
- **Open existing project** → folder picker → project dashboard. If the folder isn't a SpecForge project: "This folder has no SpecForge metadata. *Adopt this folder* / *Choose another*".
- **Create new project** → dialog: *Project name*, *Location* (parent folder), *Folder name* (auto from name), ☑ *Initialise Git repository (recommended — enables parallel runs)* → *Create* → Intent phase of the guided process.
- **Adopt existing code** (Release 2) → folder picker → "Analyse the codebase to draft the intent and current-state specs?" *Analyse* / *Start empty* → progress → diff of drafts → Intent phase.
- **Recent projects**: name, path, phase chip ("Design · awaiting approval"), last opened; *⋯* → remove from list.

## UF-02: From intent to stories

(Embedded in the guided phases, UF-09; the quality check is detailed in UF-10.)

1. **Intent screen**: split view — editor left, rendered preview right. Buttons: Save · Quality check / Analyse intent · Approve.
2. User clicks *Analyse intent* → right pane becomes a "Clarification" panel; a small live log shows the agent working.
3. Questions appear as cards (question, why it matters, options if proposed). User types answers or picks options, ticks/unticks assumptions, clicks *Send answers*. Further questions may follow.
4. User clicks *Finish* → a diff of the intent shows the new "Clarified decisions" section → *Accept*.
5. User clicks *Approve intent*; header badge turns from "Draft" to "Approved".
6. **Specifications screen**: tabs Requirements · Design · ADRs · Stories · Test concepts. Each empty tab shows a primary button "Generate …" with its input status ("Intent: Approved ✓").
7. User clicks *Generate requirements* → progress panel with live stream; permission prompts may appear (UF-05).
8. On completion a "Review changes" dialog lists created files with diffs → *Keep* / *Discard*.
9. Requirements list view: table of IDs, titles, priority, approval state; clicking opens the element with its trace links. *Refine with AI* opens an instruction box; the result appears as a diff to accept.
10. User approves; repeats for Design (component diagrams rendered from Markdown/ASCII) and Stories.
11. **Stories tab** shows the proposed dependency list ("US-005 depends on US-002 — needs session handling") with accept/remove per item and a mini dependency graph. Cycle errors appear inline in red.

## UF-03: Planning on the Kanban board

1. **Board**: five columns. Card shows ID, title, size, approval badge, and dependency badges:
   - 🔒 "Blocked by 2" (open blocking predecessors), ⛓ "Blocks 3", ↔ "Related".
2. Hovering/selecting a card highlights its predecessors (amber outline) and successors (blue outline) and draws connector lines; unrelated cards dim.
3. A toolbar toggle "Dependency view" switches to a graph layout (nodes coloured by column) for the whole backlog.
4. User drags Backlog → Ready. Unapproved story: the card snaps back with a tooltip "Approve this story first" + *Approve* link.
5. User adds a dependency by alt-dragging from one card to another, or in the story drawer (*Depends on* / *Related to* pickers).
6. **Epic swimlanes** (default when epics exist; toolbar toggle *By epic / Flat*):
   ```
                 Backlog   Ready   In Progress   Review   Done
   ▼ EP-001 User authentication · In progress ▓▓▓▓▓░░░ 5/8 · ▶ Start epic
                 US-006    US-004  US-003 ⏳      US-002   US-001 …
   ▶ EP-002 Task management · Not started 0/6 · depends on EP-001   (collapsed)
   ▼ No epic
                 US-019
   ```
   Lane header: ID, title, derived status, progress, derived dependency (Release 2), *Start epic* (Release 2), *Open epic*. Cards show the epic colour tag in both views; toolbar *Epic filter* (multi-select). Dragging a card across lanes asks "Move US-009 to EP-002?". Lanes reorder by dragging their header.
7. (Release 2) An epic in *Ready for epic review* shows a highlighted header with *Review epic*.

## UF-04: Starting work, parallel runs and the queue

1. User drags three independent Ready stories to In Progress. Each card shows a spinner "Running · 0:12" within seconds.
2. User drags a fourth story → card shows ⏳ "Queued — waiting for run slot (3/3)".
3. User drags US-005 (depends on US-002 which is in Review) → card shows ⏳ "Queued — waiting for US-002 (Review)".
4. Dragging US-008 whose predecessor US-006 is still in Backlog → dialog: "US-006 is not in progress. US-008 will wait until US-006 is done. Queue anyway?"
5. Clicking a queued card → drawer shows the reason, the position in the queue and *Remove from queue*.
6. In non-git projects: dragging to In Progress opens a confirmation "The agent will change files directly in your workspace. A snapshot is taken so you can review and restore. Continue?" and only one story can run. While a chat or specification run that may write is active, the card shows ⏳ "Queued — waiting for workspace" (FR-116b).
6b. In git projects with uncommitted changes in the main working copy: the move shows a warning "Your uncommitted changes are not part of this run's base" (FR-116c).
7. When US-002 is approved later, US-005's card switches to "Running" automatically with a small note "Started after US-002 was approved".
8. If US-005 depends on two unmerged stories whose branches conflict: card shows ⚠ "Blocked — predecessor branches conflict" with *Details* (files), the hint "Merge US-002 and US-003 into main, then click Re-check", and the actions *Re-check* (re-queues the story, `ConflictResolved`; merged predecessors are detected and the base branch is used) and *Remove from queue* (→ Ready).

## UF-05: Watching runs and answering permission prompts

1. **Executions screen**: list of runs (running first): story, status chip (Running / Awaiting approval / Queued / Failed …), elapsed time, files touched count, pending prompts count.
2. Selecting a run shows its live stream (agent messages, tool calls collapsible, test output) and a "Files touched" side list; *Tile* shows up to 3 streams side by side.
3. A permission prompt appears as a modal-less card pinned at the top of the screen and in the bell: "**US-003 · Run #2** wants to run `npm install bcrypt` in `…/worktrees/US-003`" with *Allow* · *Deny…* · *Always allow `npm install` for this project*. Writes outside the workspace show a red "Outside workspace" label and no "Always allow".
4. While waiting, the card on the board shows "Awaiting your approval"; other runs keep going.
5. *Cancel run* asks for confirmation; card returns to Ready with "Cancelled" in its history.

## UF-06: Reviewing results

1. When a run completes, a toast "US-003 ready for review" appears; the card moves to Review.
2. **Review screen** (story drawer, *Review* tab):
   - Header: outcome, agent summary, tests "42 passed · 0 failed", coverage "81 %", open issues.
   - Warnings: "Overlap with US-004 in `src/auth/session.ts`", "Potentially impacted by change in FR-012".
   - File list (added/modified/deleted) with per-file diff (side-by-side toggle); *Open in editor*.
   - Tabs: Log · Permissions · Context (what the agent was given).
3. Actions:
   - *Approve* → confirmation shows "Merge `specforge/US-003` into `main`. Merge after: US-002 (stacked)". Card → Done.
   - *Request corrections* → text box (pre-filled with pending feature feedback, if any — Release 2); card → In Progress, the correction is started via the queue (ahead of normal stories) and the same run thread continues.
   - *Reject* → reason box; card → Ready, history shows "Rejected"; in non-git projects a checkbox "Restore files from snapshot" (default on).

## UF-07: Recovering

1. User closes the window while 2 runs are active → dialog "2 runs are active (US-003, US-004). Closing will stop them. Close anyway?"
2. On next start: a banner "2 runs were interrupted" → each card shows ⚡ "Interrupted" with *Resume* · *Retry* · *Discard*.
3. A failed run (timeout, crash) shows ✖ "Failed — exceeded 60 min" with the same actions and a link to the log.

## UF-08: Settings

1. **Environment status**: runtime, provider (configured / not configured), Git, health check *Re-run*, *Open setup wizard* (FR-075).
2. **Agent runtimes**: detected path/version, *Verify*, default model, effort, timeouts, environment variables (secret toggle → stored in OS keychain, displayed as ••••), boundary notice.
3. **Default approval rules** (global): table (effect, tool, pattern, applies to, created from) — inherited by all projects.
4. **Project**: instructions & conventions editor, base branch, branch pattern, worktree folder, snapshot exclusions, parallel runs (1–N, locked to 1 in non-git with explanation), log retention, effective approval rules (global rules with per-project *disable*, plus project rules; origin column).

## UF-09: Guided phases

1. A horizontal **stepper** is shown at the top of every phase screen and on the dashboard:
   `① Intent ✓ — ② Requirements ● awaiting approval — ③ Design ○ — ④ User stories ○ — ⑤ Kanban (locked: no stories)`.
2. Each phase screen has a **loop bar**: *Write / Generate* → *Quality check* → *Review & refine* → *Approve*, with the current step highlighted and a primary button for the recommended action ("Run quality check").
3. Clicking a later phase whose inputs are Draft shows: "Requirements are not approved yet. Design generated now may need rework. *Continue anyway* / *Go to Requirements*".
4. After approving the last stories, a celebration-free, plain message: "12 stories approved. *Open Kanban* · *View plan*".

## UF-10: AI quality check

1. On any artifact: *Quality check* → right panel "Checking…" with live log.
2. Result: score-free list of findings grouped by severity (Critical / Major / Minor / Info); each finding: title, location link, explanation, *Apply fix* · *Dismiss* · *Ask in chat*.
3. *Apply fix* shows a diff → *Accept* / *Discard*. Clarification questions appear as a separate "Questions" section with answer fields (as in UF-02 step 3).
4. Header badge: "3 open findings (1 major)".

## UF-11: Decision review (Release 2)

1. *Review decisions (5 open)* opens a focused one-item-per-screen view: "Decision 2 of 5 · ADR-006 Claude Code integration".
2. Shows context, then options as radio cards (recommended first, labelled "Recommended"), each with description/trade-offs, plus *Enter own answer* and *Defer*.
3. *Next* moves on; a progress bar shows decided / deferred / remaining.
4. Summary screen lists all decisions and a diff of the artifact updates → *Apply*.

## UF-12: Dashboard (project home)

Layout (top to bottom, two columns on wide screens):
1. **Header**: project name, mode badge, stepper (UF-09; shows *Maintenance* after initial delivery), and the primary split button **＋ Add feature ▾** (menu: *Add feature* · *Capture idea* · *Edit specs directly*) — visible once the main intent is approved.
1b. (Release 2) **Active features widget** (UF-17): one card per feature intent with mini stepper and next step; **Idea inbox** counter ("3 ideas").
2. **Next step card**: "Next: Review US-003 — run completed 5 min ago" with primary button; secondary line "Also: 2 decisions open".
3. **Stories widget**: stacked bar Backlog / Ready / In Progress (queued shown hatched) / Review / Done, totals, progress "7 of 20 done (35 %)", "3 approved branches not merged" with *Refresh* (merge detection, FR-115); **Open Kanban** button (disabled with hint "No user stories yet — go to User stories" when none exist); *View plan*.
4. **Activity widget**: running and queued runs with status chips; pending decisions list (top 5, *Show all*).
4b. **Epics widget**: one row per epic — title, status chip, progress bar (5/8), "Review epic" when ready; click → board filtered to the epic's lane.
5. **Artifacts widget**: grouped list — Intent · Requirements (4) · Design (8) · ADRs (15) · Epics (4) · Stories (20) · Test concepts — each with state chip (Draft / Approved / Impacted), last changed, *Open*.
6. (Release 2) **Usage widget**: "This project: $4.12 · Implementation $3.05 · Specs $0.71 · Chat $0.36 (as reported by Claude Code)".
7. **Recent activity** timeline: generations, approvals, runs, reviews, chat changes ("Chat edited `src/app.ts` — outside Kanban flow").
8. **Chat panel** (right side, collapsible; *Expand* to full screen) — UF-13.

## UF-13: Project chat

1. Panel header: thread selector (titles, last used), *New thread*, *Expand*.
2. Message list: user messages, streamed agent answers (Markdown), collapsed tool-use lines ("Read 4 files", "Searched for 'session'").
3. Release 1: the chat is read-only — write attempts appear inline as "Denied — chat is read-only in this version" (FR-089). From Release 2 (FR-091) permission prompts appear inline: "Agent wants to edit `src/auth/login.ts`" *Allow* / *Deny…* / *Always allow…*; overlap warning "This file is changed by running story US-004".
3b. (Release 2) When the conversation describes new functionality, the agent may offer a card "Create a feature intent from this conversation?" → opens UF-17 pre-filled; or "Save as idea" (UF-19).
4. (Release 2) Below an answer that changed files: "Changed 2 files" with expandable diffs, labels "spec (now Draft)" / "code — outside Kanban flow", and *Revert*.
5. Recommendations from the agent ("Move US-007 to Ready?") appear as cards with *Go to board* — never executed by the agent.
6. In limited mode the input is disabled: "Complete setup to chat with the agent".

## UF-15: Epics in the User stories phase

1. Phase screen shows two sub-steps: **A Epics** → **B Stories**.
2. *Generate epics* → list of epic cards (title, goal, value, linked requirements, acceptance criteria) and a coverage strip "Requirements covered: 18/20 — FR-041, FR-057 not covered".
3. Card actions: edit, *Merge with…*, *Split*, delete; drag to reorder; *Quality check*; *Approve epic structure*.
4. Sub-step B: per epic *Generate stories* (or *Generate for all approved epics*); stories appear grouped by epic with their dependencies.

## UF-16: Epic review (Release 2)

1. *Review epic EP-001* opens: header with goal and progress "8/8 Done".
2. Sections: **Stories** (each with review outcome, run summary, link), **Changes** (union of changed files; expand per file → per-story diffs), **Epic acceptance criteria** (checklist), **AI completeness check** (button; results: covered ✓ / gap ⚠ with *Create follow-up story*).
3. Actions: *Confirm epic Done* · *Add follow-up story* · *Skip review*.

## UF-17: Add feature (feature wizard) (Release 2)

Opens as a large right-side sheet over the dashboard (so the project stays visible), with a step indicator `Describe · AI review · Clarify · Save`. Shortcut **Ctrl/Cmd+Shift+F** from anywhere.

1. **Describe**
   - Large text box: "What would you like to add or change?" with placeholder examples ("Users can comment on tasks and mention teammates").
   - Optional, collapsed *More details*: motivation ("why"), target users, priority (Must/Should/Could), related area — epic picker with suggestions as you type.
   - Primary: *Review with AI* · secondary: *Save as idea* (inbox) · *Save without AI* (limited mode).
2. **AI review** (live progress, ~seconds to a minute)
   - Left: the **enhanced draft** rendered as the future feature intent — Problem · Goal · Scope (in / out) · Success criteria · Constraints · Assumptions — each AI-added part highlighted with *Keep / Remove / Edit*.
   - Right: **Findings** — "Overlaps with FR-034 (task details)" with *View*; "Conflicts with ADR-005?" with *Explain*; "Fits epic EP-002 Task management" (suggestion).
3. **Clarify**
   - Question cards one below the other: question, why it matters, suggested answers as chips (e.g. *Plain text* / *Markdown* / *Rich text*), free-text field; *Answer later* option.
   - *Send answers* → draft updates in place (changed parts briefly highlighted); further questions may appear; *Done clarifying*.
4. **Save**
   - Preview of `spec/01_intent/FI-003-task-comments.md` (title editable, ID auto), *Save & approve* (primary) · *Save as draft*.
   - Confirmation screen: feature stepper `Feature intent ✓ → Impact → Requirements → Design → Epic & stories → Kanban → Epic review` with **Continue to impact analysis** (primary) and *Back to dashboard*.

The wizard can be closed at any step; the dashboard shows "Draft feature: Task comments — resume".

## UF-18: Feature delivery screens (Release 2)

- **Feature page** (from the Active features card): header with FI-ID, status, stepper; tabs *Intent · Impact · Changes · Epic & stories · Activity*.
- **Impact**: three columns — *Specs* (requirements, design, ADRs), *Work* (epics, stories not started, in-flight stories ⚠, Done stories → rework ♻), *Code areas*. Each item: reason, confidence chip, source (trace / AI), checkbox. Items from the trace graph appear instantly; AI items stream in ("Analysing code…"). *Approve impact* (primary).
- **Changes** (delta requirements / design): change set grouped by file; per change a diff with badge *New FR-118* / *Modified FR-034* / *Deprecated FR-020*; *Accept* / *Discard* per change, *Accept all*; *Quality check*; *Approve*.
- **In-flight dialog** on applying changes: table of affected stories (state, change summary) with a required choice per row: *Continue unchanged* · *Cancel / dequeue* · *Apply in corrections* (Review: pre-fills the correction feedback; Running: stored and pre-filled when the story reaches Review — the user still clicks *Request corrections*).
- **Epic & stories**: proposed epic (new or "extend EP-002"), stories with badges *New* / *Adjusted* (diff) / *Rework of US-008* ♻; *Approve* → stories appear in the epic lane; button *Open on Kanban*.
- On completion: banner "Task comments is done 🎯 — Create spec baseline `spec-v1.3`?" *Create* · *Skip*.

## UF-19: Idea inbox (Release 2)

- **Capture**: from *Add feature ▾ → Capture idea*, the inbox widget's input line, the chat ("save as idea"), or shortcut **Ctrl/Cmd+Shift+I** → small popover with one text line + optional note → *Save* (Enter).
- **Inbox list** (dashboard widget, expandable page): idea, date, source; row actions *Turn into feature* (opens UF-17 pre-filled) · *Merge into…* (feature picker) · *Dismiss* (reason).

## UF-14: Implementation plan (Release 2)

1. *View plan*: graph with waves as columns (Wave 1, Wave 2, …), cards coloured by board state and grouped by epic (toggle), critical path drawn bold, per-wave size sum; epic-level dependencies shown as a compact epic graph above.
2. Selecting a wave → *Start wave (3 Ready stories)* → confirmation lists the stories and those skipped (not Ready) → stories move to In Progress (queued where needed).
