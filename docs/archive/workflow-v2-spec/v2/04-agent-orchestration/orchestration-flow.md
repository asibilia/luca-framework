# Orchestration Flow

How agents compose across the full Luca Workflow v2 pipeline. This document covers the spawn sequence, parallel vs. sequential execution, data flow between agents, error handling, gate checks, and model tier implications.

> **Canonical pipeline**: The 10-step numbering below is authoritative. See [01-workflow-steps/](../01-workflow-steps/) for full step definitions. The v1 15-step pipeline maps as sub-processes within these steps -- v1's model resolution, cognitive pre-flight, and validation happen WITHIN v2 steps (primarily Step 1), not as top-level steps. The v2 numbering is the user-facing pipeline; v1's 15-step list is the internal implementation checklist.

## Full Pipeline Sequence Diagram

```
Step 1: IDEATE (parse, route, classify)
=========================================
  User invokes /lu with brief
    |
    v
  lu.skill.ts (orchestrator)
    |
    +---> lu-cognition          [sequential, T3, ALWAYS_FAST]
    |       |
    |       +---> muninn_recall (brain:project-identity)
    |       +---> muninn_recall (relevant patterns, pitfalls)
    |       +---> muninn_remember (session:context-loaded)
    |       |
    |       v
    |     Cognitive Report (injected into downstream prompts)
    |
    +---> lu-router              [sequential, ROUTER preset]
    |       |
    |       +---> Reads: user brief, cognitive report
    |       +---> Output: complexity level (TRIVIAL..CRITICAL)
    |       |
    |       v
    |     Complexity set in STATE.md
    |     Model tiers resolved for all subsequent agents
    |
    v
Step 2: RESEARCH (parallel researchers)
========================================
    |
    +---> lu-architecture-researcher   [parallel, cold, T1, ROUTER]
    +---> lu-implementation-researcher [parallel, cold, T1, ROUTER]
    +---> lu-ecosystem-researcher      [parallel, cold, T1, ROUTER]
    +---> lu-risk-researcher           [parallel, cold, T1, ROUTER]
    |       |
    |       +---> Each reads: user brief, CONTEXT.md (if exists),
    |       |     cognitive report (memory tags scoped)
    |       |
    |       +---> Each writes: .planning/phases/NN-name/research/0N-*.md
    |       |
    |       v
    |     All 4 complete (barrier)
    |
    +---> lu-research-synthesizer      [sequential, ORCHESTRATOR]
    |       |
    |       +---> Reads: all 4 research files
    |       +---> Writes: .planning/phases/NN-name/research/SUMMARY.md
    |       +---> Commits: all research files
    |
    v
Step 3: DISCUSS + PRE-MORTEM
==============================
    |
    +---> phase-discuss orchestrator
    |       |
    |       +---> Identify gray areas from research
    |       |
    |       +---> lu-discuss-researcher x N  [parallel per question, T1, ORCHESTRATOR]
    |       |       +---> Each reads: one gray area question + research files
    |       |       +---> Each writes: recommendation with sources
    |       |
    |       +---> User participation (if interactive mode)
    |       |
    |       +---> Writes: CONTEXT.md (locked decisions)
    |       |
    |       +--- GATE CHECK: premortem enabled? ---
    |       |       |
    |       |    [--run-premortem]
    |       |       |
    |       |       v
    |       +---> lu-premortem           [sequential, T1, DEEP_ANALYSIS]
    |               +---> Reads: research files + CONTEXT.md
    |               +---> Writes: PREMORTEM.md
    |
    v
Step 4: DEEP EXPAND
=====================
    |
    +---> Orchestrator identifies under-researched areas from:
    |       - Discussion gray areas that need deeper investigation
    |       - Pre-mortem risks that lack supporting research
    |       - Gaps visible after CONTEXT.md locks decisions
    |
    +---> Spawn targeted researcher(s)  [parallel, cold, ROUTER]
    |       +---> Each reads: user brief, CONTEXT.md, specific expansion topic
    |       +---> Each writes: .planning/phases/NN-name/research/05-{topic}.md
    |       |     (numbered 05+ in the same research directory)
    |       |
    |       v
    |     Expansion complete (barrier)
    |
    +---> lu-research-synthesizer      [sequential, ORCHESTRATOR]
    |       +---> Updates: SUMMARY.md with deep expansion findings
    |
    v
Step 5: REVIEW RESEARCH (convergence loop)
============================================
    |
    +---> LOOP START (max iterations from research.reviewLoop.maxIterations)
    |       |
    |       +---> lu-completeness-reviewer  [parallel, cold, T0, DEEP_ANALYSIS]
    |       +---> lu-accuracy-reviewer      [parallel, cold, T0, DEEP_ANALYSIS]
    |       +---> lu-actionability-reviewer  [parallel, warm, T1, DEEP_ANALYSIS]
    |       |       |
    |       |       +---> Each reads: research files (including deep expand),
    |       |       |     review criteria
    |       |       +---> Each writes: .planning/phases/NN-name/research/reviews/*-review.md
    |       |       |
    |       |       v
    |       |     All 3 complete (barrier)
    |       |
    |       +---> Aggregate verdicts
    |       |
    |       +--- All PASS? ---+--- Yes ---> EXIT LOOP
    |       |                 |
    |       |              No (REVISE)
    |       |                 |
    |       |                 v
    |       +---> Dispatch revision requests to targeted researchers
    |       |       +---> Only flagged researchers re-run (focused re-expansion,
    |       |       |     NOT re-entry into Step 4 as a whole)
    |       |       +---> Re-synthesize
    |       |
    |       +--- Diminishing returns? ---+--- Yes ---> EXIT LOOP (accept)
    |       |                            |
    |       |                         No
    |       |                            |
    |       +--- Max iterations? ---+--- Yes ---> ESCALATE to user
    |       |                       |
    |       |                    No
    |       |                       |
    |       +---> LOOP CONTINUE
    |
    v
Step 6: GRADUATE TO MUNINNDB
==============================
    |
    +---> lu-research-graduator         [sequential, warm, T2, ORCHESTRATOR]
    |       |
    |       +---> Reads: research files, review assessments
    |       +---> muninn_recall (deduplication check)
    |       +---> Scores findings (weighted sum: confidence * 0.40
    |       |     + actionability * 0.35 + uniqueness * 0.25)
    |       +---> muninn_remember_batch (repo vault: research:* prefixes)
    |       +---> Writes: .planning/phases/NN-name/research/GRADUATION-REPORT.md
    |
    v
Step 7: PLAN
=============
    |
    +---> lu-planner                    [sequential, ORCHESTRATOR]
    |       |
    |       +---> Reads: CONTEXT.md, research SUMMARY.md,
    |       |     graduated engrams (via muninn_recall per task area)
    |       +---> Writes: PLAN.md files with @research refs
    |
    v
Step 8: REVIEW PLAN (convergence loop)
========================================
    |
    +---> LOOP START (iterations from research.planReviewLoop.maxIterations)
    |       |
    |       +---> lu-plan-checker          [sequential/parallel, ORCHESTRATOR]
    |       |       +---> Enhanced: convergence detection, multi-pass
    |       |       +---> Reads: PLAN.md, research files, CONTEXT.md
    |       |       +---> Writes: plan review assessment
    |       |
    |       +--- Plan approved? ---+--- Yes ---> EXIT LOOP
    |       |                      |
    |       |                   No
    |       |                      |
    |       +---> Revision requests to lu-planner
    |       |
    |       +--- Max iterations? ---+--- Yes ---> ESCALATE
    |       |
    |       +---> LOOP CONTINUE
    |
    v
Step 9: EXECUTE (wave-based parallel)
=======================================
    |
    +---> For each wave in PLAN.md:
    |       |
    |       +---> For each task in wave (parallel):
    |       |       |
    |       |       +---> muninn_recall (per-task targeted)
    |       |       |       +---> Recall: patterns relevant to THIS task
    |       |       |       +---> Recall: pitfalls relevant to THIS task
    |       |       |
    |       |       +---> lu-executor               [parallel, ORCHESTRATOR]
    |       |       |       +---> Reads: task plan, recalled engrams,
    |       |       |       |     @research refs from plan
    |       |       |       +---> Writes: code changes
    |       |       |       +---> muninn_remember (session:findings)
    |       |       |
    |       |       v
    |       |     Task complete
    |       |
    |       +---> Wave barrier (all tasks in wave complete)
    |       |
    |       +---> Harness verification (test + typecheck + lint + build)
    |       |       |
    |       |       +--- Pass? ---+--- Yes ---> Next wave
    |       |                     |
    |       |                  No
    |       |                     |
    |       +---> Harness fix loop (max iterations from complexity)
    |
    v
Step 10: VERIFY + UAT
=======================
    |
    +---> Code Review (parallel reviewers)
    |       |
    |       +---> dx-advocate             [parallel, cold, DEEP_ANALYSIS]
    |       +---> code-architect          [parallel, cold, DEEP_ANALYSIS]
    |       +---> code-simplifier         [parallel, cold, DEEP_ANALYSIS]
    |       +---> security-auditor        [parallel, cold, DEEP_ANALYSIS]
    |       +---> performance-auditor     [parallel, cold, DEEP_ANALYSIS]
    |
    +---> lu-verifier                    [sequential, warm, DEEP_ANALYSIS]
    |       +---> Reads: plan, code, research files
    |       +---> Goal-backward verification
    |       +---> Writes: VERIFICATION.md
    |
    +---> lu-learner                     [sequential, T2, FAST_PROMOTED]
    |       +---> Reads: session context from MuninnDB
    |       +---> muninn_remember (validated patterns, pitfalls, procedures)
    |       +---> May PROMOTE high-value research:* engrams to permanent
    |       |     pattern:*/pitfall:*/decision:* in DEFAULT vault
    |       +---> Clears session context
    |
    +--- GATE CHECK: process_data enabled? ---
    |       |
    |    [--run-process-data]
    |       |
    |       v
    +---> lu-process-data               [sequential, FAST_PROMOTED]
    |       +---> Writes process metrics
    |
    +---> Commit
```

