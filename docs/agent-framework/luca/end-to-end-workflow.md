# Luca - End-to-End Workflow

This document walks through how Luca works from start to finish.

## The Big Picture

```mermaid
flowchart LR
    subgraph Start["🚀 Start"]
        USER["User Request<br/>PT-1234 | Jira URL | Task"]
    end

    subgraph Git["🔗 Git Setup"]
        JIRA["Jira Fetch"]
        ISSUE["GitHub Issue"]
        BRANCH["Branch"]
    end

    subgraph Cognitive["🧠 Think"]
        LOAD["Load Context"]
        ANALYZE["Analyze"]
        ROUTE["Route"]
    end

    subgraph Plan["📋 Plan"]
        RESEARCH["Research"]
        ROADMAP["Structure"]
        TASKS["Tasks"]
    end

    subgraph Execute["⚡ Do"]
        CODE["Code"]
        COMMIT["Commit"]
    end

    subgraph Verify["✅ Check"]
        GOALS["Goals Met?"]
        REVIEW["Review"]
    end

    subgraph Learn["📚 Remember"]
        CAPTURE["Extract"]
        STORE["Store"]
    end

    subgraph PR["🚢 Ship"]
        PROPT["PR Offer"]
    end

    USER --> Git
    Git --> LOAD --> ANALYZE --> ROUTE
    ROUTE --> RESEARCH --> ROADMAP --> TASKS
    TASKS --> CODE --> COMMIT
    COMMIT --> GOALS --> REVIEW
    REVIEW --> CAPTURE --> STORE --> PR
```

---

## Scenario 0: Jira-Driven Task (Most Common)

**User has a Jira ticket and wants to implement it.**

```
User: /lu PT-1234
```

**What happens:**

```mermaid
sequenceDiagram
    participant U as User
    participant S as Skill
    participant J as Jira MCP
    participant G as GitHub CLI
    participant C as Cognitive
    participant E as Executor
    participant L as Learner

    U->>S: /lu PT-1234

    rect rgb(255, 240, 230)
        Note over S,G: Step 0: Git Context Setup
        S->>J: jira_get_issue(PT-1234)
        J-->>S: Summary, description, type, priority
        S->>G: gh issue create --title "[PT-1234] ..."
        G-->>S: Issue #456 created
        S->>G: git checkout -b PT-1234--fix-description
        G-->>S: Branch created
        S->>S: Update STATE.md with git context
    end

    rect rgb(230, 240, 255)
        Note over C: Cognitive Pre-Flight
        S->>C: Load context
        C->>C: Read BRAIN.md, MEMORY.md
        C->>C: Classify complexity
        C-->>S: MODERATE - 3 files, clear scope
    end

    S->>E: Execute with quick plan
    E->>E: Create inline plan
    E->>E: Execute tasks
    E->>E: Log to WORKING.md
    E-->>S: Execution complete

    Note over S: Verification ALWAYS runs
    S->>S: Verify (EXISTS, SUBSTANTIVE, WIRED)

    S->>L: Capture learnings
    L-->>S: MEMORY.md updated

    rect rgb(230, 255, 230)
        Note over S,G: Step 5: Commit & PR
        S->>G: git add . && bun run commit
        G-->>S: Committed
        S->>U: "Ready for PR. Create now?"
        U->>S: "Yes"
        S->>G: gh pr create --base ENG-1353--release
        G-->>S: PR #789 created
    end

    S->>U: ✅ Done! PR: #789
```

**Git context tracked in STATE.md:**

```markdown
## Git Context

- Jira Ticket: PT-1234
- GitHub Issue: #456
- Branch: PT-1234--fix-performance-issue
- Base Branch: ENG-1353--release
- Task Complexity: MODERATE (classified 2026-02-03 10:45)
```

---

## Scenario 0.1: Ad-Hoc Task (No Jira)

**User has a quick fix without a Jira ticket.**

```
User: /lu fix the typo in the readme
```

**What happens:**

