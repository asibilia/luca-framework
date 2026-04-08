# Research: Pipeline Ceremony Overhead (Learning 7)

> **Learning:** Pipeline ceremony overhead is real. GSD2 measured 60% ceremony (18 of 30 sessions per milestone are non-execution). Their ADR-003 proposes collapsing to 16 sessions.
>
> **Cross-references:** Learning 6 (deterministic classification), Learning 8 (token profiles)

## Current Agent Spawn Count Per Phase

Counted from `lu.skill.ts` Step 7, every named Agent() call for a single v1 phase execution:

### Mandatory agents (always fire)

| #   | Agent name pattern     | Step | subagent_type         | Routing preset | Purpose                          |
| --- | ---------------------- | ---- | --------------------- | -------------- | -------------------------------- |
| 1   | `classify-{NN}`        | 7c   | lu-cognition          | ALWAYS_FAST    | Per-phase complexity re-classify |
| 2   | `discuss-{NN}`         | 7e   | lu-discuss-researcher | ORCHESTRATOR   | Phase discussion                 |
| 3   | `plan-{NN}`            | 7g   | lu-planner            | ORCHESTRATOR   | Create PLAN.md                   |
| 4   | `execute-{NN}`         | 7h   | lu-executor           | ORCHESTRATOR   | Execute wave tasks               |
| 5   | `harness-{NN}`         | 7i   | lu-verifier-fast      | FAST_PROMOTED  | Run tsc + test                   |
| 6   | `verify-{NN}`          | 7j   | lu-verifier           | DEEP_ANALYSIS  | Goal-backward verification       |
| 7   | `review-arch-{NN}`     | 7k   | code-architect        | DEEP_ANALYSIS  | Architecture review              |
| 8   | `review-dx-{NN}`       | 7k   | dx-advocate           | DEEP_ANALYSIS  | DX review                        |
| 9   | `review-security-{NN}` | 7k   | security-auditor      | DEEP_ANALYSIS  | Security review                  |
| 10  | `review-simplify-{NN}` | 7k   | code-simplifier       | DEEP_ANALYSIS  | Simplification review            |
| 11  | `learn-{NN}`           | 7l   | lu-learner            | FAST_PROMOTED  | Learning capture                 |

### Conditional agents (often fire)

| #   | Agent name pattern  | Step | Condition            | Purpose            |
| --- | ------------------- | ---- | -------------------- | ------------------ |
| 12  | `fix-{NN}`          | 7i   | harness fails        | Fix harness errors |
| 13  | `process-data-{NN}` | 7m   | `--run-process-data` | Process telemetry  |
| 14  | `plan-gaps-{NN}`    | 7p   | phase had gaps       | Plan gap closure   |
| 15  | `execute-gaps-{NN}` | 7p   | phase had gaps       | Execute gap plan   |

### Pre-phase agents (fire once per session, not per phase)

| #   | Agent name pattern | Step | Purpose                           |
| --- | ------------------ | ---- | --------------------------------- |
| 16  | `cognition`        | 2    | Cognitive pre-flight              |
| 17  | `classify`         | 2    | Initial complexity classification |
| 18  | `configure`        | 4    | Session configuration             |
| 19  | `backlog`          | 5    | Backlog scan                      |

### v2-only agents (per phase, when version=v2)

| #   | Agent name pattern          | Step   | Purpose                 |
| --- | --------------------------- | ------ | ----------------------- |
| 20  | `research-scope-{NN}`       | 7d-v2a | Research scoping        |
| 21  | `research-arch-{NN}`        | 7d-v2b | Architecture research   |
| 22  | `research-impl-{NN}`        | 7d-v2b | Implementation research |
| 23  | `research-eco-{NN}`         | 7d-v2b | Ecosystem research      |
| 24  | `research-risk-{NN}`        | 7d-v2b | Risk research           |
| 25  | `research-synth-{NN}`       | 7d-v2c | Research synthesis      |
| 26  | `review-accuracy-{NN}`      | 7d-v2d | Accuracy review         |
| 27  | `review-completeness-{NN}`  | 7d-v2d | Completeness review     |
| 28  | `review-actionability-{NN}` | 7d-v2d | Actionability review    |
| 29  | `research-expand-{NN}`      | 7d-v2d | Expand research gaps    |
| 30  | `research-graduate-{NN}`    | 7d-v2e | Graduate findings       |
| 31  | `plan-review-{NN}`          | 7g-v2  | Plan review             |
| 32  | `plan-revise-{NN}`          | 7g-v2  | Plan revision           |

### Milestone agents (fire once at milestone boundary)

