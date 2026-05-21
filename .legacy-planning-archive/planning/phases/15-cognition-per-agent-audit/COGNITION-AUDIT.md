# Phase 15: Cognition Per-Agent Audit Report

**Date:** 2026-02-11
**Scope:** All 25 agents in `.claude/agents/`, cognition system (BRAIN/MEMORY/WORKING), tier classification
**Delivers:** COGN-01 (current-state audit matrix), COGN-02 (ideal-state profiles + gap analysis), COGN-03 (tier system definition)

---

## 1. Executive Summary

- **7 of 25 agents** (28%) have any cognition references in their definitions; the remaining **18 agents** (72%) are fully stateless with zero BRAIN/MEMORY/WORKING/pre-flight/learning references.
- **3 critical gaps** exist where high-impact agents operate without cognition: lu-phase-researcher, lu-plan-checker, and lu-pr-reviewer are completely stateless despite roles that would benefit from memory recall.
- **3 agents are better than research estimated**: lu-planner (has full cognitive pre-flight with BRAIN+MEMORY+WORKING), lu-executor (has WORKING.md writes + lu-learner invocation), and lu-verifier (passes results to lu-learner for MEMORY.md extraction). The 15-RESEARCH.md audit classified these as T0 but spot-check verification revealed they already have cognition wiring.
- **The cognition system is binary, not tiered**: Currently lu-cognition runs identical lite/full pre-flight for ALL agents. No per-agent tuning exists. The 4-tier system (T0-T3) proposed here formalizes the implicit tiers already present.
- **14 domain tags** are recommended for selective MEMORY.md recall, enabling agents to receive only relevant past context rather than keyword-filtered results from the entire memory store.

---

## 2. Tier System Definition (COGN-03)

### 2.1 Tier Capabilities Matrix

| Capability                  | T0 (Stateless) | T1 (Memory-Reader)        | T2 (Session-Aware)            | T3 (Fully-Cognitive)           |
| --------------------------- | -------------- | ------------------------- | ----------------------------- | ------------------------------ |
| **BRAIN.md loading**        | No             | No                        | No                            | YES                            |
| **MEMORY.md recall (read)** | No             | YES                       | YES                           | YES                            |
| **MEMORY.md write**         | No             | No                        | No                            | YES                            |
| **WORKING.md read**         | No             | No                        | YES                           | YES                            |
| **WORKING.md write**        | No             | No                        | YES                           | YES                            |
| **Cognitive pre-flight**    | Skipped        | Receives recalled entries | Receives recalled entries     | Receives full cognitive report |
| **Learning contribution**   | No             | No                        | Logs candidates to WORKING.md | Triggers lu-learner extraction |
| **Intuition flags**         | No             | No                        | No                            | YES                            |
| **Context overhead**        | 0 tokens       | ~200-500 tokens           | ~500-1000 tokens              | ~1000-2000 tokens              |

### 2.2 Tier Descriptions

**T0 -- Stateless**
Agent operates without cognition system involvement. Receives context exclusively from its caller (orchestrator, user, or parent agent). lu-cognition skips this agent entirely. Zero context overhead. Appropriate for short review agents, deterministic checkers, and agents where fresh perspective is preferred over memory-informed perspective.

**T1 -- Memory-Reader**
Agent receives recalled entries from lu-cognition as a `### Relevant Context` block injected into its prompt. Entries are filtered by the agent's `memory_tags` and scored by keyword relevance. Agent does NOT write to WORKING.md or contribute learnings. Read-only memory access with no session tracking.

**T2 -- Session-Aware**
Everything from T1, plus the agent writes findings to WORKING.md `## Immediate Findings` section and logs candidate learnings to `## Pre-Learning Extraction` section. Maintains session state that informs downstream agents. Does not trigger learning extraction directly -- candidates are picked up by lu-learner at phase boundaries.

**T3 -- Fully-Cognitive**
Everything from T2, plus the agent loads BRAIN.md for project identity context, can trigger lu-learner invocation for immediate learning extraction, has full intuition check support, and participates in the complete cognitive loop (read + write + learn). Reserved for agents that orchestrate cognition or whose output directly shapes the learning corpus.

### 2.3 Tier Ordering

Following the pattern established in `src/complexity/types.ts` with `COMPLEXITY_ORDER`:

```
T0 = 0 (Stateless)
T1 = 1 (Memory-Reader)
T2 = 2 (Session-Aware)
T3 = 3 (Fully-Cognitive)
```

Tier comparison uses numeric ordering for threshold checks (e.g., `effectiveTier >= T1` means memory recall is active).

