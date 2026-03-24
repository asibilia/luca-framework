# Iteration Budgets

> Resource management for review loops: token budgets, complexity-gated iteration caps, total overhead calculations, ROI analysis, and configuration integration. **This is the canonical specification** for iteration budgets (Decision 14, Decision 19).

---

## Token Budgets Per Review Iteration

Each review iteration involves spawning multiple agents, each consuming tokens for context loading and review generation. The following estimates are based on typical research corpus sizes and plan complexity.

### Research Review

| Component                           | Input Tokens | Output Tokens | Total       |
| ----------------------------------- | ------------ | ------------- | ----------- |
| lu-completeness-reviewer            | ~17,000      | ~5,000        | ~22,000     |
| lu-accuracy-reviewer                | ~17,000      | ~5,000        | ~22,000     |
| lu-actionability-reviewer           | ~17,000      | ~5,000        | ~22,000     |
| Orchestrator aggregation + decision | ~1,500       | ~500          | ~2,000      |
| **Total per iteration**             |              |               | **~68,000** |

Input token breakdown per reviewer: research corpus (~10-15k tokens for a MODERATE task) + CONTEXT.md (~2-3k tokens) + user intent (~500 tokens) + system prompt / agent definition overhead (~2-4k tokens). Output is structured and concise (~3-5k tokens per reviewer).

### Plan Review

| Component                           | Input Tokens | Output Tokens | Total       |
| ----------------------------------- | ------------ | ------------- | ----------- |
| code-architect                      | ~13,000      | ~4,000        | ~17,000     |
| dx-advocate                         | ~13,000      | ~4,000        | ~17,000     |
| security-auditor                    | ~13,000      | ~4,000        | ~17,000     |
| Orchestrator aggregation + decision | ~1,500       | ~500          | ~2,000      |
| **Total per iteration**             |              |               | **~53,000** |

Plan review input per reviewer: PLAN.md (~3-5k tokens) + research corpus (~10-15k tokens, as reference) + CONTEXT.md (~2-3k tokens) + user intent (~500 tokens) + system prompt / agent definition overhead (~2-4k tokens). Plan reviewers also load the research corpus as reference, which accounts for most of the input cost.

### Targeted Re-Expansion (Research Loop Only)

When the research review loop iterates, targeted researchers are spawned to address specific gaps:

| Component                                                | Input Tokens | Output Tokens | Total       |
| -------------------------------------------------------- | ------------ | ------------- | ----------- |
| Gap description + relevant research file + system prompt | ~5,000       | --            | ~5,000      |
| Tool calls (Context7, WebFetch, WebSearch)               | --           | --            | ~15,000     |
| Addendum to research file                                | --           | ~5,000        | ~5,000      |
| **Total per targeted researcher**                        |              |               | **~25,000** |

Tool call token consumption varies significantly: a researcher making 2-3 tool calls can consume 10,000-30,000 tokens in tool responses alone. The ~15,000 estimate assumes 2 tool calls with moderate response sizes. For non-trivial research gaps, actual consumption may be higher.

Typical re-expansion spawns 2-3 targeted researchers per iteration, adding ~50,000-75,000 tokens.

### Plan Revision (Plan Loop Only)

When the plan review loop iterates, lu-planner revises specific tasks:

| Component                                                  | Tokens Per Revision |
| ---------------------------------------------------------- | ------------------- |
| Input (revision request + current PLAN.md + research refs) | ~12,000             |
| Output (revised PLAN.md sections)                          | ~5,000              |
| **Total per revision**                                     | **~17,000**         |

---

## Max Iterations by Complexity (Decision 14)

**This is the canonical iteration budget table.** All other documents should reference this table, not redefine it.

Review loops are capped by the task's complexity level. The caps are intentionally conservative -- most reviews converge in 1-2 iterations. The higher caps for COMPLEX and CRITICAL tasks account for larger research surfaces and more intricate plans.