| #   | Agent name pattern   | Step | Purpose                 |
| --- | -------------------- | ---- | ----------------------- |
| 33  | `milestone-learn`    | 8    | Milestone learning      |
| 34  | `milestone-prune`    | 8    | Prune obsolete content  |
| 35  | `milestone-shadow`   | 8    | Shadow debt scan        |
| 36  | `milestone-archive`  | 8    | Archive phase artifacts |
| 37  | `milestone-finalize` | 8    | Finalize milestone      |

### Total counts

| Scenario                | Agent calls per phase | Notes                                          |
| ----------------------- | --------------------- | ---------------------------------------------- |
| v1 minimal (happy path) | 11                    | No fixes, no gaps                              |
| v1 typical              | 13-15                 | 1 fix, process-data, maybe gaps                |
| v2 minimal              | 22                    | v1 + research pipeline (no review loops)       |
| v2 typical              | 25-28                 | v1 + research + 1 review loop + plan review    |
| v2 worst case           | 33+                   | Multiple review loops, multiple fix iterations |

**For a 5-phase milestone (v1 typical): ~65-75 agent calls.**
**For a 5-phase milestone (v2 typical): ~125-140 agent calls.**

## Value-Proportional-to-Cost Analysis

### High value (keep as-is)

| Agent          | Value        | Rationale                                                                   |
| -------------- | ------------ | --------------------------------------------------------------------------- |
| `execute-{NN}` | **Critical** | Does the actual work. Cannot be eliminated.                                 |
| `plan-{NN}`    | **High**     | Creates the execution blueprint. Directly impacts execution quality.        |
| `harness-{NN}` | **High**     | Mechanical verification (tsc, tests). Catches real errors.                  |
| `verify-{NN}`  | **High**     | Goal-backward verification catches semantic gaps harness misses.            |
| `cognition`    | **High**     | Context loading pays off across entire session. Per-session cost amortized. |

### Moderate value (candidates for optimization)

| Agent                   | Current value    | Issue                                                                                                                                 | Optimization                                                                                                                                                          |
| ----------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `discuss-{NN}`          | **Moderate**     | Often produces boilerplate when phase scope is clear.                                                                                 | Merge into planning prompt. Discussion context can be a section of the plan prompt rather than a separate agent call.                                                 |
| `review-*` (4 parallel) | **Moderate**     | Four separate DEEP_ANALYSIS calls. Reviews often produce similar feedback.                                                            | Consolidate to 2 reviewers: `review-structure` (architecture + simplification) and `review-safety` (security + DX). Or single reviewer with multi-perspective prompt. |
| `learn-{NN}`            | **Low-Moderate** | Captures patterns, but at FAST_PROMOTED tier it produces thin output. Learning value is highest at milestone boundary, not per-phase. | Make per-phase learning mechanical (append structured JSON) and reserve LLM learning for milestone boundary only.                                                     |
| `process-data-{NN}`     | **Low**          | Telemetry collection. Could be purely mechanical.                                                                                     | Replace with inline TypeScript: read context file, compute metrics, write JSON. No LLM needed.                                                                        |

### Low value (candidates for elimination or merge)

| Agent                       | Current value    | Issue                                                                                                                                                             | Recommendation                                                                                                        |
| --------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `classify-{NN}` (per-phase) | **Low**          | Re-classifies complexity per phase. GSD2 Learning 6 shows this can be deterministic. Initial session-level classify is sufficient; per-phase is over-engineering. | Eliminate. Use session-level complexity. If per-phase differentiation needed, use heuristic (count tasks in PLAN.md). |
| `classify` (session-level)  | **Low-Moderate** | LLM call for a task that heuristics can handle (Learning 6).                                                                                                      | Replace with deterministic function: file count + task count + keyword analysis. Save the Agent() call.               |
| `configure`                 | **Low**          | Reads config.json and sets flags. Pure data parsing, no LLM needed.                                                                                               | Replace with inline bash/TypeScript. No Agent() call required.                                                        |
| `backlog`                   | **Low**          | Scans todos directory. Could be a file read + structured parse.                                                                                                   | Replace with TypeScript utility. LLM adds no value to directory scanning.                                             |

### v2 Research pipeline assessment

| Agent group              | Value            | Issue                                                                           | Recommendation                                                                                                 |
| ------------------------ | ---------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 4 parallel researchers   | **Moderate**     | Valuable for COMPLEX+ phases. Overkill for TRIVIAL/SIMPLE.                      | Gate on profile (Learning 8): budget profile skips entirely, balanced runs 2, quality runs 4.                  |
| 3 research reviewers     | **Low-Moderate** | Review loop is the most ceremony-heavy part. Multiple iterations multiply cost. | Cap at 1 iteration for balanced profile. Quality profile gets the full loop.                                   |
| `research-graduate-{NN}` | **Low**          | Graduation is a structured evaluation that could be mechanical.                 | Merge into synthesis. The synthesizer can score findings and flag graduation candidates as part of its output. |
| `research-scope-{NN}`    | **Moderate**     | Determines what to research. Adds value.                                        | Keep, but make its output more structured so downstream agents need less context.                              |