## Parallel vs. Sequential Execution

### Parallel Agent Groups

These agent groups run concurrently. The orchestrator spawns them simultaneously and waits for all to complete before proceeding.

| Group                            | Agents                 | Why Parallel                                 |
| -------------------------------- | ---------------------- | -------------------------------------------- |
| Research team (Step 2)           | 4 researchers          | Cold-isolated, no dependencies between them  |
| Discussion researchers (Step 3)  | N discuss-researchers  | Each answers one independent question        |
| Deep expand researchers (Step 4) | N targeted researchers | Cold-isolated, each expands one topic        |
| Research reviewers (Step 5)      | 3 reviewers            | Cold-isolated, evaluate different dimensions |
| Code reviewers (Step 10)         | 5 reviewers            | Cold-isolated, evaluate different concerns   |
| Wave tasks (Step 9)              | N executors            | Independent tasks within the same wave       |

### Sequential Agents

These agents must run in order. Each depends on the output of the previous step.

| Agent                   | Why Sequential                                 | Depends On              |
| ----------------------- | ---------------------------------------------- | ----------------------- |
| lu-cognition            | Must complete before anything else uses memory | Nothing (first agent)   |
| lu-router               | Needs cognitive report to classify             | lu-cognition            |
| lu-research-synthesizer | Needs all 4 research files                     | All 4 researchers       |
| lu-premortem            | Needs research + CONTEXT.md                    | discuss + research      |
| lu-research-graduator   | Needs converged research                       | Review loop convergence |
| lu-planner              | Needs graduated engrams + CONTEXT.md           | Graduation              |
| lu-verifier             | Needs code + plan                              | Execution complete      |
| lu-learner              | Needs verification results                     | lu-verifier             |

