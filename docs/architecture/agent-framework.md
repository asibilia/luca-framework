# Agent Framework Architecture

Luca is a spec-driven AI development framework with cognitive memory, intelligent routing, and integrated git workflow. It provides a unified entry point (`/lu`) that handles the full lifecycle from ticket intake through planning, execution, verification, learning capture, and PR creation.

---

## System Architecture

The framework is organized into seven layers, each backed by dedicated agents.

```mermaid
flowchart TB
    subgraph Entry["Entry Points"]
        UNIFIED["/lu<br/>Task | Ticket ID | Jira URL"]
        SPECIFIC["/lu-*<br/>Direct Commands"]
    end

    subgraph Git["Git Integration Layer"]
        JIRA["Jira Detection"]
        ISSUE["GitHub Issue"]
        BRANCH["Branch Creation"]
        GIT_STATE["STATE.md<br/>Git Context"]
    end

    subgraph Cognitive["Cognitive Layer"]
        PREFLIGHT["Pre-Flight Analysis"]
        ROUTING["Intelligent Router"]
        BRAIN_FILE["MuninnDB brain tree"]
        MEMORY_FILE["MuninnDB engrams<br/>(long-term)"]
        WORKING_FILE["MuninnDB session context<br/>(session)"]
    end

    subgraph Planning["Planning Layer"]
        ROADMAP["lu-roadmapper"]
        PLANNER["lu-planner"]
        RESEARCHER["lu-researcher"]
        CHECKER["lu-plan-checker"]
    end

    subgraph Execution["Execution Layer"]
        EXECUTOR["lu-executor"]
        DEBUGGER["lu-debugger"]
        MAPPER["lu-codebase-mapper"]
    end

    subgraph Verification["Verification Layer (ALWAYS RUNS)"]
        VERIFIER["lu-verifier"]
        INTEG["lu-integration-checker"]
        REVIEW["Review Agents"]
    end

    subgraph Learning["Learning Layer"]
        LEARNER["lu-learner"]
        CAPTURE["Learning Capture"]
    end

    subgraph Ship["Commit and PR Layer"]
        COMMIT["Commit Changes"]
        PR["PR Creation"]
    end

    UNIFIED --> JIRA --> ISSUE --> BRANCH --> GIT_STATE
    SPECIFIC --> PREFLIGHT
    GIT_STATE --> PREFLIGHT
    BRAIN_FILE --> PREFLIGHT
    MEMORY_FILE -.->|"selective recall"| PREFLIGHT
    PREFLIGHT --> WORKING_FILE
    PREFLIGHT --> ROUTING
    ROUTING -->|"Trivial"| EXECUTOR
    ROUTING -->|"Moderate"| PLANNER
    ROUTING -->|"Complex"| ROADMAP
    ROADMAP --> PLANNER --> CHECKER --> EXECUTOR
    EXECUTOR --> VERIFIER --> REVIEW
    REVIEW --> LEARNER --> CAPTURE
    CAPTURE -->|"curated"| MEMORY_FILE
    CAPTURE -->|"clear"| WORKING_FILE
    CAPTURE --> COMMIT --> PR
```

---

## Agent Hierarchy

Agents are organized into tiers that execute sequentially through the workflow.

| Tier | Role            | Agents                                                                                         |
| ---- | --------------- | ---------------------------------------------------------------------------------------------- |
| 0    | Git Integration | Handled by `/lu` skill (Jira detection, issue creation, branch management, STATE.md update)    |
| 1    | Cognitive       | `lu-cognition` (pre-flight analysis), `lu-router` (complexity routing)                         |
| 2    | Planning        | `lu-roadmapper`, `lu-planner`, `lu-*-researcher`, `lu-research-synthesizer`, `lu-plan-checker` |
| 3    | Execution       | `lu-executor`, `lu-debugger`, `lu-codebase-mapper`                                             |
| 4    | Verification    | `lu-verifier`, `lu-integration-checker`                                                        |
| 5    | Review          | `dx-advocate`, `code-simplifier`, `security-auditor` (external, run in parallel)               |
| 6    | Learning        | `lu-learner` (extract patterns, decisions, pitfalls, preferences into MuninnDB engrams)        |
| 7    | Commit and PR   | Handled by `/lu` skill (stage, commit, offer PR creation)                                      |

---

## End-to-End Workflow

### Step 0: Git Context Setup

The `/lu` entry point accepts a Jira URL, ticket ID, or plain task description.