## Proposed Merges

### Merge 1: Classification becomes deterministic (Learning 6 synergy)

**Before:** 2 LLM calls (session classify + per-phase classify)
**After:** 0 LLM calls

Replace with a TypeScript function in the orchestrator:

```
function classifyPhase(phaseDescription: string, planTasks: Task[]): ComplexityLevel {
  const taskCount = planTasks.length
  const fileScope = countUniqueFiles(planTasks)
  const keywords = detectComplexityKeywords(phaseDescription)
  // Heuristic scoring
  if (taskCount <= 2 && fileScope <= 3) return "TRIVIAL"
  if (taskCount <= 5 && fileScope <= 5) return "SIMPLE"
  if (keywords.architectural || fileScope > 10) return "COMPLEX"
  return "MODERATE"
}
```

**Savings:** 2 agent calls per session, 1 agent call per phase
**Risk:** Misclassification on edge cases. Mitigate with `--complexity=LEVEL` override.

### Merge 2: Discussion folded into planning

**Before:** `discuss-{NN}` + `plan-{NN}` = 2 LLM calls
**After:** `plan-{NN}` with expanded prompt = 1 LLM call

The discussion agent's output (user decisions, constraints, context) becomes a section in the planning prompt. The planner considers discussion context alongside task decomposition in a single pass.

**Savings:** 1 agent call per phase
**Risk:** Planner prompt becomes larger. Mitigate by making discussion context concise and structured.
**Exception:** When `--ask` flag is set (interactive mode), discussion remains a separate step because it requires user input.

### Merge 3: Four code reviewers consolidated to two

**Before:** 4 parallel DEEP_ANALYSIS calls
**After:** 2 parallel DEEP_ANALYSIS calls

- `review-structure-{NN}`: Architecture + simplification (code-architect + code-simplifier merged prompt)
- `review-safety-{NN}`: Security + DX (security-auditor + dx-advocate merged prompt)

**Savings:** 2 agent calls per phase
**Risk:** Less depth per review dimension. Mitigate by making review prompts cover both perspectives explicitly.
**Alternative:** Single reviewer with a multi-perspective prompt. Saves 3 calls but reduces parallelism benefit.

### Merge 4: Learning capture becomes mechanical (per-phase)

**Before:** `learn-{NN}` LLM call per phase
**After:** Inline structured capture per phase, LLM learning at milestone only

Per-phase: Read verification output + review findings, extract structured JSON (patterns discovered, pitfalls hit, decisions made). Write to session context. No LLM.

Milestone boundary: `milestone-learn` agent gets the accumulated per-phase structured data and produces the semantic learning (MuninnDB engrams) with full LLM reasoning.

**Savings:** 1 agent call per phase (learning still runs at milestone)
**Risk:** Mechanical capture may miss nuanced learnings. Mitigate by making the structured capture template comprehensive.

### Merge 5: Process data becomes mechanical

**Before:** `process-data-{NN}` LLM call
**After:** Inline TypeScript: read context metrics, compute aggregates, write JSON

**Savings:** 1 agent call per phase
**Risk:** None. This is pure data aggregation.

### Merge 6: Configure becomes inline

**Before:** `configure` Agent() call
**After:** Inline bash: read config.json, set shell variables

**Savings:** 1 agent call per session
**Risk:** None. Config reading is deterministic.

### Merge 7: Backlog scan becomes deterministic

**Before:** `backlog` Agent() call
**After:** TypeScript function: scan todos/pending/, parse WSJF from frontmatter, return sorted list

**Savings:** 1 agent call per session
**Risk:** LLM backlog agent may catch nuances in todo descriptions that heuristics miss. Mitigate by making the structured scan comprehensive.

### Merge 8: Research graduation merged into synthesis

**Before:** `research-synth-{NN}` + `research-graduate-{NN}` = 2 calls
**After:** `research-synth-{NN}` with graduation criteria in prompt = 1 call

**Savings:** 1 agent call per phase (v2 only)
**Risk:** Synthesis prompt grows larger. Low risk since both operate on the same data.

## Before/After Agent Count Summary

### Per-phase (v1)

