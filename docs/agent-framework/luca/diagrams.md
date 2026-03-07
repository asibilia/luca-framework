# Luca - Architecture Diagrams

## High-Level Overview

```mermaid
flowchart TB
    subgraph Entry["Entry Points"]
        UNIFIED["/lu<br/>Task | [TICKET-ID] | Jira URL"]
        SPECIFIC["/lu-*<br/>Direct Commands"]
    end

    subgraph Git["🔗 Git Integration Layer (NEW)"]
        JIRA["Jira Detection"]
        ISSUE["GitHub Issue"]
        BRANCH["Branch Creation"]
        GIT_STATE["STATE.md<br/>Git Context"]
    end

    subgraph Cognitive["🧠 Cognitive Layer"]
        PREFLIGHT["Pre-Flight Analysis"]
        ROUTING["Intelligent Router"]

        BRAIN_FILE["MuninnDB brain tree"]
        MEMORY_FILE["MuninnDB engrams<br/>(long-term)"]
        WORKING_FILE["MuninnDB session context<br/>(session)"]
    end

    subgraph Planning["📋 Planning Layer"]
        ROADMAP["lu-roadmapper"]
        PLANNER["lu-planner"]
        RESEARCHER["lu-researcher"]
        CHECKER["lu-plan-checker"]
    end

    subgraph Execution["⚡ Execution Layer"]
        EXECUTOR["lu-executor"]
        DEBUGGER["lu-debugger"]
        MAPPER["lu-codebase-mapper"]
    end

    subgraph Verification["✅ Verification Layer (ALWAYS RUNS)"]
        VERIFIER["lu-verifier"]
        INTEG["lu-integration-checker"]
        REVIEW["Review Agents"]
    end

    subgraph Learning["📚 Learning Layer"]
        LEARNER["lu-learner"]
        CAPTURE["Learning Capture"]
    end

    subgraph Ship["🚢 Commit & PR Layer (NEW)"]
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

## The Complete Picture

```mermaid
flowchart LR
    subgraph Git["🔗 Git Integration (NEW)"]
        G1["Jira → GitHub Issue"]
        G2["Branch Management"]
        G3["Commit & PR"]
        G4["[PLACEHOLDER] Placeholders"]
    end

    subgraph Cognitive["🧠 Cognitive Features"]
        B1["Cognitive Analysis"]
        B2["Memory Recall"]
        B3["Intuition Checks"]
        B4["Intelligent Routing"]
        B5["MuninnDB brain tree"]
        B6["MuninnDB engrams"]
    end

    subgraph Planning["📋 Planning Features"]
        V1["Goal-Backward Planning"]
        V2["3-Level Verification"]
        V3["Atomic Commits"]
        V4["Deviation Rules"]
        V5["Model Profiles"]
        V6["Context Rot Prevention"]
    end

    subgraph Origin["✨ Luca"]
        O["Complete<br/>Development<br/>Framework"]
    end

    Git --> Origin
    Cognitive --> Origin
    Planning --> Origin
```

## Git Context Setup Flow (Step 0)

```mermaid
flowchart TB
    REQ["User Input"]

    subgraph Detect["0.1 Detect Input Type"]
        URL["Jira URL?<br/>atlassian.net/browse/[TICKET-ID]"]
        TICKET["Ticket ID?<br/>[TICKET-ID]"]
        TASK["Plain task?<br/>'fix the bug'"]
    end

    subgraph Jira["0.2 If Ticket"]
        FETCH["Fetch via MCP<br/>jira_get_issue"]
        ISSUE["Create GitHub Issue<br/>gh issue create"]
        BRANCH["Create Branch<br/>[TICKET-ID]--description"]
        STATE["Update STATE.md"]
    end

    subgraph Prompt["0.3 If No Jira"]
        ASK["Prompt for ticket<br/>or [PLACEHOLDER]"]
        PLACEHOLDER["[PLACEHOLDER]<br/>Skip issue creation"]
    end

    subgraph Display["0.4 Display Context"]
        SHOW["Show Jira, Issue,<br/>Branch, Base"]
    end

    REQ --> Detect
    URL --> Jira
    TICKET --> Jira
    TASK --> Prompt
    Prompt -->|"User provides"| Jira
    Prompt -->|"[PLACEHOLDER]"| PLACEHOLDER --> BRANCH
    Jira --> SHOW
    PLACEHOLDER --> SHOW