### Barrier Points

These are synchronization points where the orchestrator waits for all concurrent agents to complete:

1. **Research barrier** (Step 2): After 4 researchers, before synthesizer
2. **Deep expand barrier** (Step 4): After targeted researchers, before re-synthesis
3. **Review barrier** (Step 5): After 3 reviewers, before verdict aggregation
4. **Wave barrier** (Step 9): After all tasks in a wave, before next wave or harness
5. **Code review barrier** (Step 10): After 5 code reviewers, before verification

## Data Flow Between Agents

### File-Based Data Flow

Agents communicate primarily through files on disk. This is deliberate: files are inspectable, diffable, and persist across agent crashes.

```
lu-cognition (Step 1)
  writes: cognitive report (injected into prompts, not a file)

4 researchers (Step 2)
  write: .planning/phases/NN-name/research/01-architecture-patterns.md
         .planning/phases/NN-name/research/02-implementation-approaches.md
         .planning/phases/NN-name/research/03-existing-solutions.md
         .planning/phases/NN-name/research/04-pitfalls-and-risks.md

lu-research-synthesizer (Step 2)
  reads: all 4 research files
  writes: .planning/phases/NN-name/research/SUMMARY.md

phase-discuss (Step 3)
  reads: research files, SUMMARY.md
  writes: .planning/phases/NN-name/NN-CONTEXT.md

lu-premortem (Step 3)
  reads: research files, CONTEXT.md
  writes: .planning/phases/NN-name/PREMORTEM.md

deep expand researchers (Step 4)
  read: CONTEXT.md, specific expansion topics
  write: .planning/phases/NN-name/research/05-{topic}.md (numbered 05+)

3 reviewers (Step 5)
  read: all research files (including deep expand files from Step 4)
  write: .planning/phases/NN-name/research/reviews/completeness-review.md
         .planning/phases/NN-name/research/reviews/accuracy-review.md
         .planning/phases/NN-name/research/reviews/actionability-review.md

lu-research-graduator (Step 6)
  reads: research files, review assessments
  writes: .planning/phases/NN-name/research/GRADUATION-REPORT.md
  writes: MuninnDB engrams (research:* prefixes in repo vault)

lu-planner (Step 7)
  reads: CONTEXT.md, SUMMARY.md, MuninnDB engrams (via recall)
  writes: .planning/phases/NN-name/NN-PP-PLAN.md

lu-executor (Step 9)
  reads: task plan, MuninnDB engrams (via per-task recall)
  writes: code files, .planning/phases/NN-name/NN-PP-SUMMARY.md

lu-verifier (Step 10)
  reads: plan, code, research files
  writes: .planning/phases/NN-name/VERIFICATION.md

lu-learner (Step 10)
  reads: MuninnDB session context
  writes: MuninnDB engrams (patterns, pitfalls, procedures)
  may promote: high-value research:* engrams to permanent pattern:*/pitfall:*/decision:*
```

