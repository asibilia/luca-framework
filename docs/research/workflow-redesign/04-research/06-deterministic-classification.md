# Research: Learning 6 — Complexity Classification Should Be Deterministic

> **Date:** 2026-03-31
> **Status:** Research complete
> **Learning:** GSD2 Learning 6 — Complexity Classification is Deterministic
> **Pipeline scope:** Step 1 (Cognitive Pre-Flight + Classify), Step 5c/7c (Per-Phase Re-Classify)
> **Cross-references:** [04-stuck-detection.md](./04-stuck-detection.md), [05-structured-verification.md](./05-structured-verification.md)

## Summary

GSD2 classifies complexity with sub-millisecond heuristics: unit type defaults, task plan analysis (step count, file count, description length, complexity keywords), and routing history. No LLM call. Luca currently spawns `Agent("classify")` which invokes an LLM to determine one of five complexity levels. This LLM call costs tokens, adds latency, and introduces non-determinism into what is fundamentally a well-defined heuristic task. The model routing table already exists (`src/complexity/__helpers/model-routing.ts`) -- we just need a deterministic function to feed it the right complexity level.

## Current State

### How Classification Works Today

The proposed pipeline (Step 1) and current `lu.skill.ts` (Step 2) both use:

```
Agent(name: "classify", subagent_type: "lu-cognition", model: ALWAYS_FAST, prompt: CLASSIFY_PROMPT({...}))
```

The `CLASSIFY_PROMPT` (from `agent-prompts.ts` line 691) instructs the agent to:

```
1. Read the user's request from the orchestrator's context
2. Classify complexity: TRIVIAL (1 file), SIMPLE (2-3), MODERATE (3-5), COMPLEX (5-10), CRITICAL (10+)
3. Determine route: phase-execute, quick, pr-address, debug, ...
4. Return both decisions
```

Output contract: `COMPLEXITY: {level}\nROUTE: {route type}`

This is an LLM call that uses the ALWAYS_FAST preset (haiku at every complexity level), so it's the cheapest possible LLM call. But it is still:

- A full Agent() invocation with context setup overhead
- Non-deterministic (the LLM may classify the same input differently on repeated runs)
- A token cost on every `/lu` invocation
- A latency addition to the critical path (classification must complete before any other work starts)

### The Routing Table Consumer

The `resolveModelForAgent()` function in `model-routing.ts` is already deterministic. It takes an agent name and a `ComplexityLevel` and returns a `ModelTier`. The complexity classification is the only non-deterministic input to this deterministic pipeline.

```typescript
resolveModelForAgent("lu-executor", "COMPLEX"); // "capable" -- deterministic
resolveModelForAgent("lu-cognition", "CRITICAL"); // "fast" -- deterministic
```

If the complexity level itself were determined by heuristics, the entire model routing pipeline would be fully deterministic.

### Per-Phase Re-Classification

Step 7c (proposed Step 5c) does per-phase complexity re-classification:

```
Agent(name: "classify-{NN}", subagent_type: "lu-cognition", model: ALWAYS_FAST, prompt: CLASSIFY_PROMPT({phase: NN, ...}))
```

This is a second LLM call per phase. With 5 phases in a milestone, that's 5 additional LLM calls that could be heuristic computations.

### The Classification Criteria Already Exist

The `CLASSIFY_PROMPT` contains explicit criteria:

| Level    | File Count |
| -------- | ---------- |
| TRIVIAL  | 1 file     |
| SIMPLE   | 2-3 files  |
| MODERATE | 3-5 files  |
| COMPLEX  | 5-10 files |
| CRITICAL | 10+ files  |

These are already heuristic rules. The LLM is being asked to apply simple rules that a TypeScript function could apply in microseconds.

## What Specifically Needs to Change

### Step 1: Initial Classification

Replace:

```
Agent(name: "classify", subagent_type: "lu-cognition", model: ALWAYS_FAST,
  prompt: CLASSIFY_PROMPT({...}))
```

