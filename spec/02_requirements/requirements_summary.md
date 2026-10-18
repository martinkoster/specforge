# Requirements Summary

Last updated: 2026-10-14

## Releases

| Release | Scope | Must | Should | Could | Won't |
|---|---|---|---|---|---|
| R1 | MVP — end-to-end workflow: setup, start wizard, guided phases, dashboard + read-only chat, epics (basics), Kanban with dependencies, queue and parallel runs, review | 83 | 2 | 0 | 0 |
| R2 | Evolution & depth — feature intents, chat writes, epic review, plan view, decision review, brownfield onboarding, usage & cost, impact analysis, versioning, test concepts | 11 | 16 | 0 | 0 |
| R3 | Refinements — e.g. direct-edit feature hint | 0 | 0 | 1 | 0 |
| Later | Deferred capabilities (other runtimes, cross-runtime parallelism, collaboration) | 0 | 0 | 0 | 3 |

Priorities are MoSCoW within the release they belong to.

## Functional Requirements

| ID | Title | Priority | Release | Status |
|----|-------|----------|---------|--------|
| FR-001 | Create a project linked to a local workspace | Must Have | R1 | Active |
| FR-002 | Reopen projects with full state across restarts | Must Have | R1 | Active |
| FR-003 | Manage multiple projects | Must Have | R1 | Active |
| FR-004 | Detect workspace version-control mode | Must Have | R1 | Active |
| FR-005 | Create and edit intents | Must Have | R1 | Active |
| FR-006 | AI-assisted intent clarification | Must Have | R1 | Active |
| FR-007 | Generate requirements from the intent | Must Have | R1 | Active |
| FR-008 | Generate the design | Must Have | R1 | Active |
| FR-009 | Generate and record architecture decision records | Should Have | R1 | Active |
| FR-010 | Generate user stories with acceptance criteria | Must Have | R1 | Active |
| FR-011 | Generate test concepts | Should Have | R2 | Active |
| FR-012 | View and edit all artifacts in the application | Must Have | R1 | Active |
| FR-013 | Human approval of generated artifacts | Must Have | R1 | Active |
| FR-014 | Iterative refinement of artifacts | Must Have | R1 | Active |
| FR-015 | Artifact versioning | Should Have | R2 | Active |
| FR-016 | Traceability between artifacts | Must Have | R1 | Active |
| FR-017 | Downstream impact analysis | Should Have | R2 | Active |
| FR-018 | Detect and reconcile external edits | Must Have | R1 | Active |
| FR-019 | Kanban board with five states | Must Have | R1 | Active |
| FR-020 | Persist story status in story files | Must Have | R1 | Active |
| FR-021 | Enforce allowed state transitions | Must Have | R1 | Active |
| FR-022 | Start execution when a story is moved to In Progress | Must Have | R1 | Active |
| FR-023 | Agents cannot initiate implementation work | Must Have | R1 | Active |
| FR-024 | Move completed runs to Review | Must Have | R1 | Active |
| FR-025 | Never mark a story Done automatically | Must Have | R1 | Active |
| FR-026 | Visible failed and interrupted runs with recovery actions | Must Have | R1 | Active |
| FR-027 | Parallel implementation runs with a configurable limit | Must Have | R1 | Active |
| FR-028 | Vendor-neutral agent adapter interface | Must Have | R1 | Active |
| FR-029 | Claude Code adapter | Must Have | R1 | Active |
| FR-030 | Background execution | Must Have | R1 | Active |
| FR-031 | Live execution view | Must Have | R1 | Active |
| FR-032 | Interactive permission relay | Must Have | R1 | Active |
| FR-033 | Pending-decisions queue and notifications | Must Have | R1 | Active |
| FR-034 | Cancel a run | Must Have | R1 | Active |
| FR-035 | Retry a run | Must Have | R1 | Active |
| FR-036 | Structured run result | Must Have | R1 | Active |
| FR-037 | Assemble agent context for a story | Must Have | R1 | Active |
| FR-038 | Isolated branch/worktree per run (git mode) | Must Have | R1 | Active |
| FR-039 | Pre-run snapshot and warning (non-git mode) | Must Have | R1 | Active |
| FR-040 | Persist run records | Must Have | R1 | Active |
| FR-041 | Handle application close and crash during a run | Must Have | R1 | Active |
| FR-042 | Run timeouts | Must Have | R1 | Active |
| FR-043 | Review changed files and diffs | Must Have | R1 | Active |
| FR-044 | Approve an implementation | Must Have | R1 | Active |
| FR-045 | Request corrections | Must Have | R1 | Active |
| FR-046 | Reject an implementation | Must Have | R1 | Active |
| FR-047 | Show execution results in review | Must Have | R1 | Active |
| FR-048 | Configure agent runtime executables | Must Have | R1 | Active |
| FR-049 | Configure agent execution settings | Must Have | R1 | Active |
| FR-050 | Project instructions and reusable conventions | Must Have | R1 | Active |
| FR-051 | Approval policies | Must Have | R1 | Active |
| FR-052 | Execution and logging preferences | Must Have | R1 | Active |
| FR-053 | Configure workspace and repository settings | Must Have | R1 | Active |
| FR-054 | Primary navigation | Must Have | R1 | Active |
| FR-055 | Cross-navigation between story, specification, execution and code | Must Have | R1 | Active |
| FR-056 | Activity and status feedback | Must Have | R1 | Active |
| FR-057 | Show execution boundaries | Should Have | R2 | Active |
| FR-058 | Install and launch as a desktop application | Must Have | R1 | Active |
| FR-059 | Additional agent adapters (OpenCode, Cline, others) | Won't Have (MVP) | Later | Active |
| FR-060 | Parallel execution across different agent runtimes | Won't Have (MVP) | Later | Active |
| FR-061 | Advanced and collaborative capabilities | Won't Have (MVP) | Later | Active |
| FR-062 | Story dependency model | Must Have | R1 | Active |
| FR-063 | Propose, edit and validate dependencies | Must Have | R1 | Active |
| FR-064 | Visualise dependencies on the Kanban board | Must Have | R1 | Active |
| FR-065 | Queue stories with unmet blocking dependencies | Must Have | R1 | Active |
| FR-066 | Automatic start from the queue | Must Have | R1 | Active |
| FR-067 | Stacked branches for dependent stories | Must Have | R1 | Active |
| FR-068 | Dependency awareness of agents | Must Have | R1 | Active |
| FR-069 | Monitor and control multiple concurrent runs | Must Have | R1 | Active |
| FR-070 | Detect overlapping changes between parallel runs | Should Have | R2 | Active |
| FR-071 | Cascade information to dependents | Should Have | R2 | Active |
| FR-072 | Offer to commit specification changes | Should Have | R1 | Active |
| FR-073 | First-start setup wizard | Must Have | R1 | Active |
| FR-074 | Limited mode when setup is incomplete | Must Have | R1 | Active |
| FR-075 | Re-run setup and environment status | Should Have | R2 | Active |
| FR-076 | Start wizard | Must Have | R1 | Active |
| FR-077 | Open an existing SpecForge project | Must Have | R1 | Active |
| FR-078 | Create a new project with a new folder | Must Have | R1 | Active |
| FR-079 | Brownfield onboarding (adopt existing code) | Should Have | R2 | Active |
| FR-080 | Guided phase process (stepper) | Must Have | R1 | Active |
| FR-081 | Uniform phase loop | Must Have | R1 | Active |
| FR-082 | AI quality check of artifacts | Must Have | R1 | Active |
| FR-083 | Decision review mode | Should Have | R2 | Active |
| FR-084 | Implementation plan view | Should Have | R2 | Active |
| FR-085 | Project dashboard | Must Have | R1 | Active |
| FR-086 | Recommended next step | Must Have | R1 | Active |
| FR-087 | Artifact links on the dashboard | Must Have | R1 | Active |
| FR-088 | Kanban link on the dashboard | Must Have | R1 | Active |
| FR-089 | Project chat with the AI agent | Must Have | R1 | Active |
| FR-090 | Usage and cost overview | Should Have | R2 | Active |
| FR-091 | Chat agent may edit specifications and code | Must Have | R2 | Active |
| FR-092 | Chat restrictions | Must Have | R1 | Active |
| FR-093 | Epic artifact | Must Have | R1 | Active |
| FR-094 | Epic-first story generation | Must Have | R1 | Active |
| FR-095 | Derived epic status and progress | Must Have | R1 | Active |
| FR-096 | Kanban swimlanes per epic | Must Have | R1 | Active |
| FR-097 | Derived epic dependencies | Should Have | R2 | Active |
| FR-098 | Start an epic | Should Have | R2 | Active |
| FR-099 | Epic context for agents | Must Have | R1 | Active |
| FR-100 | Epic review | Should Have | R2 | Active |
| FR-101 | Epics on the dashboard | Must Have | R1 | Active |
| FR-102 | "Add feature" entry points | Must Have | R2 | Active |
| FR-103 | Feature wizard with AI review, enhancement and clarification | Must Have | R2 | Active |
| FR-104 | Feature intent artifact and lifecycle | Must Have | R2 | Active |
| FR-105 | Feature-scoped guided phases | Must Have | R2 | Active |
| FR-106 | Impact analysis for a feature | Must Have | R2 | Active |
| FR-107 | Delta specification generation | Must Have | R2 | Active |
| FR-108 | Feature epic and story breakdown | Must Have | R2 | Active |
| FR-109 | Rework stories for implemented functionality | Must Have | R2 | Active |
| FR-110 | In-flight protection | Must Have | R2 | Active |
| FR-111 | Idea inbox | Should Have | R2 | Active |
| FR-112 | Spec baselines | Should Have | R2 | Active |
| FR-113 | Active features on the dashboard | Must Have | R2 | Active |
| FR-114 | Direct edits remain possible | Could Have | R3 | Active |
| FR-115 | Merge detection | Must Have | R1 | Active |
| FR-116 | Workspace consistency rules | Must Have | R1 | Active |