### MuninnDB Data Flow

Memory flows through MuninnDB in a distinct pattern from file-based data:

```
lu-cognition ----recall----> brain:project-identity
                             pattern:*, pitfall:*
                ----write----> session:context-loaded

researchers ----recall----> (via cognitive report, read-only)

lu-research-graduator ----recall----> existing engrams (dedup)
                      ----write----> research:* (repo vault, deferred promotion)

lu-executor ----recall----> pattern:* (per-task targeted)
                            pitfall:* (per-task targeted)
            ----write----> session:findings

lu-learner ----recall----> session:* (all session context)
           ----write----> pattern:*, pitfall:*, procedure:*
           ----promote--> research:* -> pattern:*/pitfall:*/decision:* (default vault)
           ----clear----> session:* (cleanup)
```

## Error Handling

### Agent Failure Categories

| Category                      | Examples                                                   | Recovery Strategy                                                                   |
| ----------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **Crash**                     | Agent process dies, out of memory, timeout                 | Retry once with same inputs. If second attempt fails, escalate.                     |
| **Tool failure**              | WebSearch unavailable, MuninnDB unreachable                | Continue with degraded output. Mark affected findings as UNVERIFIED.                |
| **Output validation failure** | Agent produces malformed output, wrong file format         | Retry once with explicit format instructions. If still invalid, escalate.           |
| **Logical failure**           | Agent produces empty research, all findings LOW confidence | Accept degraded output and let reviewers catch it. The review loop exists for this. |