```

## Cognitive Pre-Flight Flow (Step 1)

```mermaid
flowchart TB
    REQ["From Step 0<br/>(Git context set)"]

    subgraph Load["1. Load Context"]
        BRAIN["Load MuninnDB brain tree<br/>Project identity"]
        STATE["Load STATE.md<br/>Session + Git context"]
        MEM["Load MuninnDB engrams<br/>Past learnings"]
    end

    subgraph Analyze["2. Cognitive Analysis"]
        RECALL["Memory Recall<br/>Similar tasks?<br/>Known patterns?"]
        INTUIT["Intuition Check<br/>Risks?<br/>Red flags?"]
        FEEL["Feel Awareness<br/>Conventions?<br/>Preferences?"]
        REASON["Reason Analysis<br/>Logical approach?<br/>Dependencies?"]
    end

    subgraph Route["3. Route Decision"]
        CLASSIFY{"Complexity?"}
        TRIVIAL["TRIVIAL<br/>Direct execute"]
        MOD["MODERATE<br/>Quick plan"]
        COMPLEX["COMPLEX<br/>Full pipeline"]
    end

    REQ --> Load
    Load --> Analyze
    Analyze --> CLASSIFY
    CLASSIFY -->|"Single file"| TRIVIAL
    CLASSIFY -->|"Multi-file"| MOD
    CLASSIFY -->|"Architectural"| COMPLEX
```

## Learning Capture Flow (Step 4)

```mermaid
flowchart LR
    subgraph Execution["After Execution"]
        VERIFY["Verification<br/>Complete"]
    end

    subgraph Extract["Learning Extraction"]
        PATTERNS["Patterns<br/>What worked?"]
        DECISIONS["Decisions<br/>Choices made?"]
        PITFALLS["Pitfalls<br/>What to avoid?"]
        PREFS["Preferences<br/>User feedback?"]
    end

    subgraph Store["Memory Storage"]
        MEMORY["MuninnDB engrams<br/>━━━━━━━━━<br/>## Patterns<br/>## Decisions<br/>## Pitfalls<br/>## Preferences"]
    end

    subgraph Future["Future Use"]
        RECALL["Cognitive<br/>Pre-Flight<br/>recalls these"]
    end

    VERIFY --> PATTERNS
    VERIFY --> DECISIONS
    VERIFY --> PITFALLS
    VERIFY --> PREFS
    PATTERNS --> MEMORY
    DECISIONS --> MEMORY
    PITFALLS --> MEMORY
    PREFS --> MEMORY

    MEMORY --> RECALL
```

## Commit & PR Flow (Step 5)

```mermaid
flowchart TB
    subgraph After["After Learning Capture"]
        LEARN["Learnings<br/>captured"]
    end

    subgraph Commit["5.1 Commit Changes"]
        STAGE["git add ."]
        MSG["bun run commit<br/>--message=summary<br/>--type=fix/feat<br/>--scope=apps"]
    end

    subgraph Check["5.2 Check Branch State"]
        AHEAD{"Commits<br/>ahead of base?"}
    end

    subgraph PR["5.3 Offer PR"]
        ASK["Create PR now?"]
        YES["gh pr create<br/>--base [RELEASE-ID]####<br/>--title 'type(scope): [TICKET-ID] desc'"]
        NO["More work to do"]
    end

    LEARN --> STAGE --> MSG
    MSG --> AHEAD
    AHEAD -->|"Yes"| ASK
    AHEAD -->|"No"| NO
    ASK -->|"Yes"| YES
    ASK -->|"No"| NO
```

## Agent Hierarchy

```mermaid
flowchart TB
    subgraph Tier0["Tier 0: Git Integration (Skill)"]
        GIT["Git Context Setup<br/>(in /lu skill)"]
    end

    subgraph Tier1["Tier 1: Cognitive"]
        COG["lu-cognition"]
        ROUTE["lu-router"]
    end

    subgraph Tier2["Tier 2: Planning"]
        ROADMAP["lu-roadmapper"]
        PLAN["lu-planner"]
        RES["lu-*-researcher"]
        CHECK["lu-plan-checker"]
    end

    subgraph Tier3["Tier 3: Execution"]
        EXEC["lu-executor"]
        DEBUG["lu-debugger"]
        MAP["lu-codebase-mapper"]
    end

    subgraph Tier4["Tier 4: Verification"]
        VER["lu-verifier"]
        INT["lu-integration-checker"]
    end

    subgraph Tier5["Tier 5: Review (External)"]
        DX["dx-advocate"]
        SIMP["code-simplifier"]
        SEC["security-auditor"]
    end

    subgraph Tier6["Tier 6: Learning"]
        LEARN["lu-learner"]
    end

    subgraph Tier7["Tier 7: Commit & PR (Skill)"]
        SHIP["Commit & PR<br/>(in /lu skill)"]
    end

    Tier0 --> Tier1 --> Tier2 --> Tier3 --> Tier4 --> Tier5 --> Tier6 --> Tier7
