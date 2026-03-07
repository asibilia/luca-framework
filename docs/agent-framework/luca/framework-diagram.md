# Luca Agent Framework — Mermaid Diagrams

## 1. System Architecture Overview

```mermaid
flowchart TB
    subgraph Entry["Entry Layer"]
        LU["/lu<br/>Unified Entry Point"]
        SPECIFIC["/lu-*<br/>Direct Commands"]
    end

    subgraph GitLayer["Git Integration Layer"]
        JIRA_DETECT["Jira Detection<br/>(Ticket ID | URL | Plain task)"]
        GH_ISSUE["GitHub Issue Creation<br/>(gh CLI)"]
        BRANCH_MGR["Branch Management<br/>(TICKET--description)"]
        STATE_UPDATE["STATE.md Update<br/>(Git Context)"]
    end

    subgraph CognitiveLayer["Cognitive Layer"]
        PREFLIGHT["Cognitive Pre-Flight<br/>(lu-cognition)"]
        ROUTER["Intelligent Router<br/>(lu-router)"]

        subgraph Memory["Memory System"]
            BRAIN["MuninnDB brain tree<br/>Project Identity"]
            LONG_MEM["MuninnDB engrams<br/>Long-Term Learning"]
            WORK_MEM["MuninnDB session context<br/>Session Memory"]
        end
    end

    subgraph PlanningLayer["Planning Layer"]
        ROADMAPPER["lu-roadmapper<br/>(Phase Structure)"]
        PLANNER["lu-planner<br/>(Execution Plans)"]
        PROJ_RES["lu-project-researcher"]
        PHASE_RES["lu-phase-researcher"]
        RES_SYNTH["lu-research-synthesizer"]
        PLAN_CHECK["lu-plan-checker"]
    end

    subgraph ExecutionLayer["Execution Layer"]
        EXECUTOR["lu-executor<br/>(Atomic Task Execution)"]
        DEBUGGER["lu-debugger<br/>(Scientific Method)"]
        MAPPER["lu-codebase-mapper"]
    end

    subgraph VerificationLayer["Verification Layer (ALWAYS RUNS)"]
        HARNESS["Harness Runner<br/>(test + typecheck + lint + build)"]
        VERIFIER["lu-verifier<br/>(EXISTS / SUBSTANTIVE / WIRED)"]
        INTEG_CHECK["lu-integration-checker"]

        subgraph ReviewAgents["Review Agents"]
            DX["dx-advocate"]
            SIMPLIFIER["code-simplifier"]
            ARCHITECT["code-architect"]
            SECURITY["security-auditor"]
            PERF["performance-auditor"]
        end
    end

    subgraph LearningLayer["Learning Layer"]
        LEARNER["lu-learner<br/>(Extract & Curate)"]
    end

    subgraph ShipLayer["Commit & PR Layer"]
        COMMIT["git commit<br/>(Atomic per task)"]
        PR["gh pr create<br/>(Linked to Jira + Issue)"]
    end

    %% Entry flow
    LU --> JIRA_DETECT --> GH_ISSUE --> BRANCH_MGR --> STATE_UPDATE
    SPECIFIC --> PREFLIGHT

    %% Cognitive flow
    STATE_UPDATE --> PREFLIGHT
    BRAIN --> PREFLIGHT
    LONG_MEM -.->|"Selective Recall"| PREFLIGHT
    PREFLIGHT --> WORK_MEM
    PREFLIGHT --> ROUTER

    %% Routing
    ROUTER -->|"TRIVIAL"| EXECUTOR
    ROUTER -->|"MODERATE"| PLANNER
    ROUTER -->|"COMPLEX"| ROADMAPPER

    %% Planning flow
    ROADMAPPER --> PLANNER
    PROJ_RES -.-> PLANNER
    PHASE_RES -.-> PLANNER
    RES_SYNTH -.-> PLANNER
    PLANNER --> PLAN_CHECK --> EXECUTOR

    %% Execution flow
    EXECUTOR --> HARNESS
    HARNESS --> VERIFIER --> INTEG_CHECK
    INTEG_CHECK --> ReviewAgents

    %% Learning & shipping
    ReviewAgents --> LEARNER
    LEARNER -->|"Curated Insights"| LONG_MEM
    LEARNER -->|"Clear Session"| WORK_MEM
    LEARNER --> COMMIT --> PR
```