### Per-Step Error Handling

**Step 1 (Ideate)**: If lu-cognition fails, proceed without cognitive report. Downstream agents operate at T0 (stateless) instead of T1+ (memory-reader). If lu-router fails, default to MODERATE complexity. These degrade quality but do not block the pipeline.

**Step 2 (Research)**: If one researcher fails, the remaining three still produce output. The synthesizer notes the missing facet. The completeness reviewer will flag the gap, potentially triggering a targeted re-run of only the failed researcher.

**Step 3 (Discuss)**: If a discuss-researcher fails on one question, that question remains a gray area. The orchestrator logs it and the planner treats it as Claude's discretion.

**Step 4 (Deep Expand)**: If a targeted researcher fails, the expansion topic remains shallow. The review loop in Step 5 will flag it as a gap, and a subsequent revision iteration may re-attempt. This is not a pipeline-blocking failure.

**Step 5 (Review)**: If one reviewer fails, the remaining two verdicts are used. If two fail, the orchestrator retries the failed reviewers once. If all three fail, the research is accepted with a warning flag and graduation proceeds with elevated caution. Reviewers evaluate all research files including deep expand files from Step 4.

**Step 6 (Graduation)**: If the graduator fails, research files remain on disk but are not in MuninnDB. Planning proceeds using file-based research (degraded but functional). Graduation can be retried later.

**Step 7-8 (Plan/Review Plan)**: Existing error handling from v1 applies. Plan review loop has max iterations with user escalation.

**Step 9 (Execute)**: Existing harness fix loop handles mechanical failures. Semantic failures are caught by lu-verifier in Step 10.

**Step 10 (Verify + UAT)**: If lu-learner fails, session context remains in MuninnDB but is not promoted to long-term memory. This is a non-blocking failure -- the next session will start fresh.

### Escalation Path

```
Agent failure
    |
    +---> Retry once (automatic)
    |       |
    |       +--- Success? ---> Continue pipeline
    |       |
    |       +--- Fail again
    |               |
    |               v
    +---> Can pipeline continue with degraded output?
    |       |
    |       +--- Yes ---> Continue with warning flag
    |       |
    |       +--- No ---> Escalate to user
    |               |
    |               v
    |         User decides: retry / skip step / abort
```

## Gate Checks

Two existing gates apply to the v2 pipeline:

| Gate         | Step             | Flag                                         | Effect                                                   |
| ------------ | ---------------- | -------------------------------------------- | -------------------------------------------------------- |
| premortem    | Step 3 (Discuss) | `--run-premortem` / `--skip-premortem`       | Controls whether lu-premortem runs after discussion      |
| process_data | Step 10 (Verify) | `--run-process-data` / `--skip-process-data` | Controls whether lu-process-data runs after verification |

### New Gates to Consider (v2)

| Gate            | Step   | Proposed Flag                                      | Effect                                          |
| --------------- | ------ | -------------------------------------------------- | ----------------------------------------------- |
| research_review | Step 5 | `--run-research-review` / `--skip-research-review` | Controls whether the research review loop runs  |
| graduation      | Step 6 | `--run-graduation` / `--skip-graduation`           | Controls whether research graduates to MuninnDB |

These gates follow the **fail-closed** pattern documented in `.claude/rules/gate-enforcement.md`: if the flag is absent, the gated step is skipped. The orchestrator resolves gates via `luca-bridge gate-check` and passes explicit flags to sub-skills.

> **Implementation tracking**: Adding these gates requires updating `.planning/config.json` gates section and the `gate-enforcement.md` rule. See [06-implementation-plan/](../06-implementation-plan/) for phased rollout.

### Gate Resolution Flow

