
# SpecForge — Product Intent

**Version:** 0.2  
**Status:** Product intent incl. clarified decisions D1–D23  
**Initial development tool:** Claude Code  
**Product type:** Local-first, human-directed, multi-agent AI software engineering platform

## 1. Vision

**SpecForge transforms software development from a manually executed engineering process into a human-directed, AI-powered software factory.**

Users describe what they want to build through high-level natural-language intents. SpecForge guides them through the creation and refinement of requirements, architecture designs, specifications, and user stories.

A built-in Kanban board serves as the central control interface for software delivery. Humans retain responsibility for prioritization, approval, and initiation of implementation activities, while AI coding agents autonomously execute approved work.

SpecForge is vendor-neutral and integrates with locally installed AI coding tools, initially Claude Code, with future support for OpenCode, Cline, and other agent runtimes.

The platform runs as a locally installed desktop application and orchestrates AI coding agents against local project workspaces.

**Core principle: Humans decide what to build and when. AI agents execute how it is built.**

## 2. Goals

SpecForge shall:

1. Transform natural-language intents into structured, reviewable software specifications.
2. Support AI-assisted creation of functional requirements, technical designs, architecture decisions, and user stories.
3. Provide a Kanban board for human-controlled planning and execution.
4. Automatically initiate agent-based implementation when a human moves a story into the *In Progress* state.
5. Integrate interchangeable AI coding tools through a vendor-independent abstraction.
6. Allow users to configure agent runtimes, models, execution parameters, and project-specific instructions.
7. Execute AI agents asynchronously while keeping the desktop UI responsive.
8. Provide real-time visibility into agent execution, logs, progress, generated changes, and failures.
9. Maintain traceability from original intent through specifications and stories to implemented code and tests.
10. Preserve human oversight through explicit review and approval checkpoints.
11. Support local-first operation without requiring a SpecForge-hosted cloud backend.
12. Guide users through the specification phases and support the continuous evolution of existing projects through feature intents.

## 3. Target users

SpecForge targets software architects, developers, technical leads, and engineering teams that want to use AI coding agents without surrendering control over software architecture, planning, and delivery.

It should support both experienced engineers and users with limited coding experience, while making architectural decisions and generated changes transparent and reviewable.

## 4. Core workflow

The core workflow consists of six stages:

### 4.1 Intent

The human describes the desired software.

### 4.2 Requirements & design

AI generates specifications, architecture and decisions.

### 4.3 Story generation

AI proposes epics grouping related functionality (D21), then creates reviewable, testable user stories per epic.

### 4.4 Human-controlled Kanban

The human approves stories and moves them to In Progress; stories with unfinished blocking dependencies are queued (D11).

### 4.5 Agent execution

The configured coding agent implements and tests each story; several stories may run in parallel (D10).

### 4.6 Human review

The human inspects changes, tests, and execution results.

Each stage follows the loop generate → AI quality check → review & refine → approve (D15). After the initial delivery, new features enter the same stages scoped by a feature intent (D22).

Each stage must allow human review, refinement, and iteration. AI-generated artifacts must never automatically become approved requirements or implementation work without an appropriate human-controlled transition. Exception: the project chat may edit files directly, each write individually approved by the human through the permission relay (D17).

## 5. Functional capabilities

### 5.1 Project and workspace management

SpecForge shall support creating and managing multiple software projects. Each project is associated with a local workspace containing source code, specifications, configurations, and generated artifacts.

Projects must be reopenable across application restarts without losing planning or execution state.

### 5.2 Intent management

Users shall be able to create, edit, and refine natural-language intents. Intents may describe an entirely new application, a feature, or a change to existing software.

The AI shall be able to ask clarification questions, identify ambiguities, propose alternatives, and document assumptions before generating specifications.

### 5.3 Specification-driven development

SpecForge shall guide users through the following artifacts:

| Artifact | Purpose |
|---|---|
| Intent | High-level objective and expected outcome |
| Feature intent | Delta intent for a new feature or change in an existing project (D22) |
| Requirements | Functional and non-functional requirements |
| Design | Solution architecture, components, interfaces, and data models |
| ADRs | Important architecture decisions and rationale |
| Epic | Group of user stories forming one bigger feature (D21) |
| User stories | Implementable work items with acceptance criteria |
| Test concepts | Validation scenarios and expected outcomes |