---

## 2. Source Code Module Map

```mermaid
flowchart TB
    subgraph SRC["src/ — Single Source of Truth"]
        subgraph Agents["agents/ (28)"]
            direction TB
            A_BASE["base/base-agent.ts"]
            A_COG["lu-cognition"]
            A_ROUTER["lu-router"]
            A_ROAD["lu-roadmapper"]
            A_PLAN["lu-planner"]
            A_EXEC["lu-executor"]
            A_VERIFY["lu-verifier"]
            A_LEARN["lu-learner"]
            A_DEBUG["lu-debugger"]
            A_MAP["lu-codebase-mapper"]
            A_INTEG["lu-integration-checker"]
            A_PCHK["lu-plan-checker"]
            A_PRES["lu-project-researcher"]
            A_PHRES["lu-phase-researcher"]
            A_RSYNTH["lu-research-synthesizer"]
            A_PM["lu-pm-planner"]
            A_PR["lu-pr-reviewer"]
            A_EXT["dx-advocate | code-simplifier<br/>code-architect | security-auditor<br/>performance-auditor | ui | ux<br/>product | qa-plan-generator<br/>code-developer"]
        end

        subgraph Skills["skills/ (39)"]
            direction TB
            S_BASE["base/base-skill.ts"]
            S_LU["lu.skill.ts (main entry)"]
            S_EXEC["lu-execute-phase"]
            S_PLAN["lu-plan-phase"]
            S_VERIFY["lu-verify-work"]
            S_DEBUG["lu-debug"]
            S_NEW["lu-new-project"]
            S_MILE["lu-new-milestone<br/>lu-complete-milestone<br/>lu-audit-milestone<br/>lu-plan-milestone-gaps"]
            S_PHASE["lu-discuss-phase<br/>lu-research-phase<br/>lu-list-phase-assumptions<br/>lu-add-phase | lu-insert-phase<br/>lu-remove-phase"]
            S_SESSION["lu-progress | lu-pause-work<br/>lu-resume-work | lu-quick<br/>lu-add-todo | lu-check-todos"]
            S_GIT["git-commit | git-feature | git-pr<br/>jira-issue | lu-address-pr"]
            S_TOOLS["code-lint | code-typecheck<br/>test-run | lu-settings<br/>lu-set-profile | lu-help"]
        end

        subgraph Modules["Core Modules"]
            direction TB
            M_HARNESS["harness/<br/>runner + parsers<br/>(bun-test, tsc, eslint)"]
            M_ITER["iteration/<br/>convergence, classifier,<br/>checkpoint, budget"]
            M_PLAN["planner/<br/>WSJF scoring, scheduler,<br/>weekly allocation, cost model"]
            M_CTX["context/<br/>tier resolution, assembler,<br/>result aggregator, envelope"]
            M_COMPLEX["complexity/<br/>5-level gating matrix"]
            M_HOOKS["hooks/<br/>pre-commit, post-edit,<br/>context-monitor, session-persist"]
        end

        subgraph Build["compilers/"]
            direction TB
            B_BASE["base.compiler.ts"]
            B_CLAUDE["claude.compiler.ts"]
            B_CURSOR["cursor.compiler.ts"]
        end
    end

    subgraph Generated["Generated Output (never edit)"]
        G_CURSOR[".cursor/<br/>agents/ | skills/ | rules/ | hooks/"]
        G_CLAUDE[".claude/<br/>rules/"]
    end

    SRC -->|"bun run build:all"| Generated
```

---

## 3. Agent Tier Hierarchy