```mermaid
flowchart TB
    REQ["User Input"]

    subgraph Detect["Detect Input Type"]
        URL["Jira URL?"]
        TICKET["Ticket ID?"]
        TASK["Plain task?"]
    end

    subgraph Jira["If Ticket Identified"]
        FETCH["Fetch via Jira MCP"]
        ISSUE["Create GitHub Issue"]
        BRANCH["Create Branch"]
        STATE["Update STATE.md"]
    end

    subgraph NoTicket["If No Jira Ticket"]
        ASK["Prompt for ticket or placeholder"]
        PLACEHOLDER["Use placeholder, skip issue creation"]
    end

    REQ --> Detect
    URL --> Jira
    TICKET --> Jira
    TASK --> NoTicket
    NoTicket -->|"User provides ticket"| Jira
    NoTicket -->|"Placeholder"| PLACEHOLDER --> BRANCH
    Jira --> STATE
```

### Step 1: Cognitive Pre-Flight

Runs before routing, planning, execution, and debugging operations.

1. **Memory Recall** -- Query MuninnDB engrams for similar tasks, relevant patterns, previous decisions, and known pitfalls.
2. **Intuition Check** -- Flag potential risks, uncertainty areas, scope concerns, and dependencies.
3. **Feel Awareness** -- Load user preferences, project conventions from MuninnDB brain tree, and communication style.
4. **Reason Analysis** -- Evaluate logical approach, dependency order, scope appropriateness, and recommend complexity level.

Output: Cognitive report with routing recommendation, memory context, intuition flags, and conventions.

### Step 2: Complexity Routing

```mermaid
flowchart TB
    REQ["Request Analysis"]
    REQ --> CRITERIA{"Evaluate"}

    CRITERIA -->|"Single file, clear scope"| TRIVIAL
    CRITERIA -->|"Multi-file, same domain"| MODERATE
    CRITERIA -->|"Cross-domain, architectural"| COMPLEX

    subgraph Trivial["TRIVIAL"]
        T1["Skip planning"] --> T2["Direct execution"] --> T3["Verify"] --> T4["Learn"] --> T5["Commit"]
    end

    subgraph Moderate["MODERATE"]
        M1["Quick plan"] --> M2["Execute"] --> M3["Verify"] --> M4["Learn"] --> M5["Commit"]
    end

    subgraph Complex["COMPLEX"]
        C1["Research"] --> C2["Roadmap + Plans"] --> C3["Wave execution"] --> C4["Full verification"] --> C5["Review cycle"] --> C6["Learn"] --> C7["Commit"]
    end

    TRIVIAL --> T1
    MODERATE --> M1
    COMPLEX --> C1
```

Verification runs at all complexity levels. It is never skipped.

### Step 3: Planning (if needed)

For MODERATE tasks, an inline plan is created. For COMPLEX tasks, the full pipeline runs: research phase, goal-backward analysis, multi-wave PLAN.md creation, and plan validation via `lu-plan-checker`.

### Step 4: Execution

For each task in a plan:

1. Read the task goal, artifacts, and actions.
2. Handle checkpoints (human-verify, decision, human-action).
3. Execute actions (create/modify files, run commands, wire integrations).
4. Verify the task (EXISTS, SUBSTANTIVE, WIRED).
5. Handle deviations (auto-fix bugs, auto-add missing items, ASK for architecture changes).
6. Atomic commit.

### Step 5: Verification (always runs)

Three-level verification: EXISTS (do files exist?), SUBSTANTIVE (is the code correct?), WIRED (is it connected to the system?). Review agents (`dx-advocate`, `code-simplifier`, `security-auditor`) run in parallel.

### Step 6: Learning Capture

After verification, `lu-learner` extracts validated insights from the MuninnDB session context:

- **Patterns** -- Approaches and code patterns that worked.
- **Decisions** -- Architectural choices with rationale.
- **Pitfalls** -- Issues encountered and what to avoid.
- **Preferences** -- User feedback and conventions that emerged.

Curated learnings are written to MuninnDB engrams. Session context is cleared.

### Step 7: Commit and PR

Stage changes, commit with proper format, and offer PR creation linked to the Jira ticket and GitHub issue.

---

## Two-Tier Memory System

```mermaid
flowchart TB
    subgraph WorkingMem["MuninnDB Session Context (Short-Term)"]
        W1["Current task context"]
        W2["Immediate findings"]
        W3["Hypotheses"]
        W4["In-progress notes"]
    end

    subgraph LongTermMem["MuninnDB Engrams (Long-Term)"]
        L1["Validated patterns"]
        L2["Confirmed decisions"]
        L3["Proven pitfalls"]
        L4["Established preferences"]
    end

    subgraph Workflow["During Workflow"]
        START["Workflow Start"]
        WORK["Work and Discover"]
        VERIFY["Verify Complete"]
        EXTRACT["Extract Learnings"]
        CLEAR["Clear Working"]
    end

    START -->|"Initialize"| WorkingMem
    LongTermMem -.->|"Selective recall"| START
    WorkingMem --> WORK --> VERIFY
    VERIFY --> EXTRACT
    EXTRACT -->|"Curated insights"| LongTermMem
    EXTRACT --> CLEAR
```