```mermaid
sequenceDiagram
    participant U as User
    participant S as Skill
    participant G as GitHub CLI

    U->>S: /lu "fix typo in readme"

    S->>U: No Jira ticket provided.<br/>1. Provide ticket ID<br/>2. Use placeholder (PT-0000)
    U->>S: "Use PT-0000"

    Note over S: Skip GitHub issue creation
    S->>G: git checkout -b PT-0000--fix-typo-in-readme
    G-->>S: Branch created
    S->>S: Update STATE.md (Jira: PT-0000 placeholder)

    Note over S: Continue normal workflow...
```

**When to use PT-0000:**

- Quick fixes, typos, minor improvements
- Tech debt identified during development
- GitHub Issues not from Jira
- Documentation updates
- Dependency updates

---

## Scenario 1: New Project

**User wants to build a new feature from scratch.**

### Step 1: Initialize Project

```
User: /lu-new-project
```

**What happens:**

```mermaid
sequenceDiagram
    participant U as User
    participant S as Skill
    participant C as Cognitive
    participant P as Planning

    U->>S: /lu-new-project
    S->>U: Deep questioning begins

    Note over S,U: "What's the vision?"<br/>"Who are the users?"<br/>"What's the core value?"<br/>"Tech constraints?"

    U->>S: Answers questions
    S->>C: Create initial context
    C->>C: Generate BRAIN.md
    C->>C: Initialize MEMORY.md
    S->>P: Spawn researchers
    P->>P: Research ecosystem
    P->>P: Synthesize findings
    P->>P: Create ROADMAP.md
    S->>U: Project initialized!
```

**Files created:**

```
.planning/
├── BRAIN.md          # Project identity, stack, conventions
├── MEMORY.md         # Empty, ready for learnings
├── STATE.md          # Initial session state
├── config.json       # Default workflow preferences
├── PROJECT.md        # Vision & scope
├── REQUIREMENTS.md   # Detailed requirements
└── ROADMAP.md        # Phase structure with success criteria
```

### Step 2: Plan First Phase

```
User: /lu-plan-phase
```

**What happens:**

```mermaid
sequenceDiagram
    participant U as User
    participant S as Skill
    participant C as Cognitive
    participant P as Planner
    participant Ch as Checker

    U->>S: /lu-plan-phase
    rect rgb(230, 240, 255)
        Note over C: Cognitive Pre-Flight
        S->>C: Load context
        C->>C: Read BRAIN.md
        C->>C: Query MEMORY.md
        C->>C: Check STATE.md
        C-->>S: Cognitive report
    end
    S->>P: Plan phase 1
    P->>P: Goal-backward analysis
    P->>P: Derive artifacts
    P->>P: Create tasks
    P->>P: Add checkpoints
    P-->>S: PLAN-01.md, PLAN-02.md, PLAN-03.md
    S->>Ch: Validate plans
    Ch->>Ch: Check completeness
    Ch->>Ch: Verify goals covered
    Ch-->>S: Plans approved
    S->>U: Plans ready for execution!
```

**Plans created:**

```
.planning/phases/phase-1/
├── PLAN-01.md    # First batch of tasks
├── PLAN-02.md    # Second batch (depends on 01)
└── PLAN-03.md    # Third batch (depends on 02)
```

### Step 3: Execute Phase

```
User: /lu-execute-phase
```

**What happens:**

```mermaid
sequenceDiagram
    participant U as User
    participant S as Skill
    participant C as Cognitive
    participant E as Executor
    participant V as Verifier
    participant L as Learner

    U->>S: /lu-execute-phase
    rect rgb(230, 240, 255)
        Note over C: Cognitive Pre-Flight
        S->>C: Memory recall
        C-->>S: Relevant patterns found
    end

    loop For each PLAN-*.md
        S->>E: Execute plan

        loop For each task
            E->>E: Read task

            alt Has checkpoint
                E->>U: Pause for approval
                U->>E: Approved
            end

            E->>E: Execute actions
            E->>E: Verify task done

            alt Deviation detected
                E->>E: Apply deviation rules
                Note over E: Auto-fix bugs<br/>Auto-add missing<br/>ASK for architecture
            end

            E->>E: Atomic commit
        end

        E-->>S: Plan complete
        E->>E: Generate SUMMARY.md
    end

    S->>V: Verify goals achieved
    V->>V: 3-level verification
    V-->>S: VERIFICATION.md

    S->>L: Capture learnings
    L->>L: Extract patterns
    L->>L: Note decisions
    L->>L: Record pitfalls
    L-->>S: Updated MEMORY.md
    S->>U: Phase complete!
```