```mermaid
flowchart LR
    subgraph T0["Tier 0: Git Integration"]
        direction TB
        T0_DESC["Handled by /lu skill<br/>Jira fetch, GitHub issue,<br/>branch creation, STATE.md"]
    end

    subgraph T1["Tier 1: Cognitive"]
        direction TB
        T1_COG["lu-cognition<br/>Pre-flight analysis"]
        T1_ROUTE["lu-router<br/>Complexity routing"]
    end

    subgraph T2["Tier 2: Planning"]
        direction TB
        T2_ROAD["lu-roadmapper"]
        T2_PLAN["lu-planner"]
        T2_PRES["lu-project-researcher"]
        T2_PHRES["lu-phase-researcher"]
        T2_SYNTH["lu-research-synthesizer"]
        T2_CHECK["lu-plan-checker"]
        T2_PM["lu-pm-planner"]
    end

    subgraph T3["Tier 3: Execution"]
        direction TB
        T3_EXEC["lu-executor"]
        T3_DEBUG["lu-debugger"]
        T3_MAP["lu-codebase-mapper"]
    end

    subgraph T4["Tier 4: Verification"]
        direction TB
        T4_VER["lu-verifier"]
        T4_INTEG["lu-integration-checker"]
    end

    subgraph T5["Tier 5: Review"]
        direction TB
        T5_DX["dx-advocate"]
        T5_SIMP["code-simplifier"]
        T5_ARCH["code-architect"]
        T5_SEC["security-auditor"]
        T5_PERF["performance-auditor"]
    end

    subgraph T6["Tier 6: Learning"]
        direction TB
        T6_LEARN["lu-learner"]
    end

    subgraph T7["Tier 7: Ship"]
        direction TB
        T7_DESC["Handled by /lu skill<br/>Commit + PR creation"]
    end

    T0 --> T1 --> T2 --> T3 --> T4 --> T5 --> T6 --> T7
```

---

## 4. Complexity Routing & Gating

```mermaid
flowchart TB
    INPUT["Task Input<br/>(after Git + Cognitive Pre-Flight)"]

    INPUT --> CLASSIFY{"lu-router<br/>Complexity Classification"}

    CLASSIFY -->|"1 file, clear scope"| TRIVIAL
    CLASSIFY -->|"2-3 files, related"| SIMPLE
    CLASSIFY -->|"3-5 files, feature-scoped"| MODERATE
    CLASSIFY -->|"5-10 files, cross-cutting"| COMPLEX
    CLASSIFY -->|"10+ files, architectural"| CRITICAL

    subgraph TRIVIAL["TRIVIAL"]
        direction LR
        TR1["Lite pre-flight"] --> TR2["Direct execute"] --> TR3["Quick verify<br/>(1 fix iter)"]
    end

    subgraph SIMPLE["SIMPLE"]
        direction LR
        SI1["Lite pre-flight"] --> SI2["Direct execute"] --> SI3["Quick verify<br/>(2 fix iters)"]
    end

    subgraph MODERATE["MODERATE"]
        direction LR
        MO1["Full pre-flight"] --> MO2["Quick plan"] --> MO3["Execute"] --> MO4["Standard verify<br/>(3 fix iters)"] --> MO5["Code review<br/>(dx + simplifier)"]
    end

    subgraph COMPLEX["COMPLEX"]
        direction LR
        CX1["Full pre-flight"] --> CX2["Research"] --> CX3["Full plan"] --> CX4["Wave execute"] --> CX5["Full verify<br/>(3 fix iters)"] --> CX6["Full review<br/>(+ architect)"]
    end

    subgraph CRITICAL["CRITICAL"]
        direction LR
        CR1["Full pre-flight"] --> CR2["Required research"] --> CR3["Multi-plan"] --> CR4["Wave execute"] --> CR5["Full + human verify<br/>(5 fix iters)"] --> CR6["All reviewers"]
    end

    TRIVIAL --> LEARN["Learning Capture"]
    SIMPLE --> LEARN
    MODERATE --> LEARN
    COMPLEX --> LEARN
    CRITICAL --> LEARN
    LEARN --> SHIP["Commit + PR"]
```

---

## 5. Memory System & Cognitive Flow