```
lu.skill.ts (orchestrator)
    |
    +---> luca-bridge gate-check --gate=premortem
    +---> luca-bridge gate-check --gate=process_data
    +---> luca-bridge gate-check --gate=research_review
    +---> luca-bridge gate-check --gate=graduation
    |
    +---> Resolve flags
    |
    +---> Pass flags to sub-skills:
          phase-discuss --run-premortem
          phase-research --run-research-review --run-graduation
          phase-execute --skip-process-data
```

## Model Tier Implications

Complexity level determines the model tier for every agent via `resolveModelForAgent()`. Here is the complete model tier map across all 10 steps for each complexity level:

### TRIVIAL

```
Step 1:  lu-cognition ............... fast
         lu-router .................. fast
Step 2:  4 researchers .............. fast (each)
         lu-research-synthesizer .... fast
Step 3:  lu-discuss-researcher ...... fast
         lu-premortem ............... fast
Step 4:  deep expand researchers .... fast (each)
Step 5:  3 reviewers ................ fast (each)
Step 6:  lu-research-graduator ...... fast
Step 7:  lu-planner ................. fast
Step 8:  lu-plan-checker ............ fast
Step 9:  lu-executor ................ fast
Step 10: 5 code reviewers .......... fast (each)
         lu-verifier ............... fast
         lu-learner ................ fast
```

### MODERATE

```
Step 1:  lu-cognition ............... fast
         lu-router .................. balanced
Step 2:  4 researchers .............. balanced (each)
         lu-research-synthesizer .... balanced
Step 3:  lu-discuss-researcher ...... balanced
         lu-premortem ............... capable
Step 4:  deep expand researchers .... balanced (each)
Step 5:  3 reviewers ................ capable (each)
Step 6:  lu-research-graduator ...... balanced
Step 7:  lu-planner ................. balanced
Step 8:  lu-plan-checker ............ balanced
Step 9:  lu-executor ................ balanced
Step 10: 5 code reviewers .......... capable (each)
         lu-verifier ............... capable
         lu-learner ................ fast
```

### CRITICAL

```
Step 1:  lu-cognition ............... fast
         lu-router .................. balanced
Step 2:  4 researchers .............. balanced (each)
         lu-research-synthesizer .... capable
Step 3:  lu-discuss-researcher ...... capable
         lu-premortem ............... capable
Step 4:  deep expand researchers .... balanced (each)
Step 5:  3 reviewers ................ capable (each)
Step 6:  lu-research-graduator ...... capable
Step 7:  lu-planner ................. capable
Step 8:  lu-plan-checker ............ capable
Step 9:  lu-executor ................ capable
Step 10: 5 code reviewers .......... capable (each)
         lu-verifier ............... capable
         lu-learner ................ balanced
```

### Key Observations

1. **lu-cognition is always fast.** It is a classifier, not a reasoner. Its job is to recall and inject, not to analyze.

2. **Researchers and reviewers diverge at MODERATE.** Researchers get balanced (ROUTER preset) while reviewers get capable (DEEP_ANALYSIS preset). This is intentional: review requires deeper reasoning than research. Deep expand researchers (Step 4) use the same ROUTER preset as initial researchers.

3. **lu-learner stays lightweight.** Even at CRITICAL complexity, the learner runs on balanced (via FAST_PROMOTED). Learning extraction is a well-structured task that does not benefit significantly from a more capable model.

4. **The executor scales with complexity.** At TRIVIAL it is fast, at MODERATE it is balanced, at COMPLEX/CRITICAL it is capable. This matches the task difficulty.

5. **Step 4 (Deep Expand) reuses researcher infrastructure.** Deep expand spawns the same researcher agents with the same ROUTER preset and cold isolation. The difference is scope: initial researchers cover broad domains; deep expand researchers investigate specific topics identified during discussion.

## The Orchestrator's Role

The orchestrator is `lu.skill.ts` (or its v2-enhanced version). It is the only entity that:

1. **Reads complexity** from STATE.md or `luca-bridge read-complexity`
2. **Resolves model tiers** for all agents via `resolveModelForAgent()`
3. **Resolves gates** via `luca-bridge gate-check`
4. **Spawns agents** with the correct model tier, isolation mode, and input files
5. **Manages barriers** (waiting for parallel groups to complete)
6. **Manages loops** (review convergence, harness fix iterations)
7. **Escalates** to the user when recovery paths are exhausted
8. **Tracks state** via `luca-bridge transition` and STATE.md dual-write

Sub-skills (phase-research, phase-discuss, phase-execute) are delegated orchestrators that manage their specific pipeline steps. They receive gate flags from the top-level orchestrator and do not resolve gates themselves (per the gate-enforcement rule).

### Orchestrator State Transitions

```
IDLE ----[/lu invoked]----> IDEATING
     ----[complexity set]----> RESEARCHING
     ----[research complete]----> DISCUSSING
     ----[context locked]----> DEEP_EXPANDING
     ----[expansion complete]----> REVIEWING_RESEARCH
     ----[research converged]----> GRADUATING
     ----[engrams written]----> PLANNING
     ----[plan approved]----> EXECUTING
     ----[code complete]----> VERIFYING
     ----[verified]----> LEARNING
     ----[learnings captured]----> COMMITTING
     ----[committed]----> IDLE
```

Each transition is persisted via `luca-bridge transition` for crash recovery.

## Token Budget Estimates

Approximate token budgets for a MODERATE-complexity task across the full pipeline:

| Step                  | Agents                           | Per-Agent (input+output) | Step Total | Cumulative       |
| --------------------- | -------------------------------- | ------------------------ | ---------- | ---------------- |
| 1. Ideate             | cognition + router               | ~2K + ~1K                | ~3K        | ~3K              |
| 2. Research           | 4 + 1 synthesizer                | ~20K + ~6K               | ~86K       | ~89K             |
| 3. Discuss            | ~2 researchers + premortem       | ~4K + ~6K                | ~14K       | ~103K            |
| 4. Deep Expand        | ~1-2 targeted researchers        | ~20K each                | ~30K       | ~133K            |
| 5. Review             | 3 reviewers x 1 iteration        | ~6K each                 | ~18K       | ~151K            |
| 6. Graduation         | 1                                | ~10K                     | ~10K       | ~161K            |
| 7. Planning           | 1                                | ~12K                     | ~12K       | ~173K            |
| 8. Plan review        | 1 x 1 iteration                  | ~8K                      | ~8K        | ~181K            |
| 9. Execution          | ~3 tasks                         | ~15K each                | ~45K       | ~226K            |
| 10. Verify + UAT      | 5 reviewers + verifier + learner | ~4K + ~8K + ~3K          | ~31K       | ~257K            |
| **Total**             |                                  |                          |            | **~257K tokens** |

> **Note on token estimates**: Per-agent budgets are total input+output at MODERATE complexity. The ~20K per researcher figure aligns with the multi-agent-research spec in [02-research-system/](../02-research-system/). Deep expand budget varies based on number of expansion topics identified -- the estimate above assumes 1-2 targeted expansions.

Compare to v1 for the same task: ~120K tokens (no research review, no graduation, no parallel researchers, no deep expand). The v2 overhead is approximately double, concentrated in the research, deep expand, and review steps. This is the cost model trade-off described in [00-design-principles/README.md](../00-design-principles/README.md).

## Related Documentation

- [Research Team](research-team.md) -- The 4 parallel researcher agents
- [Review Team](review-team.md) -- The 3 reviewer agents
- [Graduation Agent](graduation-agent.md) -- MuninnDB graduation
- [Workflow Steps](../01-workflow-steps/) -- Full 10-step reference
- [Design Principles](../00-design-principles/) -- Why this architecture
- [Complexity Gating](../../../../.claude/rules/complexity-gating.md) -- Model routing presets
- [Gate Enforcement](../../../../.claude/rules/gate-enforcement.md) -- Orchestrator-resolved flags
- [State Machine Bridge](../../../../.claude/rules/state-machine-bridge.md) -- How state is read/written