**What the executor does for each task:**

```
┌─────────────────────────────────────────────────────────────┐
│                    TASK EXECUTION                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. READ TASK                                               │
│     ├─ Goal: What observable truth are we achieving?        │
│     ├─ Artifacts: What files/code should exist?             │
│     └─ Actions: What steps to take?                         │
│                                                             │
│  2. CHECK FOR CHECKPOINT                                    │
│     ├─ human-verify: "Does this look right?"                │
│     ├─ decision: "Option A or B?"                           │
│     └─ human-action: "Please do X manually"                 │
│                                                             │
│  3. EXECUTE ACTIONS                                         │
│     ├─ Create/modify files                                  │
│     ├─ Run commands                                         │
│     └─ Wire integrations                                    │
│                                                             │
│  4. VERIFY TASK                                             │
│     ├─ EXISTS: Do the files exist?                          │
│     ├─ SUBSTANTIVE: Is the code correct?                    │
│     └─ WIRED: Is it connected to the system?                │
│                                                             │
│  5. HANDLE DEVIATIONS                                       │
│     ├─ Bug blocking progress → AUTO-FIX                     │
│     ├─ Missing critical → AUTO-ADD                          │
│     ├─ Architecture change → ASK USER                       │
│     └─ Performance concern → LOG                            │
│                                                             │
│  6. COMMIT                                                  │
│     └─ feat(1.0-01): #task-id description                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Scenario 2: Quick Task (Unified Entry)

**User has a simple request that doesn't need full planning.**

```
User: /lu "Add a loading spinner to the login button"
```

**What happens:**

```mermaid
sequenceDiagram
    participant U as User
    participant R as Router
    participant C as Cognitive
    participant E as Executor
    participant L as Learner
    participant G as Git

    U->>R: /lu "Add loading spinner..."

    rect rgb(255, 240, 230)
        Note over R: Step 0: Jira Prompt
        R->>U: No Jira ticket. Provide one or use PT-0000?
        U->>R: "PT-0000"
        R->>G: Create branch PT-0000--add-loading-spinner
    end

    rect rgb(230, 240, 255)
        Note over C: Cognitive Pre-Flight
        R->>C: Analyze request
        C->>C: Load BRAIN.md (conventions)
        C->>C: Query MEMORY.md (similar tasks?)
        C->>C: Assess complexity
        C-->>R: TRIVIAL - single file, clear scope
    end

    Note over R: Skip planning overhead

    R->>E: Direct execution
    E->>E: Find login component
    E->>E: Add loading state
    E->>E: Add spinner component
    E->>E: Quick verify
    E-->>R: Done

    R->>L: Capture learning
    L->>L: "Loading spinners go in..."
    L-->>R: MEMORY.md updated

    rect rgb(230, 255, 230)
        Note over R,G: Step 5: Commit & PR Offer
        R->>G: Commit changes
        R->>U: ✅ Added loading spinner<br/>Committed. Create PR?
    end