With an inline TypeScript CLI call:

```bash
RESULT=$(bun src/complexity/__helpers/classify.ts \
  --description="$TASK_DESCRIPTION" \
  --roadmap=".planning/ROADMAP.md" \
  --phase="$PHASE_NUMBER" \
  2>/dev/null)
COMPLEXITY=$(echo "$RESULT" | bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(r.complexity)")
ROUTE=$(echo "$RESULT" | bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(r.route)")
```

The `classify` agent call is eliminated. The LLM is no longer involved in complexity classification.

**Note:** Routing (determining `ROUTE`) is a separate decision from complexity classification. Routing decides _what kind of work_ (phase-execute, quick, debug, etc.), while classification decides _how complex_ the work is. These could be separated, with routing remaining an LLM call if needed and classification becoming deterministic. However, the routing decision is also largely heuristic (pattern matching on keywords and context), so both could be deterministic.

### Step 5c/7c: Per-Phase Re-Classification

Replace the per-phase classify agent call with the same CLI tool, now with phase-specific inputs:

```bash
PHASE_COMPLEXITY=$(bun src/complexity/__helpers/classify.ts \
  --phase="$PHASE_NUMBER" \
  --plan=".planning/phases/${PHASE_DIR}/PLAN.md" \
  2>/dev/null | bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(r.complexity)")
```

This eliminates N LLM calls (one per phase).

## The Heuristic Function

### Input Signals

The deterministic classifier should consume these signals:

| Signal              | Source                                         | Weight | Rationale                                                                                  |
| ------------------- | ---------------------------------------------- | ------ | ------------------------------------------------------------------------------------------ |
| Task count          | PLAN.md task list                              | High   | More tasks = higher complexity                                                             |
| File scope          | PLAN.md referenced files, or git diff estimate | High   | Primary criterion in current prompt                                                        |
| Description length  | User request or phase description              | Low    | Longer descriptions often indicate more scope                                              |
| Complexity keywords | Keyword scan of description/plan               | Medium | Words like "refactor", "migrate", "architectural" suggest higher complexity                |
| Dependency count    | ROADMAP.md dependency graph                    | Medium | Phases with many dependencies are cross-cutting                                            |
| Phase type          | Inferred from description                      | Low    | "bootstrap", "cleanup" tend toward lower complexity; "migration", "redesign" toward higher |
| Routing history     | `.planning/routing-history.jsonl`              | Medium | Adaptive: similar tasks that needed heavier models get routed higher                       |

### Proposed Implementation

```typescript
// src/complexity/__helpers/classify.ts

import { z } from "zod";
import type { ComplexityLevel } from "../__schemas/complexity.schemas";

const ClassificationInputSchema = z.object({
  description: z.string().default(""),
  task_count: z.number().int().nonnegative().default(0),
  file_count: z.number().int().nonnegative().default(0),
  dependency_count: z.number().int().nonnegative().default(0),
  description_length: z.number().int().nonnegative().default(0),
  has_complexity_keywords: z.boolean().default(false),
});

const COMPLEXITY_KEYWORDS = [
  "refactor",
  "migrate",
  "architectural",
  "redesign",
  "overhaul",
  "cross-cutting",
  "breaking change",
  "backward compat",
  "system-wide",
  "security",
  "performance",
  "critical",
  "production",
];

/**
 * Classify task complexity using pure heuristics.
 *
 * Scoring model:
 *   score = file_weight + task_weight + keyword_weight + dependency_weight
 *
 * Thresholds:
 *   TRIVIAL:  score < 3
 *   SIMPLE:   score < 6
 *   MODERATE: score < 10
 *   COMPLEX:  score < 15
 *   CRITICAL: score >= 15
 */
function classifyComplexity(input: ClassificationInput): ComplexityLevel {
  let score = 0;

  // File count (primary signal, matches current prompt criteria)
  if (input.file_count <= 1) score += 1;
  else if (input.file_count <= 3) score += 3;
  else if (input.file_count <= 5) score += 6;
  else if (input.file_count <= 10) score += 10;
  else score += 15;

  // Task count
  if (input.task_count <= 1) score += 0;
  else if (input.task_count <= 3) score += 1;
  else if (input.task_count <= 6) score += 3;
  else score += 5;

  // Complexity keywords
  if (input.has_complexity_keywords) score += 2;

  // Dependencies
  if (input.dependency_count >= 3) score += 2;
  else if (input.dependency_count >= 1) score += 1;

  // Apply thresholds
  if (score < 3) return "TRIVIAL";
  if (score < 6) return "SIMPLE";
  if (score < 10) return "MODERATE";
  if (score < 15) return "COMPLEX";
  return "CRITICAL";
}
```