| Complexity | Research Review Max | Plan Review Max | Rationale                                                                                 |
| ---------- | ------------------- | --------------- | ----------------------------------------------------------------------------------------- |
| TRIVIAL    | 1                   | 1               | Single review pass; if issues exist, scope is wrong                                       |
| SIMPLE     | 2                   | 1               | One revision opportunity for research; plan should be correct after good research         |
| MODERATE   | 2                   | 2               | Standard budget; covers most cases                                                        |
| COMPLEX    | 3                   | 2               | Larger research surface may need multiple passes; plan revision budget stays moderate     |
| CRITICAL   | 3                   | 3               | Maximum budget for highest-risk work; convergence failure triggers mandatory human review |

**Note**: 3 reviewers run at all complexity levels (Decision 13). Complexity affects model tier and iteration budget, not reviewer count.

### Relationship to Existing Complexity Matrix

The existing `config.json` complexity matrix has a `planVerificationIterations` field that maps to the plan review loop. The research review loop iterations are a new field:

| Config Field                  | Purpose                                           | Existing?                 |
| ----------------------------- | ------------------------------------------------- | ------------------------- |
| `planVerificationIterations`  | Plan review loop max iterations                   | Yes (maps to plan review) |
| `researchReviewMaxIterations` | Research review loop max iterations               | New (v2)                  |
| `reviewSkipComplexity`        | Complexity level at which to skip review entirely | New (v2)                  |

---

## Total Overhead Calculation

### Per-Complexity Worst Case

The following table shows the maximum token overhead for both review loops combined, assuming every iteration is used:

| Complexity | Research Review | Re-Expansion   | Plan Review    | Plan Revision | Total Max |
| ---------- | --------------- | -------------- | -------------- | ------------- | --------- |
| TRIVIAL    | 1 x 68k = 68k   | 0 (no loop)    | 1 x 53k = 53k  | 0             | **121k**  |
| SIMPLE     | 2 x 68k = 136k  | 1 x 63k = 63k  | 1 x 53k = 53k  | 0             | **252k**  |
| MODERATE   | 2 x 68k = 136k  | 1 x 63k = 63k  | 2 x 53k = 106k | 1 x 17k = 17k | **322k**  |
| COMPLEX    | 3 x 68k = 204k  | 2 x 63k = 126k | 2 x 53k = 106k | 1 x 17k = 17k | **453k**  |
| CRITICAL   | 3 x 68k = 204k  | 2 x 63k = 126k | 3 x 53k = 159k | 2 x 17k = 34k | **523k**  |

Re-expansion estimate assumes ~2.5 targeted researchers per iteration at ~25k each = ~63k.

### Typical Case (Most Common Path)

In practice, most reviews converge in 1-2 iterations. The typical case assumes the most common iteration count for each complexity level:

| Complexity | Typical Research Iters | Typical Plan Iters | Typical Total | Assumption                                    |
| ---------- | ---------------------- | ------------------ | ------------- | --------------------------------------------- |
| TRIVIAL    | 1                      | 1                  | ~121k         | Single pass, no looping                       |
| SIMPLE     | 1                      | 1                  | ~121k         | Usually converges on first pass               |
| MODERATE   | 2                      | 1                  | ~184k         | One research loop + re-expansion, plan passes |
| COMPLEX    | 2                      | 2                  | ~289k         | Research and plan each need one revision      |
| CRITICAL   | 2                      | 2                  | ~289k         | Same as COMPLEX typical, budget allows more   |

### Cost Comparison

At current model pricing (approximate, varies by provider and model tier):

| Tokens | Cost (capable tier) | Cost (balanced tier) |
| ------ | ------------------- | -------------------- |
| 100k   | ~$1.50              | ~$0.50               |
| 250k   | ~$3.75              | ~$1.25               |
| 450k   | ~$6.75              | ~$2.25               |

Review loop overhead for a typical MODERATE task is roughly $1.50-$2.00 at capable tier pricing.

---

## ROI Analysis

### Cost of Review Loops vs. Cost of Fixing Wrong Implementation

The fundamental question: is it cheaper to spend tokens reviewing research and plans, or to spend tokens fixing bad implementations?

```
Cost of review (worst case, COMPLEX):    ~377k tokens = ~$5.65

Cost of wrong implementation:
  - Executor implements wrong approach:   ~100k tokens (wasted)
  - Verification catches the error:       ~50k tokens
  - Debugging and root-cause analysis:    ~80k tokens
  - Re-planning with correct approach:    ~60k tokens
  - Re-execution:                         ~100k tokens
  - Re-verification:                      ~50k tokens
  Total rework:                           ~440k tokens = ~$6.60

  Plus: context rot from the wasted execution
  Plus: risk of cascading errors in dependent tasks
  Plus: human time reviewing the failed attempt
```