```

**Routing decision tree:**

```mermaid
flowchart TB
    REQ["'/lu Add loading spinner...'"]

    ANALYZE{"Cognitive Analysis"}

    ANALYZE -->|"Single file change"| TRIVIAL
    ANALYZE -->|"Multi-file, same domain"| MODERATE
    ANALYZE -->|"Cross-domain, architecture"| COMPLEX

    subgraph TRIVIAL["TRIVIAL Path"]
        T1["No planning"]
        T2["Direct execute"]
        T3["✅ Verify"]
        T4["Capture learnings"]
        T1 --> T2 --> T3 --> T4
    end
    subgraph MODERATE["MODERATE Path"]
        M1["Quick 1-plan"]
        M2["Execute tasks"]
        M3["✅ Verify goals"]
        M4["Capture learnings"]
        M1 --> M2 --> M3 --> M4
    end
    subgraph COMPLEX["COMPLEX Path"]
        C1["Research phase"]
        C2["Multiple PLANs"]
        C3["Wave execution"]
        C4["✅ Full verification"]
        C5["Review cycle"]
        C6["Capture learnings"]
        C1 --> C2 --> C3 --> C4 --> C5 --> C6
    end
```

**Key principle: Verification ALWAYS happens, regardless of complexity.**

---

## Scenario 3: Debugging

**Something broke and user needs help fixing it.**

```
User: /lu-debug "Login fails with 401 after token refresh"
```

**What happens:**

```mermaid
sequenceDiagram
    participant U as User
    participant S as Skill
    participant C as Cognitive
    participant D as Debugger
    participant L as Learner

    U->>S: /lu-debug "Login fails..."
    rect rgb(230, 240, 255)
        Note over C: Cognitive Pre-Flight
        S->>C: Load context
        C->>C: Check MEMORY.md
        C-->>S: "Similar issue in auth module 2 weeks ago"
        C->>C: Intuition check
        C-->>S: "⚠️ Token refresh is complex"
    end

    S->>D: Start debug session
    D->>D: Form hypotheses
    Note over D: H1: Token not stored properly<br/>H2: Refresh endpoint wrong<br/>H3: Race condition

    loop Scientific method
        D->>D: Test hypothesis
        alt Hypothesis rejected
            D->>D: Mark rejected, try next
        else Need more info
            D->>U: Request: "Can you check network tab?"
            U->>D: Response
        else Found root cause
            D->>D: Document finding
        end
    end
    D->>D: Apply fix
    D->>D: Verify fix works
    D->>D: Commit fix
    D-->>S: Resolved

    S->>L: Capture debugging learnings
    L->>L: "Token refresh pitfall: ..."
    L-->>S: MEMORY.md updated

    S->>U: ✅ Fixed! Root cause was [X]<br/>Added to memory for future reference
```

---

## Scenario 4: Continuing Work

**User starts a new session and wants to continue where they left off.**

```
User: /lu "Continue from yesterday"
```

**What happens:**

```mermaid
sequenceDiagram
    participant U as User
    participant R as Router
    participant C as Cognitive

    U->>R: /lu "Continue from yesterday"

    R->>C: Load all context

    rect rgb(230, 240, 255)
        Note over C: Context Loading
        C->>C: Read BRAIN.md (project identity)
        C->>C: Read STATE.md (where we left off)
        C->>C: Read MEMORY.md (learnings so far)
        C->>C: Read ROADMAP.md (overall progress)
        C->>C: Check PLAN-*.md (current tasks)
    end

    C-->>R: Context loaded

    R->>U: 📋 Project: [name]<br/>📍 Current phase: 1 of 3<br/>✅ Completed: PLAN-01, PLAN-02<br/>⏳ In progress: PLAN-03 (3/5 tasks done)<br/>🧠 Remembered: [key patterns]<br/><br/>Ready to continue with task 4 of PLAN-03?
```

---

## The Two-Tier Memory System

**Working Memory vs Long-Term Memory:**

```mermaid
flowchart TB
    subgraph Workflow["During Workflow"]
        WORKING["WORKING.md<br/>━━━━━━━━━━━<br/>• Current task context<br/>• Immediate findings<br/>• Hypotheses<br/>• In-progress notes"]
    end

    subgraph Persistent["Across Sessions"]
        MEMORY["MEMORY.md<br/>━━━━━━━━━━━<br/>• Validated patterns<br/>• Confirmed decisions<br/>• Proven pitfalls<br/>• User preferences"]
    end

    subgraph Flow["Memory Flow"]
        WORKING -->|"Workflow completes"| EXTRACT["Extract &<br/>validate learnings"]
        EXTRACT -->|"Only valuable insights"| MEMORY
        WORKING -->|"Cleared"| CLEARED["🗑️"]
    end
