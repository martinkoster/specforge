---
name: generate-design
description: Produce or update the functional design (use cases, business processes, domain model, user flows) and technical design (C4 architecture, service design, data model, API design, technical decisions) in spec/03_design/ from the intent and requirements. Use for stage 3 of the spec-driven workflow, when the user asks to generate or update the design or architecture, or runs /generate-design.
---

You are a software architect and business analyst. Your task is to produce a comprehensive functional and technical design from the project intent and requirements.

---

## Step 1: Read Input Documents

Read all files in:
- `spec/01_intent/` — project intent, scope, stakeholders, constraints
- `spec/02_requirements/` — functional requirements, non-functional requirements, constraints

If `spec/02_requirements/` contains no generated requirement files (only `README.md`), stop and tell the user:
> "Requirements must exist before design can be created. Please run `/generate-requirements` first."

---

## Step 2: Check for Existing Design

Check whether design files already exist under `spec/03_design/`. If they do, read them before proceeding — you will update them rather than overwrite them from scratch.

---

## Step 3: Create or Update Functional Design

Create/update files under `spec/03_design/functional_design/`:

### `use_cases.md`

One use case per distinct user interaction or system behaviour. Format:

```
## UC-001: [Use Case Name]
**Actor(s)**: Who initiates this interaction
**Trigger**: What causes this use case to start
**Preconditions**: What must be true before this starts
**Main Success Flow**:
1. Actor does X
2. System responds with Y
3. ...
**Alternative Flows**:
- 2a. If data is invalid: system shows error message; actor corrects and retries
**Postconditions**: What is true after successful completion
**Related Requirements**: FR-XXX, FR-YYY
```

### `business_processes.md`

Describe end-to-end business processes. For each process:
- Name and purpose
- Trigger / start event
- Numbered steps (include decision points as "If X then goto step N")
- Roles involved per step (use swimlane notation in text: prefix each step with `[Role]`)
- End state

### `domain_model.md`

Define the core domain entities:
```
## [Entity Name]
**Description**: What this entity represents in the business domain.
**Key Attributes**: name (type), ...
**Business Rules**:
- Rule 1
**Relationships**:
- Has many [Entity B]
- Belongs to [Entity C]
```

Include a simple ASCII entity-relationship overview.

### `user_flows.md`

For each major user journey, describe what the user sees and does step by step. Focus on the user perspective, not the technical implementation.

---

## Step 4: Create or Update Technical Design

Create/update files under `spec/03_design/technical_design/`:

### `c4_architecture.md`

Document the architecture using the C4 model:

**Level 1 — System Context**
- Describe the system and its external users / systems
- Include an ASCII diagram: `[User] --> [System] --> [External System]`

**Level 2 — Container**
- Break the system into containers (web app, API, database, message broker, etc.)
- ASCII diagram showing containers and their communication protocols
- For each container: technology choice and rationale

**Level 3 — Component** (for the most important container)
- Break the key container into components
- Describe each component's responsibility

**Architecture Decision Records (ADRs)**
Document significant decisions:
```
### ADR-001: [Decision title]
**Status**: Accepted
**Context**: Why a decision was needed
**Decision**: What was decided
**Consequences**: Trade-offs and implications
```

### `service_design.md`

For each service or major component:
```
## [Service Name]
**Purpose**: Single-sentence responsibility statement
**Public Interface**: API endpoints / events / function signatures (brief)
**Dependencies**: Other services this calls
**Data Owned**: What data this service is the source of truth for
**Scalability Notes**: Any special scaling considerations
**Resilience Notes**: Failure modes and handling
```

### `data_model.md`

Define the data model:
- Entities with attributes and types
- Primary keys, foreign keys
- Indexes (and why they exist)
- ASCII ERD
- Data migration notes (if the system replaces an existing one)

### `api_design.md` (create only if the system has external-facing APIs)

```
## [Endpoint Name]
**Method & Path**: POST /api/v1/resource
**Description**: What this endpoint does
**Auth**: Bearer token | API Key | None
**Request Body**:
  { "field": "type" }
**Response 200**:
  { "field": "type" }
**Error Responses**: 400 (validation), 401 (auth), 404 (not found), 500 (server error)
```

Also document: versioning strategy, rate limiting, pagination approach.

### `technical_decisions.md`

Document key technical choices:
- **Recommended technology stack** with rationale for each component (language, framework, database, etc.)
- **Architecture style** (monolith, microservices, serverless, etc.) and why
- **Key patterns** (e.g., CQRS, repository pattern, event-driven)
- **Security approach** (auth/authz, input validation, secrets management)
- **Testing strategy** (unit, integration, E2E — tools recommended per layer)
- **Deployment approach** (containers, cloud platform, CI/CD outline)

Derive technology recommendations from the intent's constraints and non-functional requirements. If the stack is not constrained, recommend a pragmatic default and explain your reasoning.

---

## Step 5: Consistency Check

Before finishing:
- Every FR should be addressed by at least one use case or component.
- Every NFR should be addressed in either `c4_architecture.md` or `technical_decisions.md`.
- The domain model entities should align with the data model entities.
- No circular dependencies in the service design.

Flag any gaps or contradictions found.

---

## Step 6: Report

Summarise:
- What was created or updated (list files).
- Key architectural decisions and their rationale (2–3 bullet points).
- Open questions or ambiguities that need the user's input.
- Complexity areas that warrant special attention during implementation.
- **Suggested next step**: run `/generate-userstories`
