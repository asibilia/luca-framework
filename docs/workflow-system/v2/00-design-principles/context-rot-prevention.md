# Context Rot Prevention

> Context rot is the #1 quality killer in AI-assisted development. Every other failure mode -- guesswork,
> ungrounded decisions, review bias -- is amplified by it. V2 treats context management as a first-class
> architectural concern, not an afterthought.

---

## What Is Context Rot?

Context rot is the progressive degradation of AI output quality as a conversation grows. It is not a bug in any particular model -- it is a fundamental constraint of transformer attention mechanisms. As the context window fills, the model's ability to attend to all relevant information diminishes. Earlier context becomes less influential. Competing signals create noise. The model begins to take shortcuts.

The term "rot" is deliberate: the degradation is gradual, invisible in the moment, and irreversible within a single session. By the time you notice the quality drop, significant context has already been lost.

### Why It Matters More Than Other Failures

Context rot is multiplicative. A model operating at 70% context capacity does not produce output that is 70% as good -- it produces output that is fundamentally different in character:

- **Thoroughness drops**: The model stops considering edge cases, error handling, and alternatives.
- **Conventions drift**: Project-specific patterns learned early in the session are overridden by the model's pre-training defaults.
- **Verification weakens**: The model's ability to cross-reference its own earlier output degrades, so self-review catches fewer issues.
- **Hallucination increases**: With less "room" for grounded context, the model fills gaps with plausible-sounding interpolation.

Every other v2 design principle -- grounded decisions, agent isolation, multi-file architecture -- is partially a response to context rot. If context rot did not exist, a single long-running agent with perfect recall would be sufficient.

---

## The Quality Degradation Curve

We model the degradation curve as the following design assumption, based on informal observation during Luca v1 development sessions. These zone boundaries are approximate heuristics, not empirically measured thresholds:

```
Quality
  ^
  |
  |  ============        PEAK (0-30% context used)
  |               \
  |                ----   GOOD (30-50% context used)
  |                    \
  |                     \  DEGRADING (50-70% context used)
  |                      \
  |                       \__________  POOR (70%+ context used)
  |
  +-------------------------------------------> Context Usage %
  0%    20%    40%    60%    80%    100%
```

### Zone Characteristics

| Zone          | Context Used | Quality                 | Observable Behaviors                                                                                                            |
| ------------- | ------------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **PEAK**      | 0-30%        | Thorough, comprehensive | Considers edge cases, follows all conventions, generates complete error handling, references earlier decisions accurately       |
| **GOOD**      | 30-50%       | Confident, solid        | Still follows conventions, but begins to miss edge cases; quality is sufficient for most tasks                                  |
| **DEGRADING** | 50-70%       | Efficiency mode         | Starts taking shortcuts; drops error handling; forgets project-specific conventions; produces working but lower-quality code    |
| **POOR**      | 70%+         | Rushed, minimal         | Misses obvious errors; ignores earlier context; falls back to pre-training defaults; hallucination rate increases significantly |

### The v1 Problem

In Luca v1, a typical development session follows this trajectory:

```
Session Start
  |
  v
[Cognitive Pre-Flight]     ~5% context    (PEAK zone)
  |
  v
[Discussion + Research]    ~15-25%        (PEAK zone)
  |
  v
[Planning]                 ~30-40%        (PEAK → GOOD transition)
  |
  v
[Execution: Wave 1]       ~45-55%        (GOOD → DEGRADING transition)
  |
  v
[Execution: Wave 2]       ~60-70%        (DEGRADING zone)
  |
  v
[Execution: Wave 3]       ~75-85%        (POOR zone)  <-- quality cliff
  |
  v
[Verification + Review]   ~85-95%        (POOR zone)  <-- reviewer is degraded too
  |
  v
[Learning Capture]         ~95%+          (POOR zone)
```

The critical insight: **the executor writing Wave 3 code and the reviewer verifying it are both operating in the POOR zone.** The reviewer cannot catch what the executor missed because both agents share the same degraded context.

---

## How v2 Prevents Context Rot

V2 uses four complementary strategies, each targeting a different aspect of the problem.

### Strategy 1: Many Small Agents with Fresh Context

Instead of one agent that accumulates context across the entire pipeline, v2 spawns independent agents for each concern. Each agent starts with a clean context window.