### Session Context (MuninnDB session context)

Active context during a workflow run. Tracks the current task, immediate findings, hypotheses, and in-progress notes. Created at workflow start, used throughout, cleared on completion.

### Long-Term Memory (MuninnDB engrams)

Persistent learnings that compound across sessions. Contains validated patterns, confirmed decisions, proven pitfalls, and established preferences. Selectively recalled based on relevance to the current task -- not loaded in bulk.

### Cross-Session Memory Flow

```mermaid
sequenceDiagram
    participant U as User
    participant W as Session Context
    participant M as Engrams

    Note over W,M: Session Start
    U->>M: Selective recall (relevant patterns)
    M-->>U: Relevant learnings loaded
    U->>W: Initialize session context

    Note over W: During Workflow
    U->>W: Log findings, hypotheses, notes

    Note over W,M: Verification Complete
    W->>W: Extract validated learnings
    W->>M: Store curated insights
    W->>W: Clear session data

    Note over M: Persists for future sessions
```

### MuninnDB Brain Tree

Stored as a persistent tree in MuninnDB (`brain:project-identity`), recalled at session start. Contains project identity (name, domain, purpose), stack (languages, frameworks), architecture patterns, code conventions, and development preferences.

---

## State Management

All workflow state lives in `.planning/`:

```
.planning/
  config.json        -- Workflow preferences (model profile, cognitive settings, gates)
  STATE.md           -- Session state including git context (ticket, issue, branch, base branch)
  PROJECT.md         -- Vision and scope
  ROADMAP.md         -- Phase structure with success criteria
  REQUIREMENTS.md    -- Detailed requirements per milestone
  todos/             -- Captured ideas and tasks
  phases/            -- Execution plans (PLAN-*.md, SUMMARY-*.md, VERIFICATION.md)
```

STATE.md tracks git context throughout the workflow:

```markdown
## Git Context

- Ticket: PROJ-1234
- GitHub Issue: #456
- Branch: PROJ-1234--fix-performance-issue
- Base Branch: ENG-1353--release
- Task Complexity: MODERATE
```

---

## Model Profile Integration

Agents receive different model tiers depending on the configured profile:

| Agent         | quality | balanced | budget |
| ------------- | ------- | -------- | ------ |
| lu-cognition  | opus    | sonnet   | haiku  |
| lu-planner    | opus    | opus     | sonnet |
| lu-roadmapper | opus    | sonnet   | sonnet |
| lu-executor   | opus    | sonnet   | sonnet |
| lu-verifier   | sonnet  | sonnet   | haiku  |
| lu-debugger   | opus    | sonnet   | sonnet |
| lu-learner    | sonnet  | haiku    | haiku  |

When cognitive pre-flight detects high complexity or risk, the model profile is upgraded one tier. When memory recall finds similar past successes, a downgrade may apply (confidence boost).

---

## Integration Points

| Category      | Integration                                                                          |
| ------------- | ------------------------------------------------------------------------------------ |
| Jira          | Read-only via Atlassian MCP (`getJiraIssue`, `searchJiraIssuesUsingJql`)             |
| GitHub        | Issue creation, branch management, PR creation via `gh` CLI                          |
| Review Agents | `dx-advocate`, `code-simplifier`, `security-auditor` run in parallel after execution |
| Hooks         | `post-edit-typecheck` (async, per-edit), `pre-commit-gate` (blocking, per-commit)    |
| Harness       | Comprehensive verification at phase boundaries (test + typecheck + lint + build)     |

---

## Key Commands

| Command                 | Purpose                                                                  |
| ----------------------- | ------------------------------------------------------------------------ |
| `/lu <task or ticket>`  | Unified entry: git setup, routing, execution, verification, learning, PR |
| `/lu-new-project`       | Initialize project with brain tree and engrams                           |
| `/lu-map-codebase`      | Analyze existing codebase (parallel agents)                              |
| `/lu-new-milestone`     | Start new milestone cycle                                                |
| `/lu-plan-phase [N]`    | Create execution plans with cognitive pre-flight                         |
| `/lu-execute-phase [N]` | Execute, verify, and capture learnings                                   |
| `/lu-debug`             | Memory-aided debugging with scientific method                            |
| `/lu-progress`          | Check current state and next steps                                       |
| `/lu-resume-work`       | Resume from previous session with context restoration                    |
| `/lu-address-pr`        | Address PR review comments with agent swarm                              |

### Unified Entry Flags

| Flag              | Purpose                                                   |
| ----------------- | --------------------------------------------------------- |
| `--force-complex` | Force full planning pipeline regardless of classification |
| `--skip-memory`   | Skip memory recall (fresh start)                          |
| `--skip-branch`   | Skip branch creation (use current branch)                 |