### Extracting Inputs From Context

The classifier needs to extract its inputs from available artifacts. This is the main design challenge -- in the LLM classifier, the LLM reads the artifacts and uses judgment. In the deterministic classifier, we need explicit extraction:

| Input                     | Extraction Method                                                                                        |
| ------------------------- | -------------------------------------------------------------------------------------------------------- |
| `file_count`              | Count unique file paths in PLAN.md task descriptions, or use `git diff --name-only` for the phase branch |
| `task_count`              | Count task items in PLAN.md (regex: lines matching `^- \[ \]` or `### Task`)                             |
| `description_length`      | `description.length` (trivial)                                                                           |
| `has_complexity_keywords` | `COMPLEXITY_KEYWORDS.some(kw => description.toLowerCase().includes(kw))`                                 |
| `dependency_count`        | Count dependencies for this phase in ROADMAP.md (parse `depends_on:` or dependency arrows)               |

For the initial classification (Step 1, before a plan exists):

| Input                     | Extraction Method                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------- |
| `file_count`              | Estimate from the user's task description (count file paths mentioned, or use keyword heuristics) |
| `task_count`              | Not available yet; default to 0                                                                   |
| `description_length`      | Length of user's task description                                                                 |
| `has_complexity_keywords` | Scan user's description for keywords                                                              |
| `dependency_count`        | Count incomplete phases in ROADMAP.md if it exists                                                |

The initial classification is inherently less precise because no plan exists yet. This is acceptable because:

1. The per-phase re-classification (Step 5c) has full plan data and will refine the initial estimate
2. The initial classification primarily affects the model tier for planning agents, not execution agents
3. A wrong initial classification (e.g., MODERATE when it should be COMPLEX) results in a slightly cheaper planning agent, not a failure

### Route Classification

Route classification (phase-execute vs quick vs debug vs ...) is a separate concern. It can also be heuristic:

```typescript
const ROUTE_PATTERNS: Array<[RegExp, string]> = [
  [/\b(pr|pull request|review)\b/i, "pr-address"],
  [/\b(bug|debug|fix|error|crash)\b/i, "debug"],
  [/\b(quick|small|typo|minor)\b/i, "quick"],
  [/\b(plan|session|roadmap)\b/i, "session-plan"],
  [/\b(progress|status|report)\b/i, "progress"],
  [/\b(new project|init|bootstrap)\b/i, "project-new"],
  [/\b(new milestone|next milestone)\b/i, "milestone-new"],
];

function classifyRoute(description: string): string {
  for (const [pattern, route] of ROUTE_PATTERNS) {
    if (pattern.test(description)) return route;
  }
  return "phase-execute"; // default route
}
```

**Caveat:** Route classification has more ambiguity than complexity classification. A description like "fix the authentication flow" could be a quick fix or a full phase execution. If route classification produces too many misroutes, it may need to remain an LLM call. An intermediate approach: use heuristics for clear cases (PR URL detected = pr-address, "status" = progress), fall back to LLM for ambiguous cases.

## Routing History for Adaptive Learning

### The Concept

GSD2 tracks routing history: if similar tasks in the past needed heavier models, future similar tasks get routed higher. This is the adaptive learning component that makes heuristic classification improve over time.