**Conclusion**: Review loops pay for themselves if they prevent even one major rework cycle. We model the v1 rework rate at approximately 30-40% of MODERATE+ tasks based on observed patterns (this is a design assumption, not a controlled measurement). Even at a 50% rework prevention rate, review loops have a positive ROI.

### Break-Even Analysis

```
Review overhead (MODERATE):           ~322k tokens
Rework cost per incident:            ~440k tokens
Break-even rework prevention rate:   322k / 440k = 73.2%

If review loops prevent rework in >73.2% of cases, they have positive ROI.
Given that cold isolation catches issues that warm review misses,
we assume the actual prevention rate is 70-85% (design assumption).
```

### Compounding Effect

Review loops also reduce secondary costs:

- **Fewer verification failures**: Verified research leads to correct implementations that pass verification on the first attempt
- **Faster convergence in execution**: Executors with grounded research spend less time guessing
- **Better MuninnDB engrams**: Graduated research is higher quality, improving future sessions
- **Lower human review burden**: Plans that pass automated review need less human attention

---

## TRIVIAL Complexity Handling

**All 10 steps run at all complexity levels** (Decision 17). Review loops are NOT skipped for TRIVIAL tasks. Instead, TRIVIAL tasks use reduced overhead:

- Reviewers use `fast` model tier (cheapest)
- Iteration budget is capped at 1 (no looping)
- Total overhead is ~121k tokens (single pass for both loops)

This preserves the v1 invariant that no steps are skipped based on complexity alone, while keeping TRIVIAL overhead minimal.

---

## Config.json Integration (Decision 9)

Review loop iteration budgets are configured in `.planning/config.json`. All config keys use **camelCase** (Decision 9).

```json
{
  "complexity": {
    "matrix": {
      "TRIVIAL": {
        "cognitivePreflight": "lite",
        "planVerificationIterations": 1,
        "researchReviewMaxIterations": 1,
        "harnessFixIterations": 1,
        "verifyFixIterations": 1,
        "verificationMode": "quick",
        "recallDepth": 1
      },
      "SIMPLE": {
        "cognitivePreflight": "lite",
        "planVerificationIterations": 1,
        "researchReviewMaxIterations": 2,
        "harnessFixIterations": 2,
        "verifyFixIterations": 1,
        "verificationMode": "quick",
        "recallDepth": 1
      },
      "MODERATE": {
        "cognitivePreflight": "full",
        "planVerificationIterations": 2,
        "researchReviewMaxIterations": 2,
        "harnessFixIterations": 2,
        "verifyFixIterations": 1,
        "verificationMode": "standard",
        "recallDepth": 3
      },
      "COMPLEX": {
        "cognitivePreflight": "full",
        "planVerificationIterations": 2,
        "researchReviewMaxIterations": 3,
        "harnessFixIterations": 2,
        "verifyFixIterations": 1,
        "verificationMode": "full",
        "recallDepth": null
      },
      "CRITICAL": {
        "cognitivePreflight": "full",
        "planVerificationIterations": 3,
        "researchReviewMaxIterations": 3,
        "harnessFixIterations": 3,
        "verifyFixIterations": 2,
        "verificationMode": "full+human",
        "recallDepth": null
      }
    }
  },
  "research": {
    "parallelResearchers": 4,
    "reviewLoop": {
      "maxIterations": 3,
      "continueForImportant": true
    },
    "planReviewLoop": {
      "maxIterations": 2
    },
    "graduation": {
      "confidenceThreshold": "MEDIUM",
      "scoringThreshold": 0.55,
      "autoCleanupAfterMilestone": false
    },
    "perTaskRecall": {
      "enabled": true,
      "maxEngramsPerTask": 5
    }
  }
}
```

### Field Descriptions