```mermaid
flowchart TB
    subgraph SessionStart["Session Start"]
        LOAD_BRAIN["Load MuninnDB brain tree<br/>(Project identity, stack,<br/>conventions, personality)"]
        RECALL["Selective Recall<br/>from MuninnDB engrams<br/>(Relevant patterns only)"]
        INIT_WORK["Initialize MuninnDB session context<br/>(Fresh session context)"]
    end

    subgraph During["During Workflow"]
        LOG_FINDINGS["Log findings<br/>to MuninnDB session context"]
        LOG_HYPOTHESES["Track hypotheses<br/>(debugging)"]
        LOG_PROGRESS["Note in-progress<br/>decisions"]
    end

    subgraph SessionEnd["Session End"]
        EXTRACT["Extract validated<br/>learnings from MuninnDB session context"]
        CURATE["Curate: only proven<br/>patterns, decisions, pitfalls"]
        UPDATE_MEM["Write to MuninnDB engrams<br/>(append, never overwrite)"]
        CLEAR_WORK["Clear MuninnDB session context"]
    end

    subgraph Persistent["Persistent Across Sessions"]
        BRAIN_FILE["MuninnDB brain tree<br/>Identity | Stack | Conventions"]
        MEMORY_FILE["MuninnDB engrams<br/>Patterns | Decisions<br/>Pitfalls | Preferences"]
    end

    LOAD_BRAIN --> RECALL --> INIT_WORK
    INIT_WORK --> During
    During --> EXTRACT --> CURATE --> UPDATE_MEM
    CURATE --> CLEAR_WORK

    BRAIN_FILE -.->|"Always loaded"| LOAD_BRAIN
    MEMORY_FILE -.->|"Selective recall"| RECALL
    UPDATE_MEM -.->|"Curated writes"| MEMORY_FILE
```

---

## 6. Iterative Execution Loop (Ralph Wiggum Pattern)

```mermaid
flowchart TB
    START["lu-execute-phase<br/>(Loop Controller)"]

    START --> CHECKPOINT["Create Checkpoint<br/>(git tag + JSON snapshot)"]

    CHECKPOINT --> EXECUTE["lu-executor<br/>Execute PLAN wave"]

    EXECUTE --> HARNESS{"Harness Runner<br/>test + typecheck<br/>+ lint + build"}

    HARNESS -->|"All pass"| VERIFY["lu-verifier<br/>Goal-backward check"]
    HARNESS -->|"Failures"| CLASSIFY["Error Classifier<br/>(transient / correctable<br/>/ permanent)"]

    CLASSIFY -->|"Correctable"| BUDGET{"Budget Check<br/>(soft stop @ 80%)"}
    CLASSIFY -->|"Permanent"| ROLLBACK["Rollback to Checkpoint"]

    BUDGET -->|"Under budget"| CONVERGE{"Convergence<br/>Detection<br/>(2-of-3 stale?)"}
    BUDGET -->|"Over budget"| ESCALATE["Escalate to User<br/>(HITL mode)"]

    CONVERGE -->|"Not stale"| EXECUTE
    CONVERGE -->|"Stale"| ESCALATE

    VERIFY -->|"Goals met"| LEARN["lu-learner<br/>Capture findings"]
    VERIFY -->|"Goals not met"| EXECUTE

    ROLLBACK --> ESCALATE

    LEARN --> DONE["Phase Complete"]
```

---

## 7. Usage-Aware Sprint Planner

```mermaid
flowchart TB
    subgraph Input["Inputs"]
        TODOS["Todo Items<br/>(from .planning/todos/)"]
        CONFIG["Planner Config<br/>(session cap, allocations,<br/>cold start costs)"]
        USAGE["Usage Context<br/>(daily/weekly limits)"]
    end

    subgraph Scoring["WSJF Scoring Engine"]
        BIZ["Business Value<br/>(1-10)"]
        TIME["Time Criticality<br/>(1-10)"]
        RISK["Risk Reduction<br/>(1-10)"]
        EFFORT["Effort Estimate<br/>(T-shirt size)"]
        WSJF["WSJF Score =<br/>(Biz + Time + Risk) / Effort"]
    end

    subgraph Scheduling["Session Scheduler"]
        ZONES["Quality Zones<br/>Peak (0-30%) | Good (30-50%)<br/>Declining (50-70%) | Poor (70%+)"]
        ASSIGN["Assign tasks to zones<br/>by complexity + WSJF"]
        SESSION["Session Plan<br/>(ordered task list<br/>within cap)"]
    end

    subgraph Weekly["Weekly Allocation"]
        NEEDLE["Needle Movers (60%)"]
        QUICK["Quick Wins (25%)"]
        MAINT["Maintenance (10%)"]
        RESERVE["Reserve (5%)"]
    end

    subgraph CostModel["Cost Model"]
        COLD["Cold Start Cost<br/>(per complexity)"]
        TOKEN["Token Estimation<br/>(input + output)"]
        DOLLAR["Dollar Cost<br/>(per session)"]
    end

    Input --> Scoring --> Scheduling --> Weekly
    CONFIG --> CostModel
    CostModel -.-> Scheduling
```