### Proposed Schema

```typescript
// .planning/routing-history.jsonl (append-only)
const RoutingHistoryEntrySchema = z.object({
  /** ISO 8601 timestamp */
  timestamp: z.string(),
  /** Phase number */
  phase: z.number().int().positive(),
  /** Initial heuristic classification */
  initial_complexity: z.string(),
  /** Final effective complexity (after any re-classification) */
  final_complexity: z.string(),
  /** Whether the phase completed successfully */
  succeeded: z.boolean(),
  /** Whether the phase was parked due to convergence failure */
  stalled: z.boolean(),
  /** Number of harness fix iterations used */
  harness_iterations: z.number().int().nonnegative(),
  /** Number of implementation loop iterations used */
  impl_iterations: z.number().int().nonnegative(),
  /** Task count from the plan */
  task_count: z.number().int().nonnegative(),
  /** File count from the plan */
  file_count: z.number().int().nonnegative(),
  /** Description keywords matched */
  keywords_matched: z.array(z.string()).default([]),
});
```

### Adaptive Adjustment

After each phase completes, an entry is written to `routing-history.jsonl`. The classifier reads recent history and adjusts:

```typescript
function adjustFromHistory(
  baseComplexity: ComplexityLevel,
  history: RoutingHistoryEntry[],
): ComplexityLevel {
  // Find phases with similar characteristics that stalled or needed max iterations
  const similarStalled = history.filter(
    (entry) =>
      entry.stalled &&
      Math.abs(entry.task_count - currentTaskCount) <= 2 &&
      Math.abs(entry.file_count - currentFileCount) <= 3,
  );

  // If 2+ similar phases stalled at the same or lower complexity, bump up
  if (similarStalled.length >= 2) {
    return promoteComplexity(baseComplexity);
  }

  // If similar phases consistently succeeded at lower complexity, consider demotion
  const similarSucceeded = history.filter(
    (entry) =>
      entry.succeeded && !entry.stalled && entry.harness_iterations <= 1,
  );

  if (similarSucceeded.length >= 3) {
    return demoteComplexity(baseComplexity);
  }

  return baseComplexity;
}
```

This creates a feedback loop:

1. Heuristic classifies complexity
2. Phase executes with that complexity level (controlling model tier + loop budgets)
3. Outcome (success/stall/iteration count) is recorded
4. Future similar phases adjust classification based on history

### Cold Start

With no routing history, the classifier uses pure heuristics (the scoring model described above). This matches GSD2's approach: defaults work, history improves them.

History accumulates naturally -- after one milestone (~5-10 phases), the adaptive adjustment has useful data.

## Claude Code Constraints

### No Sub-Process Model Resolution

In GSD2, the orchestrator is TypeScript code that directly calls `classifyComplexity()` and `resolveModelForAgent()` before constructing the agent prompt. In Luca, the orchestrator is an LLM prompt running in Claude Code. It cannot call TypeScript functions directly.

**Solution:** The classifier is a CLI tool invoked via `bun`:

```bash
bun src/complexity/__helpers/classify.ts \
  --description="$DESCRIPTION" \
  --plan="$PLAN_PATH" \
  --history=".planning/routing-history.jsonl"
```

Output is JSON:

```json
{
  "complexity": "MODERATE",
  "route": "phase-execute",
  "score": 7,
  "signals": {
    "file_count": 4,
    "task_count": 3,
    "has_keywords": false,
    "dependency_count": 1,
    "history_adjustment": "none"
  }
}
```

The orchestrator reads this JSON and uses the complexity level for model routing.

### Input Extraction Without an LLM

The main challenge: extracting file_count and task_count from PLAN.md requires text parsing. Two approaches:

**Approach A: Simple regex parsing.** Count lines matching known plan patterns. This works for Luca's structured plans but may miss edge cases.