| Category       | Before | After | Savings                   |
| -------------- | ------ | ----- | ------------------------- |
| Classification | 1      | 0     | -1 (deterministic)        |
| Discussion     | 1      | 0     | -1 (merged into planning) |
| Planning       | 1      | 1     | 0                         |
| Execution      | 1      | 1     | 0                         |
| Harness        | 1      | 1     | 0                         |
| Verification   | 1      | 1     | 0                         |
| Code review    | 4      | 2     | -2 (consolidated)         |
| Learning       | 1      | 0     | -1 (mechanical)           |
| Process data   | 1      | 0     | -1 (mechanical)           |
| **Total**      | **12** | **6** | **-6 (50% reduction)**    |

### Per-session (v1)

| Category       | Before | After | Savings            |
| -------------- | ------ | ----- | ------------------ |
| Cognition      | 1      | 1     | 0                  |
| Classification | 1      | 0     | -1 (deterministic) |
| Configure      | 1      | 0     | -1 (inline)        |
| Backlog        | 1      | 0     | -1 (deterministic) |
| **Total**      | **4**  | **1** | **-3**             |

### Per-phase (v2, additional to v1)

| Category             | Before | After               | Savings                  |
| -------------------- | ------ | ------------------- | ------------------------ |
| Research scope       | 1      | 1                   | 0                        |
| Parallel researchers | 4      | 4 (profile-gated)   | 0-4 depending on profile |
| Research synthesis   | 1      | 1                   | 0                        |
| Research review loop | 3-9    | 0-3 (profile-gated) | 3-6                      |
| Research graduation  | 1      | 0                   | -1 (merged)              |
| Plan review          | 1-3    | 1-3                 | 0                        |
| **Total (typical)**  | **13** | **6-10**            | **-3 to -7**             |

### Full milestone (5 phases, v1)

| Metric             | Before | After | Reduction         |
| ------------------ | ------ | ----- | ----------------- |
| Per-session agents | 4      | 1     | -3                |
| Per-phase agents   | 12     | 6     | -6                |
| Total agents       | 64     | 31    | **52% reduction** |

### Full milestone (5 phases, v2 balanced profile)

| Metric                     | Before | After | Reduction         |
| -------------------------- | ------ | ----- | ----------------- |
| Per-session agents         | 4      | 1     | -3                |
| Per-phase agents (v1 + v2) | 25     | 14    | -11               |
| Total agents               | 129    | 71    | **45% reduction** |

## Constraints from Claude Code Runtime

1. **No session lifecycle control.** Unlike GSD2, we cannot create fresh context windows per agent. Each Agent() call runs within the parent session's context window. This means ceremony overhead in Claude Code is measured in prompt tokens (building the agent prompt) + output tokens (agent response), not in session setup cost.

2. **Agent() calls are the smallest unit of fresh context.** Each Agent() gets its own sub-agent context, but the parent orchestrator accumulates context across all calls. Reducing agent count directly reduces parent context accumulation.

3. **Inline operations are free.** Shell commands and TypeScript execution (via `bun`) within the orchestrator prompt cost no agent overhead. Every agent we replace with an inline operation saves prompt+response tokens AND reduces parent context growth.

4. **Parallel agent calls share context cost.** Running 4 reviewers in parallel costs the same parent context as running 4 sequentially (all results accumulate). Reducing from 4 to 2 reviewers directly halves the review context overhead.

## Interaction with Other Learnings

- **Learning 6 (Deterministic Classification):** Directly enables Merge 1. Classification becomes a TypeScript heuristic, eliminating 2-3 agent calls.
- **Learning 8 (Token Profiles):** Profiles control which ceremony is worth running. Budget profile might skip code review entirely. Quality profile runs all 4 reviewers. This is complementary to the merges proposed here.
- **Learning 9 (Structured State):** Mechanical learning capture (Merge 4) and process data (Merge 5) produce structured JSON rather than prose, aligning with the "state is data" principle.
- **Learning 10 (Crash Recovery):** Fewer agent calls means fewer potential crash points. Simpler pipeline is inherently more recoverable.

## Risks of NOT Adopting

- Continued 50%+ ceremony overhead per milestone
- Context window pressure from accumulated agent responses in the parent orchestrator
- Diminishing returns as more agents are added to the pipeline (v2 research is already +13 agents)
- Each unnecessary agent call is a potential failure point in crash recovery

## Recommendation

Adopt merges 1-7 for v1 pipeline (50% agent reduction). For v2, gate the research pipeline behind token profiles (Learning 8) so budget profile pays zero ceremony for research, and balanced profile pays a reduced amount. Quality profile gets the full pipeline.

The single most impactful change is making classification deterministic (Merge 1 + Learning 6 synergy) because it eliminates LLM calls for a task that is well-defined enough for heuristics.