```

### Working Memory (`WORKING.md`)

**Purpose**: Active context during a workflow run. Always loaded, never pollutes long-term memory.

```markdown
# Working Memory - Session 2024-01-20T14:30

## Current Context

- Task: Add authentication to investor portal
- Phase: 1 of 3
- Plan: PLAN-02, task 3 of 5

## Immediate Findings

- Found existing auth helper in packages-ui/hooks/use-auth
- Manager portal uses different token format (legacy)
- Need to handle both formats during migration

## Hypotheses

- [ ] Can reuse investor-ui auth flow? → Testing...
- [x] Need new refresh endpoint? → No, existing works

## In-Progress Notes

- Started with LoginForm component
- Discovered token storage uses localStorage (security concern?)
- TODO: Ask about httpOnly cookie migration
```

**Lifecycle**: Created at workflow start → Used throughout → Cleared on completion

### Long-Term Memory (`MEMORY.md`)

**Purpose**: Persistent learnings that compound over time. Selectively recalled when relevant.

```markdown
# Project Memory

## Patterns

### Authentication

- Pattern: JWT tokens with refresh logic
- When: Any API authentication
- Example: See auth/token-service.ts
- Confidence: High (used 5+ times)

### API Design

- Pattern: Rate limiting on all endpoints
- When: Any new API route
- Example: See middleware/rate-limit.ts
- Confidence: High (prevented 2 incidents)

## Decisions

### 2024-01-15 - Chose JWT over sessions

- Context: Needed stateless auth for microservices
- Choice: JWT with 15min access, 7d refresh
- Rationale: Better for horizontal scaling
- Status: Validated in production

### 2024-01-20 - Added rate limiting

- Context: Abuse prevention needed
- Choice: Token bucket, 100/min per user
- Rationale: Balances UX with protection
- Status: Validated in production

## Pitfalls

### Token Refresh Race Condition

- What happened: Multiple tabs refreshed simultaneously
- How to avoid: Add mutex/lock on refresh
- Reference: PR #123
- Severity: High (caused production incident)

## Preferences

### Code Style

- Prefer: Early returns over nested ifs
- Prefer: Explicit types over inference for APIs
- Source: User feedback on PR #145
```

**Selective Recall**: Not everything is loaded into context. Only relevant sections based on current task.

### Memory Flow Across Sessions

```mermaid
flowchart TB
    subgraph Session1["Session 1: Auth Feature"]
        S1_WORKING["WORKING.md<br/>• Task context<br/>• Finding: race condition"]
        S1_VERIFY["Verification passes"]
        S1_EXTRACT["Extract learnings"]
        S1_CLEAR["Clear WORKING.md"]
    end

    subgraph Between["Between Sessions"]
        MEMORY["MEMORY.md<br/>+ New pitfall: race condition"]
    end

    subgraph Session2["Session 2: New API"]
        S2_START["Start new workflow"]
        S2_RECALL["Selective recall:<br/>'auth' patterns relevant"]
        S2_WORKING["WORKING.md<br/>• New task context<br/>• Recalled: watch for race conditions"]
    end

    S1_WORKING --> S1_VERIFY --> S1_EXTRACT
    S1_EXTRACT -->|"Validated learning"| MEMORY
    S1_EXTRACT --> S1_CLEAR

    MEMORY -.->|"Persists"| S2_RECALL
    S2_START --> S2_RECALL --> S2_WORKING