```typescript
function countTasksFromPlan(planContent: string): number {
  const taskPatterns = [
    /^-\s*\[[ x]\]/gm, // Markdown task items
    /^###\s+Task/gm, // Task headers
    /^>\s*\*\*Task/gm, // Quoted task markers
  ];
  return taskPatterns.reduce((count, pattern) => {
    return count + (planContent.match(pattern)?.length ?? 0);
  }, 0);
}

function countFilesFromPlan(planContent: string): number {
  const filePatterns = [
    /`[a-zA-Z0-9._/-]+\.(ts|tsx|js|jsx|json|md|css|html)`/g,
    /src\/[a-zA-Z0-9._/-]+/g,
  ];
  const files = new Set<string>();
  for (const pattern of filePatterns) {
    const matches = planContent.match(pattern) ?? [];
    for (const match of matches) {
      files.add(match.replace(/`/g, ""));
    }
  }
  return files.size;
}
```

**Approach B: Structured plan frontmatter.** The planner agent writes a structured header to PLAN.md:

```markdown
---
task_count: 5
estimated_files: 7
complexity_keywords: [refactor, cross-cutting]
---
```

The classifier reads the frontmatter instead of parsing the plan body. This is cleaner but requires updating the planner prompt.

**Recommendation:** Start with Approach A (regex), migrate to Approach B when the planner prompt is updated.

### Pre-Plan Classification Imprecision

At Step 1, no plan exists yet. The classifier must work from the user's description alone. This is inherently imprecise, but acceptable because:

1. The initial complexity primarily controls cognition and planning agent model tiers
2. Per-phase re-classification (Step 5c/7c) refines the estimate with full plan data
3. The routing table's ALWAYS_FAST and ORCHESTRATOR presets mean most early agents are haiku or sonnet regardless of complexity

The worst-case misclassification scenario: TRIVIAL task classified as MODERATE (wastes a slightly more expensive model on planning), or COMPLEX task classified as SIMPLE (slightly cheaper planning, may produce a thinner plan that gets refined in execution). Neither is catastrophic.

## Impact on Step 1 of the Pipeline

### Before (Current)

```
Step 1: Cognitive Pre-Flight + Classify
  Agent("cognition") -> recall brain tree, semantic recall, intuition flags
  Agent("classify") -> COMPLEXITY + ROUTE
  Emit ROUTE_COMPLETE transition
```

Two LLM calls. The classify call adds latency and token cost.

### After (Proposed)

```
Step 1: Cognitive Pre-Flight + Classify
  Agent("cognition") -> recall brain tree, semantic recall, intuition flags  [LLM call]
  Classify complexity: bun src/complexity/__helpers/classify.ts ...          [deterministic, <100ms]
  Classify route: deterministic or LLM fallback                             [heuristic or LLM]
  Emit ROUTE_COMPLETE transition