```

## Command Structure

```mermaid
flowchart TB
    subgraph Unified["Unified Entry"]
        PTOG["/lu<br/>━━━━━━━━━<br/>Task | [TICKET-ID] | Jira URL<br/>Git setup → Routing<br/>→ Execute → PR"]
    end

    subgraph Project["Project Lifecycle"]
        NEW["/lu-new-project"]
        MAP["/lu-map-codebase"]
    end

    subgraph Milestone["Milestone Management"]
        MILE["/lu-new-milestone"]
        COMP["/lu-complete-milestone"]
        AUDIT["/lu-audit-milestone"]
        GAPS["/lu-plan-milestone-gaps"]
    end

    subgraph Phase["Phase Management"]
        DISC["/lu-discuss-phase"]
        RESEARCH["/lu-research-phase"]
        ASSUME["/lu-list-phase-assumptions"]
        PLAN["/lu-plan-phase"]
        EXEC["/lu-execute-phase"]
        VERIFY["/lu-verify-work"]
        ADD["/lu-add-phase"]
        INS["/lu-insert-phase"]
        REM["/lu-remove-phase"]
    end

    subgraph Session["Session Management"]
        PROG["/lu-progress"]
        PAUSE["/lu-pause-work"]
        RES["/lu-resume-work"]
    end

    subgraph Tasks["Task Management"]
        QUICK["/lu-quick"]
        TODO["/lu-add-todo"]
        CHECK["/lu-check-todos"]
    end

    subgraph Debug["Debugging"]
        DBG["/lu-debug"]
    end

    subgraph PR["PR Management"]
        ADDR["/lu-address-pr"]
    end

    subgraph Config["Configuration"]
        SET["/lu-settings"]
        PROF["/lu-set-profile"]
    end

    subgraph Utils["Utilities"]
        HELP["/lu-help"]
        CHOOSE["/lu-choose"]
        UPD["/lu-update"]
        DISC2["/lu-join-discord"]
    end

    subgraph Flags["Unified Entry Flags"]
        FORCE["--force-complex"]
        SKIP_MEM["--skip-memory"]
        SKIP_BR["--skip-branch"]
    end

    PTOG -->|"Routes to"| Phase
    PTOG -.->|"Modifiers"| Flags
```

## Two-Tier Memory System

```mermaid
flowchart TB
    subgraph WorkingMem["MuninnDB session context (Short-Term)"]
        W1["Current task context"]
        W2["Immediate findings"]
        W3["Hypotheses"]
        W4["In-progress notes"]
    end

    subgraph LongTermMem["MuninnDB engrams (Long-Term)"]
        L1["Validated patterns"]
        L2["Confirmed decisions"]
        L3["Proven pitfalls"]
        L4["Established preferences"]
    end

    subgraph Workflow["During Workflow"]
        START["Workflow Start"]
        WORK["Work & Discover"]
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
    CLEAR -->|"🗑️"| WorkingMem

    style WorkingMem fill:#FFE4B5
    style LongTermMem fill:#E6E6FA
```

### Memory Flow Timeline

```mermaid
sequenceDiagram
    participant U as User
    participant W as MuninnDB session context
    participant M as MuninnDB engrams

    Note over W,M: Session Start

    U->>M: Selective recall (relevant patterns)
    M-->>U: "JWT needs refresh logic"
    U->>W: Initialize working memory

    Note over W: During Workflow

    U->>W: Log: "Found existing auth helper"
    U->>W: Log: "Testing hypothesis..."
    U->>W: Log: "Discovered edge case"

    Note over W,M: Verification Complete

    W->>W: Extract validated learnings
    W->>M: Store: "New pattern: edge case handling"
    W->>W: Clear session data

    Note over M: Persists for Future