---

## 8. Context Tier System

```mermaid
flowchart LR
    subgraph Tiers["Context Tiers"]
        T0["T0: Minimal<br/>Agent name + role only"]
        T1["T1: Warm Start<br/>+ MuninnDB brain tree<br/>+ Selective MEMORY recall"]
        T2["T2: Full<br/>+ MuninnDB session context<br/>+ Project docs<br/>+ Phase plans"]
        T3["T3: Extended<br/>+ Codebase analysis<br/>+ Deep research"]
    end

    subgraph Promotion["Tier Promotion Rules"]
        RULE1["TRIVIAL/SIMPLE<br/>complexity = T0-T1"]
        RULE2["MODERATE<br/>complexity = T1-T2"]
        RULE3["COMPLEX/CRITICAL<br/>complexity = T2-T3"]
        RULE4["High risk intuition<br/>flags = Upgrade +1 tier"]
    end

    subgraph Isolation["Sub-Agent Isolation"]
        WARM["Warm Isolation<br/>Shared memory, scoped docs"]
        COLD["Cold Isolation<br/>Fresh context per agent"]
        NONE["No Isolation<br/>Full shared context"]
    end

    Tiers --> Promotion
    Promotion --> Isolation
```

---

## 9. Build & Drift Detection Pipeline

```mermaid
flowchart LR
    subgraph Source["src/ (Source of Truth)"]
        AGENTS_SRC["agents/*.agent.ts"]
        SKILLS_SRC["skills/*.skill.ts"]
        RULES_SRC["rules/*.rule.ts"]
        HOOKS_SRC["hooks/scripts/*.sh"]
    end

    subgraph Compilers["compilers/"]
        CURSOR_COMP["cursor.compiler.ts"]
        CLAUDE_COMP["claude.compiler.ts"]
    end

    subgraph Output["Generated (never edit)"]
        CURSOR_OUT[".cursor/<br/>agents/ | skills/<br/>rules/ | hooks/"]
        CLAUDE_OUT[".claude/<br/>rules/"]
    end

    subgraph Guard["Drift Detection"]
        CHECK["bun run check:drift"]
        HOOK["pre-commit-drift-check.sh"]
        BLOCK["Block commit if<br/>generated != compiled(src)"]
    end

    Source -->|"bun run build:all"| Compilers --> Output
    Output --> Guard
    Source --> Guard
```

---

## 10. End-to-End Request Lifecycle