## Non-Functional Requirements

| ID | Title | Category | Priority | Release | Status |
|----|-------|----------|----------|---------|--------|
| NFR-001 | UI responsiveness during agent execution | Performance | Must Have | R1 | Active |
| NFR-002 | Streaming latency | Performance | Must Have | R1 | Active |
| NFR-003 | Application startup | Performance | Should Have | R1 | Active |
| NFR-004 | Run start latency | Performance | Should Have | R1 | Active |
| NFR-005 | Large log handling | Performance | Should Have | R1 | Active |
| NFR-006 | No plaintext secrets in artifacts or logs | Security | Must Have | R1 | Active |
| NFR-007 | Deny-by-default execution permissions | Security | Must Have | R1 | Active |
| NFR-008 | Workspace confinement | Security | Must Have | R1 | Active |
| NFR-009 | No SpecForge cloud and no hidden telemetry | Security | Must Have | R1 | Active |
| NFR-010 | Protection of local application data | Security | Must Have | R1 | Active |
| NFR-011 | Safe process invocation | Security | Must Have | R1 | Active |
| NFR-012 | Auditability of agent actions | Security | Must Have | R1 | Active |
| NFR-013 | Project size limits | Scalability | Should Have | R1 | Active |
| NFR-014 | Concurrent execution capacity and isolation | Scalability | Must Have | R1 | Active |
| NFR-015 | Durable state and crash safety | Availability | Must Have | R1 | Active |
| NFR-016 | End-to-end workflow reliability | Availability | Must Have | R1 | Active |
| NFR-017 | Graceful degradation on agent failure | Availability | Must Have | R1 | Active |
| NFR-018 | Discoverable end-to-end workflow | Usability | Should Have | R1 | Active |
| NFR-019 | Transparency of AI output | Usability | Must Have | R1 | Active |
| NFR-020 | Accessibility basics | Usability | Should Have | R1 | Active |
| NFR-021 | Modular architecture | Maintainability | Must Have | R1 | Active |
| NFR-022 | Extensible agent adapters | Maintainability | Must Have | R1 | Active |
| NFR-023 | Test coverage and automated testing | Maintainability | Must Have | R1 | Active |
| NFR-024 | Specification-driven traceability of SpecForge itself | Maintainability | Should Have | R1 | Active |
| NFR-025 | Cross-platform feature parity | Maintainability | Must Have | R1 | Active |
| NFR-026 | Installation footprint | Usability | Should Have | R1 | Active |
| NFR-027 | Licensing and data handling | Compliance | Should Have | R1 | Active |
| NFR-028 | Dependency graph performance and correctness | Scalability | Should Have | R1 | Active |
| NFR-029 | Time to first productive use | Usability | Should Have | R1 | Active |
| NFR-030 | Dashboard freshness and performance | Performance | Should Have | R1 | Active |
| NFR-031 | Traceability of chat changes | Security | Must Have | R2 | Active |
| NFR-032 | Feature capture effort | Usability | Should Have | R2 | Active |