---

## 3. Current-State Audit Matrix (COGN-01)

### 3.1 Audit Methodology

Each of the 25 agent `.md` files in `.claude/agents/` was searched for 5 cognition features using exact and pattern-based string matching. Results from 15-RESEARCH.md were used as the primary data source, then **every agent was spot-checked directly** via grep for the following terms: `BRAIN`, `MEMORY`, `WORKING`, `cognit`, `pre-flight`, `lu-learner`, `lu-cognition`, `pattern`, `recall`.

**Verification corrections**: The research (15-RESEARCH.md) classified lu-planner, lu-executor, and lu-verifier as T0. Direct spot-check revealed all three have cognition references. The audit matrix below reflects the corrected, verified state.

### 3.2 Full 25-Agent Audit Matrix

| #   | Agent                   | File                       | Lines | BRAIN | MEMORY   | WORKING | Pre-flight   | Learning     | Current Tier | Notes                                                                                                                                                                                                                |
| --- | ----------------------- | -------------------------- | ----- | ----- | -------- | ------- | ------------ | ------------ | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | lu-cognition            | lu-cognition.md            | 459   | YES   | YES      | YES     | IS_PREFLIGHT | NO           | **T3**       | The pre-flight agent itself. Loads BRAIN, recalls MEMORY, initializes WORKING. Does not extract learnings (that is lu-learner's role).                                                                               |
| 2   | lu-debugger             | lu-debugger.md             | 1313  | NO    | YES      | YES     | RECEIVES     | YES          | **T3**       | Has explicit `<memory_aided_debugging>` section. Recalls pitfalls, writes findings to WORKING, contributes candidate learnings. Most complex agent by line count.                                                    |
| 3   | lu-learner              | lu-learner.md              | 547   | NO    | YES      | YES     | NO           | IS_EXTRACTOR | **T2**       | The learning extraction agent. Reads WORKING.md candidates, writes validated entries to MEMORY.md. Does not receive pre-flight (invoked post-execution).                                                             |
| 4   | lu-planner              | lu-planner.md              | 205   | YES   | YES      | YES     | YES          | NO           | **T2**       | Has full `<cognitive_pre_flight>` section: loads BRAIN.md, selective recall from MEMORY.md, initializes WORKING.md. Does not extract learnings. **Corrected from T0 in research.**                                   |
| 5   | lu-executor             | lu-executor.md             | 314   | NO    | NO       | YES     | NO           | YES          | **T2**       | Maintains WORKING.md as session log during execution. Invokes lu-learner after verification passes. Logs findings and candidate patterns. **Corrected from T0 in research.**                                         |
| 6   | lu-verifier             | lu-verifier.md             | 960   | NO    | NO       | NO      | NO           | INDIRECT     | **T1**       | Passes verification results to lu-learner, which extracts learnings to MEMORY.md. Does not write WORKING.md directly. MEMORY references are indirect (via lu-learner invocation). **Corrected from T0 in research.** |
| 7   | lu-router               | lu-router.md               | 539   | NO    | INDIRECT | NO      | RECEIVES     | NO           | **T1**       | Receives cognitive report from lu-cognition. Uses intuition flags and memory-informed classification. Does not write WORKING or MEMORY.                                                                              |
| 8   | lu-phase-researcher     | lu-phase-researcher.md     | 669   | NO    | NO       | NO      | NO           | NO           | **T0**       | No cognition references. Researches phase context from codebase and external sources.                                                                                                                                |
| 9   | lu-project-researcher   | lu-project-researcher.md   | 899   | NO    | NO       | NO      | NO           | NO           | **T0**       | No cognition references. Initial project research agent.                                                                                                                                                             |
| 10  | lu-research-synthesizer | lu-research-synthesizer.md | 265   | NO    | NO       | NO      | NO           | NO           | **T0**       | No cognition references. Synthesizes research outputs.                                                                                                                                                               |
| 11  | lu-roadmapper           | lu-roadmapper.md           | 634   | NO    | NO       | NO      | NO           | NO           | **T0**       | No cognition references. "Memory" appears only as "project memory" (STATE.md context).                                                                                                                               |
| 12  | lu-plan-checker         | lu-plan-checker.md         | 801   | NO    | NO       | NO      | NO           | NO           | **T0**       | No cognition references. Validates plan structure and wave dependencies.                                                                                                                                             |
| 13  | lu-integration-checker  | lu-integration-checker.md  | 415   | NO    | NO       | NO      | NO           | NO           | **T0**       | No cognition references. Verifies inter-plan connections.                                                                                                                                                            |
| 14  | lu-codebase-mapper      | lu-codebase-mapper.md      | 767   | NO    | NO       | NO      | NO           | NO           | **T0**       | No cognition references. Exploratory codebase analysis.                                                                                                                                                              |
| 15  | lu-pr-reviewer          | lu-pr-reviewer.md          | 544   | NO    | NO       | NO      | NO           | NO           | **T0**       | No cognition references. Reviews GitHub PR comments.                                                                                                                                                                 |
| 16  | code-architect          | code-architect.md          | 48    | NO    | NO       | NO      | NO           | NO           | **T0**       | Short review agent. Evaluates code architecture decisions.                                                                                                                                                           |
| 17  | code-developer          | code-developer.md          | 54    | NO    | NO       | NO      | NO           | NO           | **T0**       | Short review agent. Reviews implementation quality.                                                                                                                                                                  |
| 18  | code-simplifier         | code-simplifier.md         | 98    | NO    | NO       | NO      | NO           | NO           | **T0**       | Short review agent. Identifies simplification opportunities.                                                                                                                                                         |
| 19  | dx-advocate             | dx-advocate.md             | 50    | NO    | NO       | NO      | NO           | NO           | **T0**       | Short review agent. Reviews developer experience.                                                                                                                                                                    |
| 20  | performance-auditor     | performance-auditor.md     | 44    | NO    | NO       | NO      | NO           | NO           | **T0**       | Short review agent. Identifies performance bottlenecks.                                                                                                                                                              |
| 21  | security-auditor        | security-auditor.md        | 42    | NO    | NO       | NO      | NO           | NO           | **T0**       | Short review agent. Reviews security vulnerabilities. Shortest agent by line count.                                                                                                                                  |
| 22  | product                 | product.md                 | 53    | NO    | NO       | NO      | NO           | NO           | **T0**       | Analysis agent. Scopes product requirements.                                                                                                                                                                         |
| 23  | qa-plan-generator       | qa-plan-generator.md       | 84    | NO    | NO       | NO      | NO           | NO           | **T0**       | Generates QA test plans from PR diffs.                                                                                                                                                                               |
| 24  | ui                      | ui.md                      | 54    | NO    | NO       | NO      | NO           | NO           | **T0**       | Short review agent. Reviews visual design consistency.                                                                                                                                                               |
| 25  | ux                      | ux.md                      | 54    | NO    | NO       | NO      | NO           | NO           | **T0**       | Short review agent. Reviews user experience and accessibility.                                                                                                                                                       |

### 3.3 Current-State Distribution

| Tier                 | Count | Agents                              | % of Total |
| -------------------- | ----- | ----------------------------------- | ---------- |
| T3 (Fully-Cognitive) | 2     | lu-cognition, lu-debugger           | 8%         |
| T2 (Session-Aware)   | 3     | lu-learner, lu-planner, lu-executor | 12%        |
| T1 (Memory-Reader)   | 2     | lu-verifier, lu-router              | 8%         |
| T0 (Stateless)       | 18    | All others                          | 72%        |

### 3.4 Key Findings

1. **Research accuracy correction**: The 15-RESEARCH.md classified lu-planner, lu-executor, and lu-verifier as T0. Direct verification found lu-planner has a full `<cognitive_pre_flight>` section (BRAIN+MEMORY+WORKING), lu-executor has WORKING.md session logging + lu-learner invocation, and lu-verifier has lu-learner integration for learning extraction. This shifts 3 agents from T0 to T1/T2.

2. **The 18 stateless agents fall into two categories**:
   - **Short review agents** (42-98 lines, 10 agents): code-architect, code-developer, code-simplifier, dx-advocate, performance-auditor, security-auditor, product, qa-plan-generator, ui, ux. These are rule-following agents with no benefit from memory.
   - **Medium/long pipeline agents** (265-899 lines, 8 agents): lu-phase-researcher, lu-project-researcher, lu-research-synthesizer, lu-roadmapper, lu-plan-checker, lu-integration-checker, lu-codebase-mapper, lu-pr-reviewer. Some of these would benefit from memory recall.

3. **lu-debugger is the most cognition-rich agent** (1313 lines) with explicit `<memory_aided_debugging>` including pitfall recall, hypothesis testing against past patterns, and candidate learning contribution.

4. **No agent currently uses tag-based memory filtering**. All memory recall goes through lu-cognition's keyword-based scoring without domain-specific filtering.

---

## 4. Ideal-State Cognition Profiles (COGN-02)

### 4.1 Tier Assignment Criteria

**T3 (Fully-Cognitive) assignment requires all of:**

- Participates in full cognitive loop (read + write + learn)
- Manages or orchestrates cognition for other agents
- Agent output directly shapes the learning corpus

**T2 (Session-Aware) assignment requires:**

- Writes code or creates artifacts that benefit from memory recall
- Maintains session state that informs downstream agents
- Agent output quality demonstrably improves with past context

**T1 (Memory-Reader) assignment requires:**

- Validates or reviews work where past patterns inform quality
- Receives decisions/pitfalls that prevent repeated mistakes
- Read-only memory access with no session tracking needed

**T0 (Stateless) assignment criteria:**

- Pure rule-following with no benefit from historical context
- Short review agents following design system rules
- Fresh perspective is preferred over memory-informed perspective
- Deterministic checks that do not benefit from past experience

### 4.2 Recommended Agent Profiles

| #   | Agent                   | Current Tier | Recommended Tier | Promotable To | Memory Tags                                             | Rationale                                                                                                                                            |
| --- | ----------------------- | ------------ | ---------------- | ------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | lu-cognition            | T3           | **T3**           | T3 (max)      | `["*"]`                                                 | IS the pre-flight agent. Needs access to all memory domains to serve any agent.                                                                      |
| 2   | lu-debugger             | T3           | **T3**           | T3 (max)      | `["debugging", "pitfalls", "testing"]`                  | Already fully cognitive. Memory-aided debugging is its core capability.                                                                              |
| 3   | lu-learner              | T2           | **T2**           | T3            | `["patterns", "decisions", "pitfalls"]`                 | Extracts learnings. Does not need BRAIN.md for extraction. T3 promotion at CRITICAL enables richer extraction.                                       |
| 4   | lu-planner              | T2           | **T2**           | T3            | `["architecture", "planning", "decisions", "patterns"]` | Already has cognitive pre-flight. Keep T2; promote to T3 at COMPLEX/CRITICAL for full learning integration.                                          |
| 5   | lu-executor             | T2           | **T2**           | T3            | `["coding", "patterns", "pitfalls", "conventions"]`     | Already has WORKING.md + lu-learner invocation. Promote to T3 at COMPLEX/CRITICAL to load BRAIN.md for conventions.                                  |
| 6   | lu-verifier             | T1           | **T1**           | T2            | `["verification", "pitfalls", "testing"]`               | Currently passes results to lu-learner but does not recall memory or write WORKING. Promote to T2 at COMPLEX for pitfall recall during verification. |
| 7   | lu-router               | T1           | **T1**           | T2            | `["architecture", "complexity"]`                        | Receives cognitive report, uses for classification. Promote to T2 at COMPLEX to maintain session state.                                              |
| 8   | lu-phase-researcher     | T0           | **T1**           | T1 (max)      | `["stack", "architecture"]`                             | Should recall past technology decisions and research findings to avoid re-investigating settled questions.                                           |
| 9   | lu-project-researcher   | T0           | **T0**           | T1            | `[]`                                                    | Initial project research. Fresh perspective preferred. Promotable to T1 at CRITICAL for baseline context.                                            |
| 10  | lu-research-synthesizer | T0           | **T0**           | T0 (max)      | `[]`                                                    | Synthesizes current research outputs. Memory not relevant to synthesis quality.                                                                      |
| 11  | lu-roadmapper           | T0           | **T0**           | T1            | `[]`                                                    | Creates roadmaps from requirements. Fresh perspective preferred. Promotable to T1 at CRITICAL.                                                       |
| 12  | lu-plan-checker         | T0           | **T1**           | T1 (max)      | `["planning", "pitfalls"]`                              | Validates plans. Recalling past plan-checker findings (wave dependency conflicts, missing must-haves) would improve validation.                      |
| 13  | lu-integration-checker  | T0           | **T0**           | T0 (max)      | `[]`                                                    | Verifies connections. Deterministic checks do not benefit from memory.                                                                               |
| 14  | lu-codebase-mapper      | T0           | **T0**           | T0 (max)      | `[]`                                                    | Exploratory agent. Fresh exploration without memory bias is desirable.                                                                               |
| 15  | lu-pr-reviewer          | T0           | **T1**           | T1 (max)      | `["conventions", "patterns"]`                           | Reviews PR comments. Recalling team conventions and past review patterns improves response quality.                                                  |
| 16  | code-architect          | T0           | **T0**           | T1            | `[]`                                                    | Short review agent. Follows architecture rules. Promotable to T1 at CRITICAL for convention recall.                                                  |
| 17  | code-developer          | T0           | **T0**           | T1            | `[]`                                                    | Short review agent. Follows implementation rules. Promotable to T1 at CRITICAL.                                                                      |
| 18  | code-simplifier         | T0           | **T0**           | T0 (max)      | `[]`                                                    | Short review agent. Fresh perspective on simplification is preferred.                                                                                |
| 19  | dx-advocate             | T0           | **T0**           | T0 (max)      | `[]`                                                    | Short review agent. DX assessment benefits from fresh eyes.                                                                                          |
| 20  | performance-auditor     | T0           | **T0**           | T1            | `[]`                                                    | Short review agent. Promotable to T1 at CRITICAL for performance pattern recall.                                                                     |
| 21  | security-auditor        | T0           | **T0**           | T1            | `[]`                                                    | Short review agent. Promotable to T1 at CRITICAL for security pitfall recall.                                                                        |
| 22  | product                 | T0           | **T0**           | T0 (max)      | `[]`                                                    | Analysis agent. Requirements-driven, not memory-driven.                                                                                              |
| 23  | qa-plan-generator       | T0           | **T0**           | T0 (max)      | `[]`                                                    | Generates test plans from diffs. Deterministic process.                                                                                              |
| 24  | ui                      | T0           | **T0**           | T0 (max)      | `[]`                                                    | Short review agent. Design-system driven.                                                                                                            |
| 25  | ux                      | T0           | **T0**           | T0 (max)      | `[]`                                                    | Short review agent. Standards-driven.                                                                                                                |

### 4.3 Recommended Distribution

| Tier                 | Count | Agents                                                                       | % of Total |
| -------------------- | ----- | ---------------------------------------------------------------------------- | ---------- |
| T3 (Fully-Cognitive) | 2     | lu-cognition, lu-debugger                                                    | 8%         |
| T2 (Session-Aware)   | 3     | lu-learner, lu-planner, lu-executor                                          | 12%        |
| T1 (Memory-Reader)   | 5     | lu-verifier, lu-router, lu-phase-researcher, lu-plan-checker, lu-pr-reviewer | 20%        |
| T0 (Stateless)       | 15    | All others                                                                   | 60%        |

---

## 5. Gap Analysis (COGN-02)

### 5.1 Critical Gaps (Tier Delta >= 2 or High Impact Agent)

No agent has a tier delta >= 2 between current and recommended state (the research corrections narrowed the gaps). However, three agents have high impact and a delta of 1:

| Agent               | Current | Recommended | Delta | Missing Features | Business Impact                                                                                                                                                                                                                                                      |
| ------------------- | ------- | ----------- | ----- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| lu-phase-researcher | T0      | T1          | +1    | MEMORY recall    | Researches before every planning phase. Without memory recall, re-investigates settled technology decisions and repeats research that MEMORY.md already contains. At 669 lines, it is a substantial agent that would benefit from past stack/architecture decisions. |
| lu-plan-checker     | T0      | T1          | +1    | MEMORY recall    | Validates every plan before execution. Without memory recall, cannot leverage past plan-checker findings (e.g., wave dependency conflicts, missing verification criteria). Phase 14 AUDIT-REPORT identified verification gaps that memory could help prevent.        |
| lu-pr-reviewer      | T0      | T1          | +1    | MEMORY recall    | Reviews PR comments and team conventions. Without memory recall, cannot leverage established team patterns, which leads to inconsistent review quality across sessions.                                                                                              |

### 5.2 Moderate Gaps (Tier Delta == 1, Medium Impact)

These agents are at correct tier currently but the **recommended tier includes a promotable-to ceiling** that enables them to benefit from complexity-driven promotion:

| Agent       | Current | Recommended | Promotable To | Notes                                                                                                                                                |
| ----------- | ------- | ----------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| lu-verifier | T1      | T1          | T2            | Already at recommended default. Promotion to T2 at COMPLEX would add WORKING.md writes and pitfall logging. Should be addressed after critical gaps. |
| lu-router   | T1      | T1          | T2            | Already at recommended default. Promotion to T2 at COMPLEX would add session state tracking. Deferred -- current T1 is sufficient.                   |
| lu-learner  | T2      | T2          | T3            | Already at recommended default. Promotion to T3 at CRITICAL would add BRAIN.md loading for richer extraction context. Deferred.                      |
| lu-planner  | T2      | T2          | T3            | Already at recommended default. Promotion to T3 at CRITICAL would add full learning trigger capability. Deferred.                                    |
| lu-executor | T2      | T2          | T3            | Already at recommended default. Promotion to T3 at CRITICAL would add BRAIN.md loading for convention awareness. Deferred.                           |

### 5.3 No Change Needed (Agent at Correct Tier)

| Agent                   | Tier | Rationale                                                              |
| ----------------------- | ---- | ---------------------------------------------------------------------- |
| lu-cognition            | T3   | IS the pre-flight agent. Maximum cognition by definition.              |
| lu-debugger             | T3   | Already fully cognitive with `<memory_aided_debugging>`.               |
| lu-project-researcher   | T0   | Initial project research. Fresh perspective preferred.                 |
| lu-research-synthesizer | T0   | Synthesizes current research. Memory not relevant.                     |
| lu-roadmapper           | T0   | Creates roadmaps from requirements. Fresh perspective preferred.       |
| lu-integration-checker  | T0   | Deterministic connection verification. Memory not beneficial.          |
| lu-codebase-mapper      | T0   | Exploratory analysis. Memory could cause confirmation bias.            |
| code-architect          | T0   | Short review agent (48 lines). Follows rules, not memory.              |
| code-developer          | T0   | Short review agent (54 lines). Follows rules, not memory.              |
| code-simplifier         | T0   | Short review agent (98 lines). Fresh perspective on simplification.    |
| dx-advocate             | T0   | Short review agent (50 lines). DX assessment benefits from fresh eyes. |
| performance-auditor     | T0   | Short review agent (44 lines). Follows performance checklist.          |
| security-auditor        | T0   | Short review agent (42 lines). Follows OWASP checklist.                |
| product                 | T0   | Analysis agent (53 lines). Requirements-driven.                        |
| qa-plan-generator       | T0   | Test plan generator (84 lines). Diff-driven, deterministic.            |
| ui                      | T0   | Short review agent (54 lines). Design-system driven.                   |
| ux                      | T0   | Short review agent (54 lines). Standards-driven.                       |

---

## 6. Distribution Summary

### 6.1 Current vs Recommended Tier Distribution

| Tier                 | Current Count | Recommended Count | Delta  |
| -------------------- | ------------- | ----------------- | ------ |
| T3 (Fully-Cognitive) | 2             | 2                 | 0      |
| T2 (Session-Aware)   | 3             | 3                 | 0      |
| T1 (Memory-Reader)   | 2             | 5                 | **+3** |
| T0 (Stateless)       | 18            | 15                | **-3** |
| **Total**            | **25**        | **25**            | --     |

### 6.2 Movement Summary

- **3 agents promoted from T0 to T1**: lu-phase-researcher, lu-plan-checker, lu-pr-reviewer
- **0 agents change within T1/T2/T3**: All agents with existing cognition features are already at their recommended default tier
- **5 agents gain promotable-to ceilings**: lu-verifier (T2), lu-router (T2), lu-learner (T3), lu-planner (T3), lu-executor (T3)
- **7 agents gain promotable-to T1 from T0**: lu-project-researcher, lu-roadmapper, code-architect, code-developer, performance-auditor, security-auditor (at CRITICAL complexity only)

### 6.3 Context Budget Impact

| Scenario             | Agents with Memory                                                                                          | Est. Extra Tokens | Impact                            |
| -------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------- | --------------------------------- |
| Current state        | 4 agents (cognition, debugger, planner, router)                                                             | ~1500-3500        | Baseline                          |
| Recommended defaults | 7 agents (+phase-researcher, plan-checker, pr-reviewer)                                                     | ~2100-5000        | +600-1500 tokens                  |
| COMPLEX promotion    | 9 agents (+verifier, router T2)                                                                             | ~3100-7000        | +1600-3500 tokens                 |
| CRITICAL promotion   | 14 agents (+project-researcher, roadmapper, code-architect, code-developer, perf-auditor, security-auditor) | ~4700-10000       | Manageable within context budgets |

---

## 7. Memory Tag Vocabulary

### 7.1 Core Domain Tags (14 tags)

| Tag            | Domain                                   | Description                                             | Example MEMORY.md Entries                                                    |
| -------------- | ---------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `coding`       | Code patterns, implementation approaches | Approaches to writing code, API patterns, library usage | "Dual-package CLI pattern", "Zod safeParse at API boundaries"                |
| `patterns`     | Validated development patterns           | Reusable approaches that have been proven to work       | "Wave-based parallelization", "Registry pattern for diverse toolchains"      |
| `pitfalls`     | Known issues and gotchas                 | Problems encountered and how to avoid them              | "`\|\| true` swallows exit codes", "Bun.spawn has no built-in timeout"       |
| `conventions`  | Project conventions                      | Agreed-upon standards and naming patterns               | "No raw JSON.parse on external data", "YAML generation via js-yaml"          |
| `architecture` | System design and structure              | Structural decisions about how components fit together  | "Template architecture separation", "Layered verification"                   |
| `planning`     | Plan structure and validation            | How plans are structured, validated, and organized      | "Wave restructuring from dependency analysis", "Plan-checker bug prevention" |
| `verification` | Testing and verification                 | How code is verified, tested, and validated             | "Verification signal taxonomy (T1-T4)", "Specification anchoring"            |
| `testing`      | Test patterns and tooling                | Specific test patterns, test setup, bun test usage      | "Parser registry for diverse toolchains", "bun test patterns"                |
| `debugging`    | Bug investigation patterns               | How to diagnose and fix bugs effectively                | "Memory-aided debugging", pitfall recall during investigation                |
| `stack`        | Technology choices                       | Which technologies are used and why                     | "UnJS ecosystem for CLI", "Bun.spawn quirks"                                 |
| `security`     | Security patterns and concerns           | Security practices and vulnerability prevention         | "EJS restriction", "Credential sanitization"                                 |
| `performance`  | Performance optimization                 | How to optimize for speed and resource usage            | "Surgical performance optimization", "Lazy loading"                          |
| `decisions`    | Architectural decisions                  | Past choices with rationale for why they were made      | All entries in the Decisions section of MEMORY.md                            |
| `complexity`   | Complexity gating system                 | How complexity is classified and gates behavior         | "N-level to M-tier compression", "Self-gating agents via always-apply rules" |

### 7.2 Tag Assignment Rules

1. Each MEMORY.md entry should have 1-3 tags (avoid over-tagging)
2. Tags are broad domain categories; keyword matching handles specificity within a domain
3. The `*` wildcard means "all tags" (used only by lu-cognition)
4. Entries without tags (legacy) are included in ALL agent recalls for backward compatibility
5. lu-learner assigns tags at extraction time based on the domain vocabulary above
6. lu-learner may propose new tags when none fit, but new tags require documentation in this vocabulary

### 7.3 Agent-to-Tag Mapping

| Agent               | Memory Tags                                             | Reasoning                                                                           |
| ------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| lu-cognition        | `["*"]`                                                 | Serves all agents; needs access to entire memory store                              |
| lu-debugger         | `["debugging", "pitfalls", "testing"]`                  | Bug investigation benefits from known pitfalls and test patterns                    |
| lu-learner          | `["patterns", "decisions", "pitfalls"]`                 | Extraction quality improves with awareness of existing entry patterns               |
| lu-planner          | `["architecture", "planning", "decisions", "patterns"]` | Plan creation benefits from past architectural decisions and planning patterns      |
| lu-executor         | `["coding", "patterns", "pitfalls", "conventions"]`     | Code writing benefits from coding patterns, known pitfalls, and project conventions |
| lu-verifier         | `["verification", "pitfalls", "testing"]`               | Verification benefits from past pitfalls and test/verification patterns             |
| lu-router           | `["architecture", "complexity"]`                        | Routing decisions informed by past architectural patterns and complexity history    |
| lu-phase-researcher | `["stack", "architecture"]`                             | Research benefits from knowing settled technology decisions                         |
| lu-plan-checker     | `["planning", "pitfalls"]`                              | Plan validation benefits from past planning failures and pitfalls                   |
| lu-pr-reviewer      | `["conventions", "patterns"]`                           | PR review benefits from team conventions and established patterns                   |

---

## 8. Tier Promotion Rules

### 8.1 How Promotion Works

Complexity-driven promotion elevates an agent's effective tier during high-complexity tasks. The process:

1. **Read agent's `default_tier`** from its cognition config (compiled into .md frontmatter)
2. **Check current complexity level** from STATE.md or `--complexity` flag
3. **Look up `cognitionPromotions`** in the complexity matrix for that level
4. **Apply promotion** if the complexity level has a promotion for the agent's current tier
5. **Cap at `promotable_to` ceiling** -- promotion cannot exceed the agent's maximum tier

### 8.2 Promotion Matrix

| Complexity Level | T0 ->  | T1 ->  | T2 ->  | T3 -> |
| ---------------- | ------ | ------ | ------ | ----- |
| TRIVIAL          | T0     | T1     | T2     | T3    |
| SIMPLE           | T0     | T1     | T2     | T3    |
| MODERATE         | T0     | T1     | T2     | T3    |
| COMPLEX          | T0     | **T2** | **T3** | T3    |
| CRITICAL         | **T1** | **T2** | **T3** | T3    |

**Note:** Promotions are capped by each agent's `promotable_to` field. An agent with `promotable_to: T0` stays at T0 even at CRITICAL complexity.

### 8.3 Promotion Examples

**Example 1: lu-verifier at COMPLEX task**

- Default tier: T1
- COMPLEX promotes T1 -> T2
- Promotable to: T2
- Effective tier: **T2** (promoted, within ceiling)
- Effect: lu-verifier now writes findings to WORKING.md and recalls verification pitfalls

**Example 2: code-simplifier at CRITICAL task**

- Default tier: T0
- CRITICAL promotes T0 -> T1
- Promotable to: T0 (max)
- Effective tier: **T0** (promotion blocked by ceiling)
- Effect: code-simplifier stays stateless -- fresh perspective preserved

**Example 3: lu-executor at CRITICAL task**

- Default tier: T2
- CRITICAL promotes T2 -> T3
- Promotable to: T3
- Effective tier: **T3** (promoted, within ceiling)
- Effect: lu-executor loads BRAIN.md for full project context, triggers lu-learner directly

### 8.4 Promotion Guardrails

1. **Complexity is classified ONCE** at routing time (lu-router), before cognition config resolution. No re-classification after promotion.
2. **`promotable_to: T0`** enforces a hard ceiling. Agents marked with this can never be promoted, regardless of complexity.
3. **Context budget awareness**: At CRITICAL complexity with 10+ agents, promoted agents add 5000-10000 tokens of cognitive context. Monitor for context window pressure.
4. **No automatic demotion**: Once promoted for a task, the agent stays at the promoted tier for the entire execution. Tier resets to default at session boundary.

---

## 9. Implementation Priority

### 9.1 Ordered Agent Updates (by gap severity and impact)

| Priority | Agent               | Change                                                                   | Effort                               | Impact                                                |
| -------- | ------------------- | ------------------------------------------------------------------------ | ------------------------------------ | ----------------------------------------------------- |
| **P1**   | lu-phase-researcher | Add cognition config: T1, tags: `["stack", "architecture"]`              | Low (config + memory recall section) | Prevents re-research of settled technology decisions  |
| **P2**   | lu-plan-checker     | Add cognition config: T1, tags: `["planning", "pitfalls"]`               | Low (config + memory recall section) | Improves plan validation with past findings           |
| **P3**   | lu-pr-reviewer      | Add cognition config: T1, tags: `["conventions", "patterns"]`            | Low (config + memory recall section) | Improves PR review consistency with convention recall |
| **P4**   | lu-cognition        | Update selective recall algorithm with tier resolution and tag filtering | Medium (algorithm update)            | Enables the entire per-agent cognition system         |
| **P5**   | lu-learner          | Add `Tags:` field to extraction template                                 | Low (template update)                | Enables tag-based filtering for all future entries    |
| **P6**   | All 25 agents       | Add cognition config to `.agent.ts` registry files                       | Medium (25 file updates, mechanical) | Provides metadata for lu-cognition to consume         |
| **P7**   | MEMORY.md           | Retroactive tagging of existing entries                                  | Medium (108+ entries to tag)         | Enables tag-based filtering for historical entries    |
| **P8**   | Compiler            | Extend claude.compiler.ts to emit YAML frontmatter with cognition config | Medium (compiler update)             | Makes cognition config machine-readable at runtime    |
| **P9**   | Complexity matrix   | Add `cognitionPromotions` to ComplexityGate interface and defaults       | Low (schema + defaults)              | Enables dynamic tier promotion at high complexity     |

### 9.2 Dependency Order

```
P4 (lu-cognition algorithm) depends on P6 (agent configs) + P8 (compiler)
P1-P3 (agent updates) depend on P6 (agent configs)
P7 (MEMORY tagging) depends on P5 (lu-learner template)
P9 (complexity matrix) is independent
```

**Recommended execution order:**

1. P5, P6, P8, P9 (foundations -- can be parallel)
2. P4 (lu-cognition algorithm -- depends on foundations)
3. P1, P2, P3 (agent definition updates -- depends on P6)
4. P7 (MEMORY.md retroactive tagging -- depends on P5)

---

_Audit completed: 2026-02-11_
_Auditor: Claude (lu-executor, Plan 15-01)_
_Methodology: 15-RESEARCH.md as primary data source, all 25 agents spot-checked via grep, 3 research corrections applied_