All artifacts shall be editable, versionable, and stored in human-readable formats, preferably Markdown.

The system shall maintain relationships between artifacts and identify potentially impacted downstream artifacts when specifications change.

### 5.4 Kanban-based execution

The Kanban board shall provide the central human-facing execution interface.

The initial workflow shall include:

| State | Meaning |
|---|---|
| Backlog | Story exists but is not approved for implementation |
| Ready | Story is sufficiently specified and approved |
| In Progress | Implementation has been initiated by a human |
| Review | Agent execution has completed and awaits human review |
| Done | Implementation has been accepted |

Moving a story from *Ready* to *In Progress* shall initiate execution — or queue it until blocking dependencies are done and a run slot is free (D11) — through the configured AI coding agent.

The transition must be explicitly performed by a human. Agents may recommend transitions but shall not autonomously initiate new implementation work by moving stories into progress.

Failed or interrupted executions must remain visible and support retry, cancellation, and recovery.

### 5.5 Agent orchestration

SpecForge shall introduce a vendor-independent agent abstraction that separates the application workflow from the specific coding tool.

Initially, Claude Code shall be supported through its locally installed CLI. The architecture must accommodate future adapters for OpenCode, Cline, and other tools.

Agent configurations shall support selection of the runtime, model where supported, execution parameters, project instructions, permitted tools, and relevant environment settings.

Agent execution shall run in the background, with streamed output and execution status available through the UI.

Parallel story execution by multiple agent instances is part of the MVP (see D10–D12). Dependencies between stories shall be considered: they shall be visualised on the Kanban board, made known to the executing agents, and stories with strong (blocking) dependencies shall be queued until their predecessors are complete. Collaboration between different agent runtimes remains a long-term capability.

### 5.6 Human review and quality control

Upon implementation completion, SpecForge shall present the generated changes and available test results.

The user shall be able to inspect modified files, review diffs, request corrections, approve the result, or reject the implementation.

An agent reporting success must not automatically mark a story as *Done*.

Implementation should occur in an isolated Git branch or worktree where practical, reducing the risk of overwriting unrelated changes.

### 5.7 Configuration

SpecForge shall provide a graphical configuration interface for:

- Installed agent runtimes and executable paths.
- Agent-specific configuration and supported model selection.
- Project workspaces and Git repositories.
- Execution permissions and approval policies.
- Project instructions and reusable development conventions.
- Execution timeouts, concurrency limits, and logging preferences.
- First-start setup wizard and global default approval rules (D13).

Credentials and secrets must not be stored in plaintext project artifacts or exposed in agent execution logs. Provider credentials are stored only in the OS credential store.

## 6. User experience

SpecForge shall be a modern, responsive desktop application with a rich-client experience.

The interface should combine the usability of modern development tools with the simplicity of a project management application.

The primary navigation shall expose a project dashboard, projects, intents, specifications, Kanban, agent execution, and settings. The user workflow (first-start setup, start wizard, guided phases, dashboard and project chat) is detailed in decisions D13–D20.

Users should be able to move naturally between a story, its underlying specification, the associated agent execution, and the resulting source code.

Long-running agent tasks must not block navigation or interaction with other parts of the application.

The application shall provide clear feedback about agent activity, pending human decisions, errors, and completed work.

## 7. Architectural principles

| Principle | Intent |
|---|---|
| Local-first | Run the application and orchestrate tools on the user's machine |
| Vendor-neutral | Avoid dependencies on any single AI model or coding-agent vendor |
| Human-in-control | Humans authorize execution and accept results (chat edits individually approved, D17) |
| Specification-driven | Requirements and designs guide implementation |
| Modular | Separate UI, domain logic, persistence, and agent adapters |
| Extensible | Support additional coding agents without redesigning the core |
| Transparent | Make agent activity, decisions, and generated changes inspectable |
| Recoverable | Preserve execution state and support recovery after interruption |
| Secure by default | Restrict execution permissions and protect local data |
| Portable | Avoid unnecessary platform-specific dependencies |