```

One LLM call (cognition) plus one deterministic call (classify). The classify agent is eliminated. If route classification is also deterministic, the pipeline drops from two LLM calls to one.

### Token Savings

The classify agent uses ALWAYS_FAST (haiku). Estimated cost per classify call:

- Input tokens: ~500 (prompt + context)
- Output tokens: ~50 (COMPLEXITY + ROUTE)
- Per-invocation cost: minimal (haiku is cheap)

But with N phases, the per-phase re-classification adds up:

- 1 initial classify + N per-phase reclassify = N+1 LLM calls eliminated
- For a 5-phase milestone: 6 classify calls eliminated
- For a 10-phase milestone: 11 classify calls eliminated

The savings are less about cost (haiku is cheap) and more about latency and determinism.

### Latency Improvement

Each Agent() call in Claude Code involves:

1. Agent session setup
2. Context injection
3. LLM inference
4. Response parsing

Even with haiku, this is 2-5 seconds per call. A CLI heuristic completes in <100ms. For 6 classify calls in a milestone, that's 12-30 seconds saved.

## Risks and Tradeoffs

### Adopting

| Risk                                              | Mitigation                                                                                              |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Heuristic misclassifies edge cases                | Per-phase re-classification catches initial errors; routing history provides adaptive correction        |
| File/task count extraction fails on unusual plans | Regex fallback to MODERATE (the middle ground); structured frontmatter as future improvement            |
| Route classification heuristic misroutes          | Keep LLM fallback for ambiguous routes; pattern matching handles clear cases                            |
| Routing history accumulates stale data            | Scope history to recent N entries (e.g., last 50); or scope to current milestone                        |
| Loss of LLM's contextual judgment                 | The current prompt's criteria are already heuristic rules; the LLM is applying them, not inventing them |

### Not Adopting

| Risk                             | Impact                                                                                                                 |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Non-deterministic classification | Same task may get different complexity on different runs; model selection varies unpredictably                         |
| Token cost on every invocation   | N+1 haiku calls per milestone; small individually but compounds                                                        |
| Latency on critical path         | Classification blocks all downstream agent spawning; 2-5 seconds per call                                              |
| No adaptive learning             | Same mistakes repeat; no feedback loop from execution outcomes to classification                                       |
| Classify agent context pollution | The classify agent reads context that it doesn't need; fresh context per unit of work (Learning 1) argues against this |

## Interaction With Other Learnings

### Learning 4 (Stuck Detection)

Stuck detection outcomes become an input to the routing history. When a phase stalls due to convergence failure, the routing history records:

```json
{
  "initial_complexity": "MODERATE",
  "stalled": true,
  "harness_iterations": 2,
  "task_count": 4,
  "file_count": 6
}
```

The adaptive adjustment function sees this and promotes future phases with similar characteristics to COMPLEX, which gives them:

- More capable model tiers (opus instead of sonnet for execution)
- Higher iteration budgets (3 instead of 2 harness fix iterations)
- Full verification mode instead of quick mode

This creates a virtuous cycle: stuck detection feeds classification, better classification reduces stuck incidence.

### Learning 5 (Structured Verification Data)

Structured verification results provide additional signals for the routing history:

- `criteria_met / criteria_total` ratio at phase completion
- Number of blocking gaps remaining when phase completes
- Whether the verification tribunal was invoked (T1/T3 conflict detected)

High-quality verification data makes the adaptive learning more precise. Instead of just "succeeded/stalled", the classifier can learn from "succeeded but with 3/7 criteria initially failing, required 2 impl iterations."

### Learning 7 (Pipeline Ceremony Overhead)

Eliminating the classify agent call is directly aligned with Learning 7's goal of reducing ceremony. The classify agent is one of the "sessions that exist because the process says so" rather than producing unique value. Every agent call removed is tokens saved and latency reduced.

If both complexity and route classification become deterministic, Step 1 drops from 2 Agent() calls to 1 (cognition only). Combined with potentially merging cognition into Step 0 (inline context loading), the pipeline overhead drops significantly.

## Recommendation

**Adopt fully for complexity classification. Adopt partially for route classification.**

**Complexity classification (high confidence, adopt immediately):**

1. Create `src/complexity/__helpers/classify.ts` with the scoring heuristic
2. Add input extraction functions (task count, file count, keyword scan)
3. Add CLI entry point for orchestrator invocation
4. Update `lu.skill.ts` Step 2 and Step 7c to use CLI instead of Agent()
5. Eliminate the classify agent calls
6. Add routing history schema and write path (after each phase)
7. Wire adaptive adjustment into the classifier

**Route classification (medium confidence, adopt incrementally):**

1. Implement heuristic pattern matching for clear cases (PR URL, "status", "debug")
2. Keep LLM fallback for ambiguous descriptions
3. Track route accuracy; if heuristic accuracy exceeds 90%, eliminate LLM fallback
4. Monitor misroutes in session ledger

**Per-phase re-classification (high confidence, adopt immediately):**

This is the easiest win. By Step 5c, the plan exists and file/task counts are directly measurable. The heuristic is most accurate here. Eliminate all per-phase classify agent calls.
