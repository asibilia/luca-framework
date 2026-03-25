# Agent Orchestration

The agent ecosystem that powers Luca Workflow v2. This document catalogs every agent role -- new and enhanced -- and explains how they compose into the 10-step pipeline.

## Agent Ecosystem at a Glance

v1 shipped with ~39 agents organized into loose functional groups. v2 retains every existing agent but introduces **8 new agent roles** and **enhances 4 existing roles** to support the research-heavy, review-loop-based workflow. The additions fall into three categories: parallel researchers, cold-isolated reviewers, and a graduation agent.

### New Agents (v2)

| Agent                          | Category      | Purpose                                                               | Routing Preset | Cognition |
| ------------------------------ | ------------- | --------------------------------------------------------------------- | -------------- | --------- |
| `lu-architecture-researcher`   | Research Team | Research design patterns, module boundaries, system structure         | ROUTER         | T1        |
| `lu-implementation-researcher` | Research Team | Research libraries, APIs, code patterns, version constraints          | ROUTER         | T1        |
| `lu-ecosystem-researcher`      | Research Team | Research existing solutions, alternatives, community practices        | ROUTER         | T1        |
| `lu-risk-researcher`           | Research Team | Research pitfalls, failure modes, deprecation warnings, security      | ROUTER         | T1        |
| `lu-completeness-reviewer`     | Review Team   | Evaluate research for gaps, missing topics, unexplored alternatives   | DEEP_ANALYSIS  | T0        |
| `lu-accuracy-reviewer`         | Review Team   | Verify sources, detect hallucinations, check findings against sources | DEEP_ANALYSIS  | T0        |
| `lu-actionability-reviewer`    | Review Team   | Evaluate whether research is specific enough to plan from             | DEEP_ANALYSIS  | T1        |
| `lu-research-graduator`        | Graduation    | Distill verified research findings into MuninnDB engrams              | ORCHESTRATOR   | T2        |

### Enhanced Agents (v2)

| Agent                     | What Changed                                                                                                                                                                                                                                | Why                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `lu-phase-researcher`     | Becomes orchestrator that spawns 4 specialist researchers instead of doing all research itself                                                                                                                                              | Single-agent research was too shallow for MODERATE+ tasks                     |
| `lu-research-synthesizer` | **Unchanged from v1** -- still combines research outputs into SUMMARY.md. Now processes 4 researcher files instead of 1, and re-runs after deep expand (Step 4). Existing agent file: `src/agents/general/lu-research-synthesizer.agent.ts` | Now handles a richer research corpus; no prompt or frontmatter changes needed |
| `lu-plan-checker`         | Gains review loop support with convergence detection                                                                                                                                                                                        | Single-pass plan checking missed structural issues                            |
| `lu-learner`              | Gains research:\* engram promotion pathway (can promote verified research findings to permanent memory)                                                                                                                                     | Research findings need execution validation before entering default vault     |
| `lu-premortem`            | Receives research files as input (previously operated on plan only)                                                                                                                                                                         | Risk analysis is more accurate with verified research context                 |

### Unchanged Agents (v2)

All other existing agents continue to function as documented. The v2 changes are additive -- no existing agent has its interface or behavior reduced.

## Three Agent Teams

v2 organizes the new agents into three teams that operate at different points in the pipeline:

```
Step 2: Research
+------------------------------------------+
|            RESEARCH TEAM                  |
|                                           |
|  lu-architecture-researcher  (parallel)   |
|  lu-implementation-researcher (parallel)  |
|  lu-ecosystem-researcher     (parallel)   |
|  lu-risk-researcher          (parallel)   |
+------------------------------------------+
            |
            v  (research files 01-04)
            |
            +---> lu-research-synthesizer -> SUMMARY.md
            |
Step 3: Discuss + Pre-mortem
            |
            v  (CONTEXT.md with locked decisions)
Step 4: Deep Expand
+------------------------------------------+
|        TARGETED RESEARCHERS               |
|                                           |
|  Researcher(s) for under-researched areas |
|  (parallel, cold, same ROUTER preset)     |
+------------------------------------------+
            |
            v  (research files 05+)
Step 5: Review Research
+------------------------------------------+
|            REVIEW TEAM                    |
|                                           |
|  lu-completeness-reviewer    (parallel)   |
|  lu-accuracy-reviewer        (parallel)   |
|  lu-actionability-reviewer   (parallel)   |
+------------------------------------------+
            |
            v  (converged research)
Step 6: Graduate to MuninnDB
+------------------------------------------+
|            GRADUATION AGENT               |
|                                           |
|  lu-research-graduator                    |
+------------------------------------------+
            |
            v  (MuninnDB research:* engrams)
Steps 7-10: Plan, Execute, Verify + UAT
```

### Why Three Separate Teams

The separation is deliberate and follows the **agent isolation** design principle:

1. **Research Team** operates in cold isolation from each other. Each researcher investigates independently, preventing the echo chamber effect where one agent's early hypothesis biases the others.

2. **Review Team** operates in cold isolation from the Research Team. Reviewers never see researcher reasoning, only output files. This prevents inherited blind spots.