```

## State File Organization

```mermaid
flowchart TB
    subgraph Planning[".planning/ Directory"]
        subgraph Identity["Project Identity"]
            BRAIN["MuninnDB brain tree<br/>━━━━━━━━━<br/>Identity<br/>Stack<br/>Conventions"]
            PROJECT["PROJECT.md<br/>━━━━━━━━━<br/>Vision<br/>Scope<br/>Constraints"]
        end

        subgraph Learning["Learning Storage"]
            MEMORY["MuninnDB engrams<br/>━━━━━━━━━<br/>Patterns<br/>Decisions<br/>Pitfalls"]
        end

        subgraph Session["Session State"]
            STATE["STATE.md<br/>━━━━━━━━━<br/>Focus<br/>Git Context (NEW)<br/>• Ticket<br/>• GitHub Issue<br/>• Branch<br/>• Base Branch<br/>Cognitive state"]
            CONFIG["config.json<br/>━━━━━━━━━<br/>Workflow<br/>Cognitive<br/>Gates"]
        end

        subgraph Utils["Utilities"]
            TODOS["todos/<br/>Captured ideas"]
            DEBUG["debug/<br/>Debug sessions"]
            QUICK["quick/<br/>Quick tasks"]
        end

        subgraph Structure["Project Structure"]
            REQS["REQUIREMENTS.md"]
            ROADMAP["ROADMAP.md"]
        end

        subgraph Phases["phases/phase-X/"]
            PLANS["PLAN-*.md"]
            SUMMARIES["SUMMARY-*.md"]
            VERIFY["VERIFICATION.md"]
            LEARNINGS["LEARNINGS.md"]
        end
    end

    Identity --> Session
    Session --> Utils
    Utils --> Structure
    Structure --> Phases
    Phases --> Learning
```

## Complexity Routing

```mermaid
flowchart TB
    REQ["Request Analysis<br/>(after Git setup)"]

    REQ --> CRITERIA{"Evaluate"}

    CRITERIA -->|"Single file<br/>Clear scope<br/>No dependencies"| TRIVIAL
    CRITERIA -->|"Multi-file<br/>Same domain<br/>Limited scope"| MODERATE
    CRITERIA -->|"Cross-domain<br/>Architectural<br/>Complex dependencies"| COMPLEX

    subgraph Trivial["TRIVIAL Path"]
        T1["Skip planning"]
        T2["Direct execution"]
        T3["✅ Verify"]
        T4["Capture learnings"]
        T5["Commit & PR offer"]
    end

    subgraph Moderate["MODERATE Path"]
        M1["Quick plan<br/>(inline tasks)"]
        M2["Execute"]
        M3["✅ Verify"]
        M4["Capture learnings"]
        M5["Commit & PR offer"]
    end

    subgraph Complex["COMPLEX Path"]
        C1["Full research"]
        C2["Roadmap + Plans"]
        C3["Wave execution"]
        C4["✅ Full verification"]
        C5["Review cycle"]
        C6["Learning consolidation"]
        C7["Commit & PR offer"]
    end

    TRIVIAL --> T1 --> T2 --> T3 --> T4 --> T5
    MODERATE --> M1 --> M2 --> M3 --> M4 --> M5
    COMPLEX --> C1 --> C2 --> C3 --> C4 --> C5 --> C6 --> C7

    style T3 fill:#90EE90
    style M3 fill:#90EE90
    style C4 fill:#90EE90
```

**Key Principles**:

- Verification ALWAYS runs regardless of complexity level
- Commit & PR offer comes at the end of ALL paths

## Complete Workflow Overview

```mermaid
flowchart TB
    subgraph Input["Input Types"]
        JIRA_URL["Jira URL"]
        TICKET["[TICKET-ID]"]
        TASK["Plain task"]
    end

    subgraph Step0["Step 0: Git Setup"]
        FETCH["Fetch Jira"]
        ISSUE["Create Issue"]
        BRANCH["Create Branch"]
        STATE["Update STATE.md"]
    end

    subgraph Step1["Step 1: Cognitive"]
        BRAIN["Load MuninnDB brain tree"]
        MEM["Recall MuninnDB engrams"]
        WORK["Init MuninnDB session context"]
    end

    subgraph Step2["Step 2: Route"]
        CLASSIFY["Classify Complexity"]
    end

    subgraph Step3["Step 3: Execute"]
        EXECUTE["Execute Task(s)"]
    end

    subgraph Step4["Step 4: Verify"]
        VERIFY["ALWAYS Verify"]
        LEARN["Capture Learnings"]
    end

    subgraph Step5["Step 5: Ship"]
        COMMIT["Commit Changes"]
        PR["Offer PR Creation"]
    end

    Input --> Step0 --> Step1 --> Step2 --> Step3 --> Step4 --> Step5
```

## Implementation Phases

```mermaid
timeline
    title Luca Implementation

    section Foundation
        Directory Structure : Templates, configs
        Cognitive Agent : Pre-flight, routing

    section Migration
        Rename Agents : lu-* → lu-*
        Add Hooks : Cognitive integration
        Create Learner : New agent

    section Skills
        Rename Skills : /lu-* → /lu-*
        Unified Entry : /lu command

    section Polish
        Workflows : Migration + new
        Documentation : Complete docs
        Testing : End-to-end
```