| Field                         | Location                    | Type    | Description                                                              |
| ----------------------------- | --------------------------- | ------- | ------------------------------------------------------------------------ |
| `researchReviewMaxIterations` | `complexity.matrix.{level}` | number  | Maximum research review loop iterations for this complexity level        |
| `planVerificationIterations`  | `complexity.matrix.{level}` | number  | Maximum plan review loop iterations (existing field, reused)             |
| `maxIterations`               | `research.reviewLoop`       | number  | Global default for research review max iterations (overridden by matrix) |
| `continueForImportant`        | `research.reviewLoop`       | boolean | Whether IMPORTANT findings trigger additional research review iterations |
| `maxIterations`               | `research.planReviewLoop`   | number  | Global default for plan review max iterations (overridden by matrix)     |

**Config key naming**: All keys use camelCase (Decision 9). The `research.reviewLoop` structure replaces any prior `review_max_iterations` or `researchReviewIterations` keys. There is no `reviewSkipComplexity` config key -- review loops always run (Decision 17).

### Resolution Priority

When determining the iteration budget for a review loop:

1. **Complexity matrix value** (highest priority): `complexity.matrix.MODERATE.researchReviewMaxIterations`
2. **Research section default** (fallback): `research.reviewLoop.maxIterations`
3. **Hardcoded default** (final fallback): 2 for research review, 1 for plan review

---

## Budget Visualization

For a MODERATE task, the token budget flows through the pipeline as follows:

```
TOTAL PIPELINE BUDGET (MODERATE)
|
+-- Pre-research phases (Steps 1-4)
|   |-- Ideate:            ~2k tokens
|   |-- Research (4 agents): ~200k tokens
|   |-- Discuss:           ~30k tokens
|   |-- Deep expand:       ~120k tokens
|   Total:                 ~352k tokens
|
+-- REVIEW LOOPS (Steps 5, 8)                    <-- this document
|   |-- Research review:   ~164k tokens (2 iters)
|   |-- Plan review:       ~111k tokens (2 iters)
|   Total:                 ~275k tokens (worst case)
|   Typical:               ~149k tokens
|
+-- Post-review phases (Steps 6-7, 9-10)
|   |-- Graduate:          ~15k tokens
|   |-- Plan:              ~50k tokens
|   |-- Execute (3 tasks): ~300k tokens
|   |-- Verify + UAT:      ~80k tokens
|   Total:                 ~445k tokens
|
TOTAL:                     ~1,072k tokens (worst case)
                           ~946k tokens (typical)
```

Review loops account for approximately 15-25% of the total pipeline budget. This is a deliberate investment: spending 15-25% upfront to prevent the 30-40% rework rate observed in v1.

---

## Monitoring and Adjustment

### Token Tracking

The orchestrator tracks actual token consumption per review loop iteration. This data is used to:

1. **Validate estimates**: Compare actual vs. budgeted token consumption
2. **Detect anomalies**: Flag iterations that consume 2x or more of the budgeted amount
3. **Refine budgets**: Adjust per-reviewer budgets based on observed consumption patterns

### Iteration Budget Adjustment

If a project consistently converges in 1 iteration for MODERATE tasks, the administrator can reduce `researchReviewMaxIterations` to 1 for that complexity level, saving the unused budget.

Conversely, if a project frequently triggers emergency exits at COMPLEX level, the administrator can increase the budget to 4.

### Process Improvement Signal

Convergence data flows into MuninnDB as process metrics:

```
metric:signal-rate-review-token-efficiency
  = actual_tokens / budgeted_tokens (per loop, per complexity)

metric:signal-rate-review-convergence-speed
  = iterations_used / max_iterations (per loop, per complexity)
```

Trends in these metrics indicate whether the research and planning agents are improving over time. Decreasing convergence speed (fewer iterations needed) suggests that MuninnDB recall is providing better context, leading to higher-quality first drafts.

---

## Related Documentation

- [README.md](README.md) -- Overview of both review loops
- [convergence-criteria.md](convergence-criteria.md) -- When loops converge, stall, or diverge
- [research-review-protocol.md](research-review-protocol.md) -- Research review loop protocol
- [plan-review-protocol.md](plan-review-protocol.md) -- Plan review loop protocol
- [Complexity Gating](../../../../.claude/rules/complexity-gating.md) -- Full complexity matrix and model routing