## Constraints

| ID | Title |
|----|-------|
| CON-001 | Local-first, no SpecForge-hosted backend |
| CON-002 | Claude Code CLI is the first and only MVP agent runtime |
| CON-003 | Vendor-neutral agent abstraction |
| CON-004 | No direct model-API calls by SpecForge (D1) |
| CON-005 | Human-controlled transitions |
| CON-006 | Human-readable Markdown artifacts in the workspace (D2) |
| CON-007 | Git is optional (D6) |
| CON-008 | SpecForge does not merge into user branches (D4) |
| CON-009 | Cross-platform MVP: Windows, macOS, Linux (D9) |
| CON-010 | Parallel execution requires Git worktrees (D10, D12) |
| CON-011 | Technology choices are made in design |
| CON-012 | Minimal infrastructure and dependencies |
| CON-013 | Developed with Claude Code via a specification-driven process |
| CON-014 | MVP scope exclusions |
| CON-015 | SpecForge is licensed under Apache License 2.0 |

## Open questions / assumptions to confirm
| # | Item | Assumption made |
|---|------|-----------------|
| A1 | Quantitative NFR targets | Proposed by analyst (NFR-001…NFR-032); confirm or adjust |
| A2 | Artifact lifecycle states | Draft → Approved (FR-013); any edit by AI resets to Draft |
| A3 | Board transitions beyond §5.4 | Transition matrix in FR-021 (incl. In Progress → Ready on cancel) |
| A4 | Approval policies vs. interactive relay | Rule-based auto-allow/deny is permitted on top of D3 (FR-051, Must Have); default relays everything |
| A5 | Unanswered permission prompts | Never auto-allowed; run waits (no idle timeout), dismissal = deny (NFR-007) |
| A6 | Reject in non-git mode | User is offered snapshot restore (FR-046) |
| A7 | Spec-generation runs and permissions | Spec-generation runs also use the permission relay and are listed in the execution view, but are not Kanban cards |
| A8 | Tech stack of projects SpecForge builds | Chosen by the generated design within the user's project, not by SpecForge |
| A9 | Representation of queued stories | Shown in the *In Progress* column with a *Queued* sub-state, not a sixth column (FR-019, FR-065) |
| A10 | Queue order | FIFO by time of the human move to In Progress (FR-066); no manual priority reordering in MVP |
| A11 | Predecessor rejected/cancelled | Dependents stay queued; user is notified and decides (FR-065) |