```

### Why Two-Tier Memory?

| Problem                                          | Solution                                         |
| ------------------------------------------------ | ------------------------------------------------ |
| Context gets polluted with task-specific details | WORKING.md keeps transient info separate         |
| Valuable learnings get lost                      | MEMORY.md persists validated insights            |
| Irrelevant memories loaded unnecessarily         | Selective recall based on current task           |
| Hard to know what's validated vs in-progress     | Clear separation: WORKING = now, MEMORY = proven |

---

## End-to-End Summary

```
┌─────────────────────────────────────────────────────────────┐
│              PERCENT ORIGIN END-TO-END                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. USER REQUEST                                            │
│     └─ /lu or /lu-* command                          │
│                                                             │
│  2. COGNITIVE PRE-FLIGHT                                    │
│     ├─ Load BRAIN.md (who are we?)                          │
│     ├─ Selective recall from MEMORY.md (relevant only)      │
│     ├─ Initialize WORKING.md (session context)              │
│     ├─ Check STATE.md (where are we?)                       │
│     ├─ Run intuition checks (any risks?)                    │
│     └─ Classify complexity (trivial/moderate/complex)       │
│                                                             │
│  3. ROUTE TO APPROPRIATE PATH                               │
│     ├─ Trivial → Direct execution → VERIFY                  │
│     ├─ Moderate → Quick plan + execute → VERIFY             │
│     └─ Complex → Full pipeline → VERIFY                     │
│     └─ ✅ VERIFICATION ALWAYS RUNS                          │
│                                                             │
│  4. PLANNING (if needed)                                    │
│     ├─ Research ecosystem                                   │
│     ├─ Goal-backward analysis                               │
│     ├─ Derive artifacts from goals                          │
│     ├─ Create task breakdown                                │
│     ├─ Update WORKING.md with context                       │
│     └─ Validate plans                                       │
│                                                             │
│  5. EXECUTION                                               │
│     ├─ For each task:                                       │
│     │   ├─ Handle checkpoints                               │
│     │   ├─ Execute actions                                  │
│     │   ├─ Log findings to WORKING.md                       │
│     │   ├─ Handle deviations                                │
│     │   └─ Atomic commit                                    │
│     └─ Generate SUMMARY.md                                  │
│                                                             │
│  6. VERIFICATION (ALWAYS)                                   │
│     ├─ 3-level check (EXISTS/SUBSTANTIVE/WIRED)             │
│     ├─ Goal-backward verification                           │
│     ├─ Code review (dx-advocate, security-auditor, etc.)    │
│     └─ Generate VERIFICATION.md                             │
│                                                             │
│  7. LEARNING CAPTURE                                        │
│     ├─ Review WORKING.md for validated insights             │
│     ├─ Extract patterns that worked                         │
│     ├─ Note decisions made                                  │
│     ├─ Record pitfalls to avoid                             │
│     ├─ Write CURATED learnings to MEMORY.md                 │
│     └─ Clear WORKING.md                                     │
│                                                             │
│  8. READY FOR NEXT REQUEST                                  │
│     ├─ Long-term memory preserved                           │
│     └─ Working memory cleared for fresh start               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Key Differentiators

| Aspect               | Without Luca         | With Luca                          |
| -------------------- | ------------------------------ | -------------------------------------------- |
| **Git Workflow**     | Manual branching, commits, PRs | **Automated Jira → Issue → Branch → PR**     |
| **Jira Integration** | Copy-paste ticket details      | **Single command with ticket ID**            |
| **Context**          | Lost between sessions          | BRAIN.md + MEMORY.md persist                 |
| **Working Memory**   | Pollutes everything            | WORKING.md keeps session separate            |
| **Long-Term Memory** | Non-existent                   | MEMORY.md with curated learnings             |
| **Memory Recall**    | All or nothing                 | Selective recall based on relevance          |
| **Routing**          | User picks command             | Auto-routes by complexity                    |
| **Planning**         | Always full overhead           | Trivial tasks skip planning                  |
| **Verification**     | Sometimes skipped              | **ALWAYS runs** at all complexity levels     |
| **Quality**          | Degrades in long sessions      | Context rot prevention                       |
| **PR Creation**      | Manual after coding            | **Offered automatically after verification** |