```
v1: Single Agent Journey
=====================================================
[pre-flight][discuss][research][plan][exec1][exec2][exec3][verify][review]
                                                    ^
                                    Context: 75% used, POOR quality

v2: Independent Agent Model
=====================================================
Agent A: [pre-flight + route]                    Context: ~10%, PEAK
Agent B: [research: auth patterns]               Context: ~15%, PEAK
Agent C: [research: database migration]          Context: ~15%, PEAK
Agent D: [research: error handling]              Context: ~15%, PEAK
Agent E: [review research B output]              Context: ~20%, PEAK
Agent F: [review research C output]              Context: ~20%, PEAK
Agent G: [plan from graduated research]          Context: ~25%, PEAK
Agent H: [review plan]                           Context: ~20%, PEAK
Agent I: [execute task 1 with targeted context]  Context: ~20%, PEAK
Agent J: [execute task 2 with targeted context]  Context: ~20%, PEAK
Agent K: [review implementation]                 Context: ~25%, PEAK
```

Every agent in v2 operates in the PEAK or GOOD zone. No agent ever reaches the DEGRADING zone because no single agent carries the full session history.

### Strategy 2: The "One Task, One Context" Principle

An executor in v2 does not receive the full conversation history. It receives:

1. **The plan for its specific task** -- not the full PLAN.md, just the section relevant to this task.
2. **The relevant research file(s)** -- not all research, just the files tagged for this task.
3. **Project conventions** -- loaded from MuninnDB brain tree (compact, stable, does not grow).

That is all. The executor does not know what other tasks exist, what the research phase discussed, or what previous executors produced. This is deliberate.

```
Traditional Executor Context:
+----------------------------------------------------------+
| Full conversation history                                |
| + All research findings                                  |
| + Complete plan with all tasks                           |
| + All previous executor outputs                          |
| + Review feedback from all reviewers                     |
| = 70-90% context used before writing a single line       |
+----------------------------------------------------------+

v2 Executor Context:
+----------------------------------------------------------+
| Task 3 plan section (200-500 tokens)                     |
| + auth-patterns.md research file (500-1500 tokens)       |
| + error-handling.md research file (500-1500 tokens)      |
| + Project conventions from MuninnDB (500-1000 tokens)    |
| = 5-15% context used, entire PEAK zone available         |
+----------------------------------------------------------+
```

### Strategy 3: Research Files as External Memory

Research files are the bridge between "many small agents" and "coherent project knowledge." They serve as external memory that persists across agent boundaries without consuming context in agents that do not need them.

```
Research Phase                        Execution Phase
=================                     ==================

Agent B writes:                       Agent I loads:
  auth-patterns.md --------+           auth-patterns.md  (needed)
                            |           [does NOT load database-migration.md]
Agent C writes:             |
  database-migration.md     |         Agent J loads:
                            |           database-migration.md  (needed)
Agent D writes:             |           error-handling.md  (needed)
  error-handling.md --------+           [does NOT load auth-patterns.md]
```

Each research file is:

- **Self-contained**: Includes all context needed to understand the finding, with sources cited.
- **Focused**: Covers one concern, not a grab-bag of related topics.
- **Selective**: Agents load only the files relevant to their task.
- **Verified**: Has been reviewed by a cold reviewer before reaching executors.

This pattern means that project knowledge grows without any single agent's context growing. The file system acts as infinite external memory.

### Strategy 4: Targeted Recall vs. Full Corpus

MuninnDB recall in v2 is scoped to the agent's task, not the full project. When an executor needs conventions for database access patterns, it recalls:

```typescript
// v1: Broad recall (returns everything vaguely related)
muninn_recall(vault: "<repo-vault>", context: "database patterns authentication error handling migration")

// v2: Targeted recall (returns only what this task needs)
muninn_recall(vault: "<repo-vault>", context: "PostgreSQL migration rollback strategy")
```

Targeted recall reduces noise in the returned engrams, keeping the agent focused on relevant context. Combined with research files (which provide task-specific findings), this means the executor has comprehensive but compact context.

---

## The Overhead Trade-Off

More agents means more overhead. V2 accepts this explicitly. The estimates below are design projections based on v1 experience, not measured quantities.

### What Costs More (estimated)

| Cost Factor                  | v1              | v2                | Increase                    |
| ---------------------------- | --------------- | ----------------- | --------------------------- |
| Agent spawn count            | 5-8 per session | 15-25 per session | 2-3x                        |
| Total tokens consumed        | Baseline        | +30-60%           | Moderate                    |
| Wall-clock time (parallel)   | Baseline        | +10-20%           | Minimal (parallel research) |
| Wall-clock time (sequential) | Baseline        | +40-70%           | Significant (review loops)  |

### What Costs Less (estimated)