## Changelog
| Date | Change |
|------|--------|
| 2026-10-13 | Initial requirements created from intent v0.1 and clarified decisions D1–D9 (61 FR, 27 NFR, 14 CON) |
| 2026-10-13 | Parallel multi-agent execution and story dependencies brought into MVP scope (intent D10–D12). Changed: FR-010, FR-019, FR-021, FR-022, FR-027, FR-032, FR-033, FR-037, FR-038, FR-043, FR-044, FR-052, FR-060, NFR-001, NFR-014, CON-010, CON-014. Added: FR-062–FR-071, NFR-028. |
| 2026-10-13 | ADR review: added FR-072 (commit spec changes, from ADR-004); FR-051 extended with suggested rules (ADR-013). Auth limited to API key / cloud provider (ADR-007). |
| 2026-10-13 | Product license set to Apache-2.0: added CON-015, NFR-027 updated. |
| 2026-10-13 | User workflow (intent D13–D20): added FR-073–FR-092 (setup wizard, limited mode, start wizard, brownfield onboarding, guided phases, quality check, decision review, plan view, dashboard, next step, chat), NFR-029–NFR-031. Changed: FR-001, FR-051 (global defaults, now Must Have), FR-054 (Dashboard in navigation), CON-005 (chat exception). |
| 2026-10-13 | ADR-017 – ADR-019 accepted. Epics (intent D21): added FR-093–FR-101. |
| 2026-10-13 | Feature intents for evolving projects (intent D22): added FR-102–FR-114, NFR-032. |
| 2026-10-14 | Quality review fixes: credentials wording aligned with ADR-007 (CON-002, CON-004, NFR-027); CON-008 narrowed (temporary integration commits allowed); FR-021 story execution sub-states and single approval rule; FR-027 slot rules; FR-042 permission wait pauses all timeouts; FR-040/NFR-015 aligned; FR-110 no system-initiated transition; FR-095/FR-104 epic and feature edge cases; FR-003 and FR-023 raised to Must; FR-089 read-only chat in R1; added FR-115 (merge detection) and FR-116 (workspace consistency rules); references, ordering and stale entries fixed. **Release attribute introduced** (R1 MVP, R2, R3, Later) for all FRs and NFRs. |
| 2026-10-15 | Decisions after spikes S2 / US-004: CON-007 Git 2.30 minimum, 2.38 recommended (merge-tree, ADR-010 amended); TypeScript pinned to 6.0.x (ADR-022); dependency audit via pnpm in CI (US-008 AC-4). |
| 2026-10-15 | NFR-004 / US-047 AC-4: snapshot target split — initial (cold) snapshot in background with progress, pre-run (incremental) snapshot < 5 s (product-owner decision after measurement). |
| 2026-10-18 | NFR-003 / US-065 AC-2: cold start measured as SpecForge's share (bare-Electron baseline of the same machine and test driver subtracted; product-owner decision after measurement). |