3. **Graduation Agent** operates after review convergence. It reads only the converged research corpus and existing MuninnDB state, ensuring only verified findings enter long-term memory.

## Model Routing

New agents are assigned to existing routing presets from `MODEL_ROUTING_TABLE` in `src/complexity/__helpers/model-routing.ts`. No new presets are needed.

| Team                     | Preset        | Rationale                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------ | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Research Team (4 agents) | ROUTER        | Research is discovery, not deep execution. ROUTER gives fast at TRIVIAL/SIMPLE, balanced at MODERATE+. This is a deliberate cost-savings divergence from v1's `lu-phase-researcher` which used ORCHESTRATOR -- 4 parallel researchers at ORCHESTRATOR would be prohibitively expensive. See [Decision 10](../CANONICAL-DECISIONS.md#decision-10-model-routing-presets). |
| Review Team (3 agents)   | DEEP_ANALYSIS | Reviews require careful evaluation; capable models from MODERATE upward catch subtle gaps. See [Decision 10](../CANONICAL-DECISIONS.md#decision-10-model-routing-presets).                                                                                                                                                                                              |
| Graduation Agent         | ORCHESTRATOR  | Graduation is orchestration work (reading, scoring, writing); balanced at SIMPLE/MODERATE, capable at COMPLEX+. See [Decision 10](../CANONICAL-DECISIONS.md#decision-10-model-routing-presets).                                                                                                                                                                         |

### Cost Implications

At MODERATE complexity (the most common level), approximate input+output token costs:

| Team                  | Agents          | Model Tier | Per-Agent Cost | Team Cost        |
| --------------------- | --------------- | ---------- | -------------- | ---------------- |
| Research              | 4 (parallel)    | balanced   | ~20K tokens    | ~80K tokens      |
| Deep Expand           | ~1-2 (parallel) | balanced   | ~20K tokens    | ~30K tokens      |
| Review                | 3 (parallel)    | capable    | ~6K tokens     | ~18K tokens      |
| Graduation            | 1 (sequential)  | balanced   | ~10K tokens    | ~10K tokens      |
| **Total v2 addition** |                 |            |                | **~138K tokens** |

This is offset by reduced executor hallucinations and rework. See [00-design-principles/README.md](../00-design-principles/README.md) for the cost model analysis.

## Cognition Tier Summary

| Tier               | Agents                                             | Memory Access                                              |
| ------------------ | -------------------------------------------------- | ---------------------------------------------------------- |
| T0 (stateless)     | `lu-completeness-reviewer`, `lu-accuracy-reviewer` | None -- purely evaluative                                  |
| T1 (memory-reader) | All 4 researchers, `lu-actionability-reviewer`     | Read-only recall of patterns, stack decisions              |
| T2 (session-aware) | `lu-research-graduator`                            | Read existing engrams for deduplication, write new engrams |

No new agents require T3 (fully-cognitive). The cognitive pre-flight agent (`lu-cognition`) remains the only T3 agent in the system. Note that `lu-research-graduator` at T2 is the highest-tier new agent; T2 includes both read and write MuninnDB access (the table above specifies "Read existing engrams for deduplication, write new engrams").

## Context Isolation Summary

| Mode | Agents                                                                  | What They See                                                      |
| ---- | ----------------------------------------------------------------------- | ------------------------------------------------------------------ |
| cold | All 4 researchers (from each other), all 3 reviewers (from researchers) | Only their specific inputs -- no shared reasoning or session state |
| warm | `lu-actionability-reviewer` [1], `lu-research-graduator` [2]            | Project structure and research files, but not session narrative    |
| none | (No new agents use `none`)                                              | Full context access                                                |

> **[1] `lu-actionability-reviewer` warm**: Codebase access via Read/Grep/Glob to assess whether research recommendations map to real files/modules. No MuninnDB write access.
>
> **[2] `lu-research-graduator` warm**: MuninnDB read+write access for deduplication and engram writing, plus `.planning/config.json` access for vault resolution. No session narrative access.

## Documents in This Section

| Document                                       | Focus                                                                                             |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| [research-team.md](research-team.md)           | The 4 parallel researcher agents: specializations, agent specs, parameterization design question  |
| [review-team.md](review-team.md)               | The 3 reviewer agents: evaluation dimensions, structured output, parameterization design question |
| [graduation-agent.md](graduation-agent.md)     | The `lu-research-graduator`: scoring, deduplication, batch writing, graduation report             |
| [orchestration-flow.md](orchestration-flow.md) | Full pipeline sequence diagram, parallel vs. sequential, data flow, error handling, gate checks   |

## Related Documentation

- [Research System](../02-research-system/) -- How the research pipeline works end-to-end
- [Design Principles](../00-design-principles/) -- Agent isolation patterns and context rot prevention
- [Workflow Steps](../01-workflow-steps/) -- Full 10-step pipeline reference
- [MuninnDB Integration](../03-muninndb-integration/) -- How research graduates into memory
- [Review Loops](../05-review-loops/) -- Convergence-based review loop patterns