**Local-first does not mean offline-only.** Locally installed coding tools may communicate with external AI providers according to their own configuration. SpecForge shall make these dependencies and execution boundaries understandable to users.

## 8. Initial MVP

The first implementation shall demonstrate the complete end-to-end workflow rather than attempting to implement every future capability.

The MVP (Release 1) shall include a locally installable desktop application with first-start setup (D13), a start wizard to create or open projects (D14), natural-language intent entry with AI quality check, guided phases for requirements, design, epics and user stories (D15, D21), a project dashboard with read-only project chat (D16, D17), and a functional Kanban board with epic swimlanes, story dependencies and parallel, dependency-aware execution (D10–D12).

It shall integrate Claude Code as the first execution adapter. Moving an approved story to *In Progress* shall launch a background Claude Code execution in the project workspace.

The application shall display execution output, track status, preserve results, and move completed implementations into a human review state.

The user shall be able to inspect the implementation and explicitly accept or reject it.

The MVP shall also include persistent project state and configuration of the Claude Code executable, provider credentials, approval rules and execution settings.

Later releases add, among others, feature intents for evolving projects (D22), chat with write access, epic review, decision review, implementation plan view, brownfield onboarding and usage & cost reporting. The release of each requirement is recorded in the requirements specification.

### MVP acceptance scenario

A user can install and launch SpecForge, complete the setup wizard, create a project via the start wizard, and enter the following intent:

> Build a simple task management application with user authentication, task creation, assignment, and a Kanban board.

The user runs the AI quality check and is guided through requirements, design, epics and user stories.

The user reviews the artifacts on the dashboard, approves several stories, and moves them to *In Progress*. Independent stories run in parallel; dependent ones are queued.

SpecForge invokes the locally installed Claude Code CLI, which implements the stories within the project workspace and executes relevant tests.

The user can observe execution progress, answer permission requests, inspect the resulting changes, and approve the implementations.

**The MVP is successful when this workflow can be completed reliably without manually invoking Claude Code outside SpecForge.**

## 9. Out of scope for the initial MVP

The initial release does not require multi-user collaboration, cloud-hosted project management, distributed execution across multiple machines, automated production deployment, enterprise identity management, or integrations with external issue trackers.

Support for OpenCode, Cline, and other agent runtimes shall follow the initial Claude Code integration.

Advanced capabilities such as parallel execution across different agent runtimes, automatic agent selection, cross-agent collaboration, cost optimization, and autonomous backlog refinement are future enhancements.

## 10. Development approach

SpecForge itself shall initially be developed using Claude Code, following a specification-driven development process.

Implementation should proceed incrementally, starting with technical spikes for the agent adapter, stacked worktrees and process management, followed by a thin end-to-end slice (project, story, agent run, review) and then the remaining capabilities release by release.

Claude Code should be guided by explicit requirements, architectural decisions, and testable acceptance criteria.

The implementation must not introduce unnecessary infrastructure or dependencies on externally hosted services.

Technology choices for the desktop framework, backend runtime, persistence mechanism, and internal orchestration architecture shall be evaluated during the design phase rather than prescribed by this intent document.

## 11. Future vision

SpecForge should evolve into a complete AI-native software engineering environment supporting the entire lifecycle from initial intent through architecture, implementation, testing, security analysis, and delivery.

Future versions may introduce specialized agents for architecture, requirements engineering, coding, testing, security, and code review.

These agents may collaborate across different vendors and models while operating within explicit human-defined boundaries.

The Kanban board shall remain the central mechanism for controlling implementation work, with further advanced capabilities for cross-project dependency monitoring, capacity management across agent runtimes and coordination of multi-agent collaboration.

## 12. Success criteria

SpecForge will be considered successful when it enables a user to:

1. Express a software development objective without manually creating all technical artifacts.
2. Refine and approve AI-generated specifications before implementation.
3. Manage implementation priorities through an intuitive Kanban board.
4. Initiate coding-agent execution through a deliberate human action.
5. Monitor execution without using the underlying agent CLI directly.
6. Review and accept generated code and test results.
7. Switch between supported agent runtimes through configuration rather than changes to the application core.
8. Retain ownership and control of the source code, specifications, and execution workflow.
9. Add a new feature to an existing project through a guided feature intent without regenerating approved specifications.