| Cost Factor                 | v1          | v2         | Decrease    |
| --------------------------- | ----------- | ---------- | ----------- |
| Executor hallucination rate | Baseline    | -50-70%    | Significant |
| Verification failure rate   | Baseline    | -40-60%    | Significant |
| Rework after code review    | Baseline    | -30-50%    | Moderate    |
| Context per executor        | 70-90% used | 5-15% used | Dramatic    |

### The Break-Even Analysis

The question is whether the upfront cost of more agents is recovered in reduced rework. Our estimates, based on informal observation of Luca v1 sessions (not controlled measurements), suggest the following cost model:

- A hallucination caught in the research phase costs roughly hundreds of tokens to fix (re-research).
- A hallucination caught in code review costs roughly thousands of tokens to fix (rewrite + re-review).
- A hallucination caught in verification costs roughly thousands to tens of thousands of tokens to fix (debug + rewrite + re-verify).
- A hallucination that reaches production has unbounded cost.

We assume that for COMPLEX+ tasks (5+ files, cross-cutting concerns), the front-loaded research cost is recovered by preventing even a small number of hallucinations from reaching later pipeline stages. This is a design assumption that drives v2's architecture, not a precisely measured break-even point.

For TRIVIAL/SIMPLE tasks, the overhead is smaller because all steps still run but with reduced model tiers and iteration budgets. See [`05-review-loops/iteration-budgets.md`](../05-review-loops/iteration-budgets.md) for how complexity scales these parameters.

---

## Context Budgets Across the Pipeline

The context budgets below illustrate why v2's multi-agent architecture keeps every agent in the PEAK or GOOD zone. For the canonical step definitions, see [`01-workflow-steps/`](../01-workflow-steps/README.md).

| Step | Agent Role | Context Budget | Zone |
| --- | --- | --- | --- |
| 1. Ideate | Single scoping agent | ~10% | PEAK |
| 2. Research | Independent researcher per topic | ~15-20% | PEAK |
| 3. Discuss + Pre-mortem | Discussion agent | ~20-25% | PEAK |
| 4. Deep Expand | Expansion agent per topic | ~25% | PEAK |
| 5. Review Research | Cold reviewer per file | ~20% | PEAK |
| 6. Graduate to MuninnDB | Automated (lu-research-graduator) | N/A | N/A |
| 7. Plan | Planner loading graduated research | ~30% | PEAK/GOOD |
| 8. Review Plan | Cold plan reviewers | ~20-25% | PEAK |
| 9. Execute | Executor with targeted context | ~5-15% | PEAK |
| 10. Verify + UAT | Cold reviewers (includes impl review) | ~20-25% | PEAK |

No agent exceeds the GOOD zone. The heaviest context load is the planner (~30%), which still operates well within the safety margin.

---

## Monitoring Context Rot

V2 does not just prevent context rot -- it monitors for it. The context-monitor hook (`src/hooks/scripts/context-monitor.ts`) tracks context usage and triggers warnings:

| Context Level | Action                                                         |
| ------------- | -------------------------------------------------------------- |
| 0-30%         | Normal operation                                               |
| 30-50%        | Log context percentage                                         |
| 50-70%        | Warn: "Context entering DEGRADING zone"                        |
| 70%+          | Alert: "Context in POOR zone -- consider spawning fresh agent" |

This monitoring applies to each agent individually. In v2, no agent should ever reach the 50% threshold under normal operation. If one does, it indicates a design problem (too much context loaded) rather than an expected condition.

---

## Key Takeaways

1. **Context rot is not a risk to manage -- it is a certainty to design around.** Every long-running agent will hit the degradation curve. The only question is when.

2. **The solution is architectural, not behavioral.** You cannot prompt your way out of context rot. The model does not choose to degrade; it is a structural property of transformer attention.

3. **Many small agents > one large agent** for any task where quality matters more than latency. The overhead of agent spawning is small compared to the cost of degraded output.

4. **Research files are the key enabler.** They allow project knowledge to persist and grow without any single agent's context growing. They are external memory for AI agents.

5. **"One task, one context" is the execution principle.** An executor with 10% context usage and the right 10% of context will outperform an executor with 80% context usage and everything.

---

## Related Documents

- [README.md](README.md) -- How context rot prevention connects to other v2 principles
- [multi-file-architecture.md](multi-file-architecture.md) -- The file system that enables external memory
- [agent-isolation-patterns.md](agent-isolation-patterns.md) -- Why fresh agents must not inherit prior context
- [grounded-decisions.md](grounded-decisions.md) -- How research files are produced with verified content