```mermaid
sequenceDiagram
    participant U as User
    participant LU as /lu Skill
    participant J as Jira MCP
    participant GH as GitHub CLI
    participant COG as lu-cognition
    participant R as lu-router
    participant P as lu-planner
    participant E as lu-executor
    participant H as Harness
    participant V as lu-verifier
    participant RV as Review Agents
    participant L as lu-learner
    participant MEM as MuninnDB engrams

    U->>LU: /lu TICKET-123

    rect rgb(255, 245, 235)
        Note over LU,GH: Step 0: Git Context
        LU->>J: Fetch ticket details
        J-->>LU: Summary, type, priority
        LU->>GH: gh issue create
        GH-->>LU: Issue #42
        LU->>GH: git checkout -b TICKET-123--desc
        LU->>LU: Update STATE.md
    end

    rect rgb(235, 245, 255)
        Note over COG,R: Step 1: Cognitive Pre-Flight
        LU->>COG: Load context
        COG->>COG: Read MuninnDB brain tree
        COG->>MEM: Selective recall
        MEM-->>COG: Relevant patterns
        COG->>COG: Init MuninnDB session context
        COG->>COG: Intuition check
        COG-->>R: Cognitive report
        R-->>LU: MODERATE complexity
    end

    rect rgb(245, 235, 255)
        Note over P,E: Steps 2-3: Plan + Execute
        LU->>P: Plan phase
        P-->>LU: PLAN-01.md
        LU->>E: Execute plan

        loop For each task
            E->>E: Execute actions
            E->>E: Atomic commit
        end

        E-->>LU: Execution complete
    end

    rect rgb(235, 255, 235)
        Note over H,RV: Step 4: Verify (ALWAYS)
        LU->>H: Run harness
        H->>H: test + typecheck + lint + build
        H-->>LU: All pass
        LU->>V: Verify goals
        V->>V: EXISTS / SUBSTANTIVE / WIRED
        V-->>LU: Goals met
        LU->>RV: Code review
        RV-->>LU: Approved
    end

    rect rgb(255, 255, 235)
        Note over L,MEM: Step 5: Learn + Ship
        LU->>L: Capture learnings
        L->>MEM: Curated patterns + decisions
        L->>L: Clear MuninnDB session context
        LU->>GH: Commit changes
        LU->>U: Ready for PR?
        U->>LU: Yes
        LU->>GH: gh pr create
        GH-->>LU: PR #99
    end

    LU->>U: Done! PR #99 created
```

---

## 11. .planning/ State File Organization

```mermaid
flowchart TB
    subgraph Planning[".planning/"]
        subgraph Identity["Project Identity (Persistent)"]
            BRAIN["MuninnDB brain tree<br/>Stack, conventions,<br/>personality"]
            PROJECT["PROJECT.md<br/>Vision, scope,<br/>constraints"]
        end

        subgraph Memory["Memory (Persistent)"]
            MEM["MuninnDB engrams<br/>Patterns, decisions,<br/>pitfalls, preferences"]
        end

        subgraph Session["Session State"]
            STATE["STATE.md<br/>Current focus, git context,<br/>cognitive state, blockers"]
            WORKING["MuninnDB session context<br/>Current task, findings,<br/>hypotheses, notes"]
            CONFIG["config.json<br/>Harness, iteration,<br/>complexity, planner"]
        end

        subgraph Structure["Project Structure"]
            REQS["REQUIREMENTS.md"]
            ROADMAP["ROADMAP.md"]
        end

        subgraph Phases["phases/"]
            PH_N["phase-N/"]
            PLANS["PLAN-*.md"]
            SUMMARIES["SUMMARY-*.md"]
            VERIFICATION["VERIFICATION.md"]
            LEARNINGS["LEARNINGS.md"]
            CONTEXT["CONTEXT.md"]
            RESEARCH["RESEARCH.md"]
        end

        subgraph Utilities["Utilities"]
            TODOS["todos/"]
            DEBUG["debug/"]
            CODEBASE["codebase/"]
            QUICK["quick/"]
            MILESTONES["milestones/"]
        end
    end

    Identity --> Session --> Structure --> Phases
    Memory -.->|"Recalled at<br/>session start"| Session
    Phases -.->|"Learnings<br/>extracted"| Memory
```

---

## 12. Harness Verification Pipeline

```mermaid
flowchart LR
    subgraph Checks["Harness Checks"]
        TEST["bun test<br/>(bun-test parser)"]
        TSC["bunx --bun tsc<br/>(tsc parser)"]
        LINT["eslint<br/>(eslint parser)"]
        BUILD["bun run build:all<br/>(generic parser)"]
    end

    subgraph Runner["Harness Runner"]
        RUN["Run all checks<br/>in sequence"]
        PARSE["Parse structured<br/>output per check"]
        AGG["Aggregate results<br/>(CheckResult[])"]
    end

    subgraph Decision["Decision"]
        PASS{"All pass?"}
        YES["Proceed to<br/>lu-verifier"]
        NO["Spawn fix executor<br/>(max N iterations)"]
    end

    Checks --> Runner --> PASS
    PASS -->|"Yes"| YES
    PASS -->|"No"| NO
    NO -->|"Re-run"| Runner
```