## 13. Clarified decisions

The following decisions resolve open questions in this intent. They are binding input for requirements and design.

All decisions were made by the product owner on 2026-10-13 unless a date is given in the row.

| # | Topic | Decision | Implications |
|---|---|---|---|
| D1 | AI for specification generation (stages 4.2–4.3) | Use the same vendor-neutral agent adapter (e.g. headless Claude Code CLI) as for implementation. SpecForge does not call model APIs directly. | Provider credentials entered by the user (Anthropic API key or cloud provider configuration) are stored only in the OS credential store and injected only into the agent process environment (ADR-007); SpecForge never calls model APIs itself. The adapter must support both specification-generation runs and implementation runs. |
| D2 | State storage | Hybrid: Markdown files in the project workspace are the source of truth for specifications and story status (front-matter, versionable). Execution runs, logs and UI state are stored in a local database (e.g. SQLite) in the application data directory. | SpecForge must detect and reconcile external edits to Markdown artifacts. |
| D3 | Agent permission policy | Interactive relay: permission requests from a running agent are surfaced in the SpecForge UI for live human approval or denial. | A run blocks while awaiting a decision; the UI needs a pending-approvals queue and clear notifications. Highest-risk integration point; must be validated early. |
| D4 | Integration after approval | The user merges manually. Approval marks the story *Done*; the story branch remains for the user to merge with their own tooling. | SpecForge shows the branch/worktree and base branch for each approved story. |
| D5 | Review loop | *Request corrections*: the user provides feedback, the story returns to *In Progress*, and the agent resumes the same session on the same branch. *Reject*: the story returns to *Ready*; the branch is retained and marked rejected; a retry starts a fresh run. | Agent session identifiers must be persisted per run. |
| D6 | Git requirement | Git is optional. In git workspaces each run uses its own branch/worktree. In non-git workspaces runs execute directly in the workspace. | For non-git workspaces SpecForge must snapshot files before a run to compute diffs, and must clearly warn the user that runs are not isolated. |
| D7 | Test results | The agent returns a structured final result (e.g. JSON: tests run/passed/failed, coverage, summary) as part of the agent contract. The raw log remains available. | The result format is part of the vendor-neutral adapter contract. |
| D8 | Interruption and recovery | Agent processes are tied to the application. Closing during an active run shows a warning and terminates the run. On restart, runs left in a running state are marked *Interrupted* with logs preserved; the user can retry, resume, or cancel. | Run state must be persisted continuously. |
| D9 | Supported platforms | Windows, macOS and Linux are all MVP release targets. | Strongly influences desktop framework selection, installers, process handling and CLI path discovery; cross-platform testing is required. |
| D10 | Parallel multi-agent execution (supersedes the original §5.5 statement on one story at a time) | Multiple stories can be implemented in parallel by separate agent runs. The maximum number of parallel runs is configurable per project, default 3. | Scheduler and run management must handle concurrent runs, concurrent permission prompts and concurrent reviews. |
| D11 | Story dependencies | Stories can declare blocking ("strong") dependencies and non-blocking ("related") dependencies. Dependencies are visualised on the Kanban board and included in the agent's context. A story moved to *In Progress* whose blocking predecessors are not yet *Done* is queued and starts automatically once they are *Done*. Its branch is stacked on the predecessor branch(es) when these are not yet merged into the base branch. | The human move to *In Progress* is the authorisation; an automatic start from the queue is not an autonomous agent decision. Requires dependency cycle detection and stacked-branch handling. |
| D12 | Parallelism without Git | In non-git workspaces the concurrency limit is forced to 1; the UI explains that parallel execution requires Git. | Parallel isolation relies on Git worktrees only. |
| D13 | First-start setup | On first start SpecForge runs a setup wizard: agent runtime detection/verification, AI provider credentials, Git detection, global default approval rules (tools allowed without prior approval), execution defaults, health check. Setup can be skipped; SpecForge then runs in a limited mode (manual editing and planning only, AI functions disabled with a "Complete setup" prompt). | Global default rules are inherited by new projects; setup can be re-opened from Settings. |
| D14 | Start wizard | After setup, a start wizard offers: open an existing SpecForge project (folder with `.specforge` metadata), create a new project (new folder, Git initialised by default), adopt an existing code folder without SpecForge metadata (brownfield onboarding: AI analyses the codebase and drafts intent and current-state specifications), and recent projects. | Brownfield analysis is a specification run. |
| D15 | Guided phase process | New projects are guided through phases Intent → Requirements → Design → User stories → Kanban. Each phase follows the loop generate → AI quality check → review/refine → approve. Gates are soft: the recommended order is shown; starting a phase with unapproved inputs warns but is allowed; earlier phases can be revisited at any time. | Phase status is derived from artifact approval states. |
| D16 | Project dashboard | The dashboard is the project home: current phase, recommended next step, story counts per state, implementation progress, active/queued runs, pending decisions, usage & cost, recent activity, links to all artifacts (with approval state) and to the Kanban board. The Kanban link is disabled until at least one user story exists. | — |
| D17 | Project chat (full agent) | The dashboard offers a chat with the configured agent in multiple resumable threads. The chat agent may read the project and edit specifications **and code in the main workspace**; every write goes through the permission relay (D3). It can never move stories or start implementation runs. | Deliberate exception to "code is built via Kanban stories": chat edits are tracked and shown as diffs per thread but are not isolated in worktrees nor reviewed via the Review state. In non-git workspaces chat writes are blocked while an implementation run is active. |
| D18 | Decision review mode | Open questions, assumptions and proposed ADRs can be walked through one by one, each with options and a recommendation; decisions are written back to the artifacts. | — |
| D19 | Implementation plan view | After story generation SpecForge shows the dependency graph with suggested waves of stories that can run in parallel and the critical path. | — |
| D20 | Usage & cost | Token usage and cost reported by the agent are shown per run, per phase and per project. | Depends on what the adapter reports. |
| D21 | Epics | Epics group user stories that together form a bigger feature. An epic is a Markdown artifact with goal, business value, linked requirements and epic-level acceptance criteria; each story belongs to at most one epic. In the story phase the AI first proposes epics (user approves the structure), then generates stories per epic. Epic status is derived from its stories; epics are never executed by agents. The Kanban board shows swimlanes per epic (toggle to flat board). Story branches are still merged individually (D4 unchanged). When all stories of an epic are Done, an optional epic review (combined changes, epic acceptance criteria, AI completeness check) lets the user confirm the epic or add follow-up stories. | Traceability becomes requirement → epic → story → run → code. |
| D22 | Adding features to an existing project | New features enter through **feature intents** (FI-xxx): delta intents stored as Markdown beside the main intent in `spec/01_intent/`. A prominent *Add feature* action on the dashboard opens a guided feature wizard: the user describes the idea, the AI reviews and enhances it, asks clarification questions and checks it against the existing specifications (overlaps, conflicts); the result is saved as a feature intent. The user is then guided through feature-scoped phases: impact analysis → delta requirements → delta design → epic & story breakdown → Kanban → epic review. Approved artifacts are changed only via reviewed diffs with stable IDs. Done stories are never reopened; affected implemented functionality gets new rework stories. Accepting deltas that affect queued, running or in-review stories requires an explicit per-story decision (in-flight protection). An idea inbox captures quick ideas for later triage; completing a feature offers a spec baseline (Git tag). Small corrections may still be edited directly in existing specs. | Traceability: feature intent → changed/new requirements → design → epic → stories → code. |
| D23 | Agent SDK in the installers (2026-10-21) | The installers bundle the JavaScript of the Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`, Anthropic's terms, no open-source license) so SpecForge runs without extra installation; its optional Claude Code binary is never bundled (the user's installation is used, ADR-006). THIRD_PARTY_NOTICES lists the SDK as proprietary and not covered by Apache-2.0. **Condition:** legal confirmation of Anthropic's terms is required before any public release (GitHub Releases, signed installers in US-067). | Unsigned R1 installers may be built and shared internally; public distribution is gated on the confirmation (CON-015). |
