# Phase 17 Research: Iterative Agent Loops (Ralph Wiggum)

**Conducted:** 2026-02-11
**Agent:** lu-phase-researcher
**Status:** Complete

---

## Executive Summary

Phase 17 implements externally-controlled iteration loops for Luca's execution pipeline. Research across 6 areas confirms that our locked decisions align well with established patterns in the agent engineering ecosystem, while also identifying specific implementation details, pitfalls, and refinements that should inform planning.

**Key takeaways:**

1. **External loop control is the right call.** The Ralph Wiggum pattern, Aider's edit-test-fix loop, and OpenHands' stateless agent architecture all demonstrate that external control (orchestrator decides) produces more reliable results than LLM self-assessment of completion. Reflexion's self-reflection improves performance but requires an external evaluator to trigger it -- the agent never decides to stop on its own.

2. **Multi-signal convergence detection is well-supported by prior art.** Error fingerprinting (Sentry), artifact delta tracking (git diff), and error count trending all have established implementations. The 2-of-3 composite rule is a pragmatic approach that avoids false positives from any single signal.

3. **Git tags for checkpoints are the lightest viable mechanism.** CI/CD systems (ArgoCD, GitHub Actions) all use git-based checkpoints. Tags are cheap, prunable, and pair naturally with JSON metadata files for decision support.

4. **Rule-based error classification is proven in CI/CD.** The TELUS intermittent failure catalogue (46 categories), Sentry's built-in fingerprinting rules, and hardware ECC error classification all validate rule-based approaches. ML-based classification adds accuracy but contradicts the external-control principle.

5. **Soft budget stops are the industry standard.** LangChain budget routers, Claude Code's 5-hour rolling window, and LangGraph's checkpoint-based billing all use soft limits that let the current unit of work complete before halting.

6. **HITL/AFK mode switching has mature patterns.** LangGraph's `interrupt()` + `Command(resume=...)` is the gold standard for checkpoint-based human approval. The key insight: HITL should be triggered by conditions (escalation triggers), not scheduled at every step.

---

## Area 1: Iterative Agent Loop Patterns

### 1.1 The Ralph Wiggum Pattern

**Source:** [Awesome Claude - Ralph Wiggum](https://awesomeclaude.ai/ralph-wiggum), [GitHub Plugin](https://github.com/anthropics/claude-code/blob/main/plugins/ralph-wiggum/README.md)

**How it works:**

The Ralph Wiggum plugin uses Claude Code's Stop hook to create a self-referential iteration loop:

```
Iteration N:
  1. Claude works on task
  2. Claude tries to exit
  3. Stop hook blocks exit (hooks/stop-hook.sh)
  4. Stop hook re-feeds SAME prompt
  5. Claude reads updated files + git history
  6. Repeat until completion promise or max iterations
```

**Key design properties:**

- The prompt **never changes** between iterations -- Claude discovers what to do by reading the filesystem
- The Stop hook outputs JSON: `{ "continue": true, "systemMessage": "..." }`
- Completion detection uses exact string matching on a "completion promise" (fragile)
- `--max-iterations` is the primary safety mechanism, not the completion promise
- The loop runs inside a single Claude Code session -- context accumulates

**What Luca should take:**

- External control via hooks is proven and reliable
- BUT: Luca's approach is better because we control the prompt between iterations (we can inject harness errors, verifier gaps, etc.), whereas Ralph re-feeds the same prompt every time
- We should NOT rely on completion promise / LLM self-assessment -- harness pass/fail is our external signal

**What Luca should avoid:**

- Ralph's single-session context accumulation leads to context rot at high iteration counts
- Ralph has no convergence detection -- it runs until max iterations or completion promise
- No rollback mechanism -- if iteration N makes things worse, there's no going back

### 1.2 Reflexion Pattern (Shinn et al. 2023)

**Source:** [NeurIPS 2023 Paper](https://arxiv.org/abs/2303.11366), [LangGraph Implementation](https://langchain-ai.github.io/langgraph/tutorials/reflexion/reflexion/)

**Architecture: Three components:**

| Component             | Role                               | Our Equivalent                        |
| --------------------- | ---------------------------------- | ------------------------------------- |
| Actor (Ma)            | Generates actions/code             | lu-executor                           |
| Evaluator (Me)        | Judges trajectory success          | Harness + lu-verifier                 |
| Self-Reflection (Msr) | Diagnoses failures, suggests fixes | Error context in re-invocation prompt |

**Key insight:** Ablation studies show that **removing self-reflection** (just retrying with test results) causes performance to plateau. The reflection step that diagnoses _why_ something failed and _suggests strategies_ is critical for improvement on harder tasks.

**Implication for Luca:** Our current Step 6.6 just feeds raw harness errors to lu-executor. We should consider adding a brief diagnostic step (error classification + targeted instructions) between harness failure and re-execution. This is essentially what our error classification (ITER-05) provides -- classifying errors as transient/correctable/permanent IS a form of structured reflection.

**Results:** 91% pass@1 on HumanEval (vs 80% for GPT-4 without Reflexion).

### 1.3 Multi-Agent Reasoning (MAR)

**Source:** [MAR Paper](https://arxiv.org/pdf/2512.20845)

MAR runs multiple agents solving the same problem in parallel, then selects the best solution. This is relevant to Luca's wave-based execution model but not directly to the iteration loop -- our waves already parallelize across plans, not across solution attempts for the same plan.

**When MAR applies:** If a single plan's fix is particularly hard (promoted to permanent after 3 iterations), a future enhancement could spawn parallel fix attempts with different strategies. This is noted in 17-CONTEXT.md deferred ideas.

### 1.4 CodeTree Pattern

**Source:** [NAACL 2025 Paper](https://aclanthology.org/2025.naacl-long.189/), [GitHub](https://github.com/SalesforceAIResearch/CodeTree)

CodeTree uses a tree search over code generation strategies with specialized agents:

- **Thinker** generates strategies (branches)
- **Solver** implements each strategy
- **Debugger** refines solutions
- **Critic** evaluates and scores

**Relevance to Luca:** CodeTree's Critic agent validates that BFS (breadth-first, trying multiple strategies) outperforms DFS (depth-first, iterating on one strategy) for code generation. However, BFS is expensive. Luca's approach (DFS with convergence detection and rollback) is the right trade-off for a framework where cost control matters.

**Specific takeaway:** CodeTree's Critic agent uses both execution feedback AND LLM-generated feedback. Our harness provides execution feedback; our error classification provides structured (rule-based, not LLM-generated) diagnostic feedback. This is a good balance.

### 1.5 Aider's Edit-Test-Fix Loop

**Source:** [Aider Docs - Lint & Test](https://aider.chat/docs/usage/lint-test.html)

Aider implements the simplest viable iteration loop:

1. AI edits code
2. Auto-lint runs on edited files
3. Auto-test runs on affected tests
4. If failures, Aider feeds errors back and retries
5. Repeat until passing or giving up

**Configuration:** `--lint-cmd`, `--test-cmd`, `--auto-test`, `--no-auto-lint`

**Gap:** Aider's docs do not specify retry limits or termination conditions. This is a known limitation -- users report Aider sometimes getting stuck in loops.

**What Luca improves on:** We add convergence detection, hard iteration limits, checkpoint/rollback, and error classification. Aider has none of these.

### 1.6 OpenHands / SWE-Agent

**Source:** [OpenHands SDK Paper](https://arxiv.org/abs/2511.03690), [OpenHands.dev](https://openhands.dev/)

**Architecture:** Stateless, event-sourced, composable. Agent proposes action, action executed, result fed back. Hard limit of 100 iterations per instance.

**Key insight from OpenHands:** "strict separation between core agent logic and applications is essential for maintainability, and event-sourced state enables reproducibility and fault recovery."

**Relevance:** Luca's result envelope pattern (ResultEnvelope) already follows this principle -- agents are stateless, return structured results, orchestrator decides what happens next. Phase 17 strengthens this by adding the loop controller between the orchestrator and the agent invocation.

### 1.7 Comparison Matrix: External vs Self-Assessment Control

| Dimension             | External Control (Ralph, Luca)                | Self-Assessment (naive loop)                      | Hybrid (Reflexion)                            |
| --------------------- | --------------------------------------------- | ------------------------------------------------- | --------------------------------------------- |
| Reliability           | High -- deterministic signals                 | Low -- LLM hallucination risk                     | Medium -- external evaluator + LLM reflection |
| Cost                  | Lower -- fewer wasted iterations              | Higher -- may loop on solved problems             | Medium -- reflection adds one LLM call        |
| Convergence detection | Easy -- compare signals across iterations     | Hard -- LLM can't objectively assess own progress | Medium -- evaluator provides ground truth     |
| Failure mode          | Stops at max iterations (safe)                | May never stop or stop too early                  | Stops when evaluator says success (good)      |
| Context management    | Orchestrator controls what context agent sees | Agent accumulates all context (rot)               | Reflection memory grows but is curated        |

**Recommendation:** Luca's orchestrator-only control (Decision 1 in 17-CONTEXT.md) is the right approach. The error classification system (ITER-05) provides the structured diagnostic value that Reflexion's self-reflection provides, without the cost of an additional LLM call.

---

## Area 2: Convergence Detection Algorithms

### 2.1 Multi-Signal Convergence (Our Approach)

Our locked decision uses three signals with a 2-of-3 rule:

| Signal                    | What It Measures                        | How to Compute                                                      |
| ------------------------- | --------------------------------------- | ------------------------------------------------------------------- |
| Error count delta         | Net progress (are errors decreasing?)   | `currentErrors - previousErrors`                                    |
| Error fingerprint overlap | Fix-then-regress detection              | Hash `${file}:${line}:${code}:${message}`, compute set intersection |
| Artifact change delta     | Did the agent actually change anything? | `git diff --stat` between iterations                                |

**Two consecutive stale iterations = convergence failure.**

### 2.2 Error Fingerprinting Approaches

**Sentry's approach:** [Sentry Issue Grouping](https://docs.sentry.io/concepts/data-management/event-grouping/)

Sentry uses two fingerprinting strategies:

1. **Rule-based fingerprinting:** Deterministic hash of error type + stack frames + message. Configurable via stack trace rules. Fast, predictable.
2. **AI-powered semantic fingerprinting:** Transformer-based embedding of error context, cosine similarity matching. 40% reduction in duplicate issues.

**Recommendation for Luca:** Use rule-based fingerprinting for the loop controller. Our harness already produces structured `ParsedError` objects with `file`, `line`, `message`, and `code` fields. A fingerprint is straightforward:

```typescript
function fingerprint(error: ParsedError): string {
  // Normalize message to handle minor variations
  const normalizedMessage = error.message.replace(/\d+/g, "N").trim();
  const key = `${error.file}:${error.line ?? 0}:${error.code ?? ""}:${normalizedMessage}`;
  return createHash("sha256").update(key).digest("hex").slice(0, 16);
}
```

**Key detail:** Normalize numbers in messages (line numbers, counts) to catch "same error, different line" cases. The `error.code` field (e.g., `TS2345`, ESLint rule name) is the strongest grouping signal -- same code + same file = same root cause even if message differs.

### 2.3 Oscillation Detection

**Problem:** Fix A causes error B, fix B causes error A. The error count stays the same but the fingerprint set flips.

**Detection approach:** Track fingerprint sets across 3+ iterations. If `fingerprints[N] == fingerprints[N-2]` (identical to two iterations ago), the loop is oscillating.

**Our 2-of-3 rule handles this:** If error count is flat AND fingerprints are cycling, that triggers 2 of 3 signals as stale. But we should explicitly check for oscillation as a sub-case of fingerprint overlap to provide better diagnostic messages.

### 2.4 Stalling Thresholds in Practice

From Mini-SWE Agent research: "Without loop detection, context filtering, or basic verification, repeated failed reasoning steps accumulate until budget or timeout is reached."

From Blueprint2Code: Maximum of 5 debugging rounds before returning to the planning agent to regenerate the approach.

From OpenHands benchmarks: Hard limit of 100 iterations per instance.

**Our limits are reasonable:**

| Complexity | Harness Fix Iterations | Verify Fix Iterations (proposed) |
| ---------- | ---------------------- | -------------------------------- |
| TRIVIAL    | 1                      | 0                                |
| SIMPLE     | 2                      | 1                                |
| MODERATE   | 3                      | 1                                |
| COMPLEX    | 3                      | 2                                |
| CRITICAL   | 5                      | 3                                |

**Recommendation:** Keep these limits. The "2 consecutive stale" rule will terminate most stuck loops before hitting the hard limit, so the hard limit is a safety net, not the primary termination mechanism.

---

## Area 3: Checkpoint/Rollback in Development Tools

### 3.1 Git Tags as Checkpoints

**Our approach:** Lightweight git tags with naming convention `iter/<phase>/<loop>/<iteration>`.

**Industry validation:**

From CI/CD research: "Tags are cheap, don't create extra commits, and `git checkout <tag>` restores full state. Easy to prune." Git tags are universally recommended as the lightweight checkpoint mechanism for reproducible state capture.

**Implementation detail -- annotated vs lightweight:**

| Type        | Overhead                          | Metadata              | Pruning      |
| ----------- | --------------------------------- | --------------------- | ------------ |
| Lightweight | Zero (just a pointer to a commit) | None (name only)      | `git tag -d` |
| Annotated   | Small (creates a tag object)      | Message, tagger, date | `git tag -d` |

**Recommendation:** Use **lightweight tags** (not annotated). Our metadata goes in JSON files, not tag annotations. This keeps tags cheap and fast.

**Tag creation command:**

```bash
git tag "iter/${phase}/${loop}/${iteration}"
```

**Rollback command:**

```bash
git checkout "iter/${phase}/${loop}/${previousIteration}"
```

**Caution:** `git checkout <tag>` puts the repo in detached HEAD state. After rollback, we need to create a new branch or reset the current branch:

```bash
git reset --hard "iter/${phase}/${loop}/${previousIteration}"
```

This is cleaner for iteration loops -- it moves the branch pointer back to the checkpoint.

### 3.2 Checkpoint Metadata Schema

**From CI/CD recovery point research:** Recovery points should capture "artifact versions, environment snapshots, container image hashes, infrastructure definitions, and test outcomes."

**Recommended JSON schema for `.planning/checkpoints/<tag-name>.json`:**

```typescript
interface IterationCheckpoint {
  // Identity
  tag: string; // e.g., "iter/17/harness/1"
  phase: number; // 17
  loop: "harness" | "verify";
  iteration: number; // 1-based

  // Results
  harnessResult?: HarnessResult; // Full harness output (if Loop A)
  verifierResult?: string; // Verifier status (if Loop B)
  errorCount: number; // Total errors this iteration
  errorDelta: number; // Change from previous (-N = improved)
  errorFingerprints: string[]; // Hashed error identifiers

  // Convergence
  convergenceStatus: "improved" | "stalled" | "regressed";
  staleCount: number; // Consecutive stale iterations

  // Classification
  permanentErrors: string[]; // Fingerprints promoted to permanent
  correctableErrors: string[]; // Fingerprints still correctable
  transientErrors: string[]; // Fingerprints classified as transient

  // Artifacts
  artifactsDelta: number; // Number of files changed (git diff --stat)
  commitHash: string; // Git commit at this checkpoint

  // Meta
  agentInvoked: string; // "lu-executor" or similar
  durationMs: number;
  tokenEstimate?: number; // If available
  timestamp: string; // ISO 8601
}
```

### 3.3 Rollback Decision Logic

**From ArgoCD and GitOps:** "If the deployed state doesn't match the desired state, rollback is automatic."

**For Luca's AFK mode:**

```
if (currentIteration.errorCount > previousIteration.errorCount) {
  // Regression -- roll back automatically
  rollback(previousIteration.tag)
} else if (currentIteration.convergenceStatus === 'stalled' && staleCount >= 2) {
  // Stalled -- halt loop (don't rollback, current state is no worse)
  haltLoop('convergence_failure')
}
```

**For Luca's HITL mode:** Present comparison table and offer Continue/Rollback/Abort/Skip choices (as specified in 17-CONTEXT.md Decision 3).

### 3.4 Checkpoint Pruning

**After phase passes verification:**

```bash
git tag -l "iter/${phase}/*" | xargs git tag -d
rm -f .planning/checkpoints/iter-${phase}-*.json
```

**Edge case:** If a phase fails verification but the user wants to try again later, checkpoints should be preserved. Only prune on successful phase completion.

---

## Area 4: Error Classification Systems

### 4.1 Our Rule-Based Classification (Validated)

The 17-CONTEXT.md Decision 4 defines:

| Source                 | Class       | Behavior                     |
| ---------------------- | ----------- | ---------------------------- |
| Test failures          | Correctable | Retry with error context     |
| Type errors            | Correctable | Retry with error context     |
| Lint errors            | Correctable | Retry with error context     |
| Build failures         | Transient   | Retry (may be intermittent)  |
| Network/timeout        | Transient   | Retry with backoff           |
| Verifier semantic gaps | Correctable | Retry with gap-targeted plan |
| Missing dependency     | Permanent   | Skip, continue on remaining  |
| Circular import        | Permanent   | Skip, continue on remaining  |

### 4.2 Industry Validation

**TELUS CI Failure Catalogue (2025):** [arXiv Paper](https://arxiv.org/html/2601.22264)

Analyzed 46 categories of intermittent CI job failures. The most relevant to Luca:

| TELUS Category                  | Our Equivalent              | Classification                      |
| ------------------------------- | --------------------------- | ----------------------------------- |
| Flaky UI test                   | Test failure (intermittent) | Correctable (or Transient if flaky) |
| Git transient error             | Network/timeout             | Transient                           |
| Host resolution failure         | Network/timeout             | Transient                           |
| Dependency installation failure | Missing dependency          | Permanent (if repeated)             |
| Runner pod waiting timeout      | Build infrastructure        | Transient                           |
| Misconfigured env variable      | Config error                | Permanent                           |

**Sentry's approach:** Uses a combination of rule-based fingerprinting + AI priority classification. Priority levels: High, Medium, Low. Beta users saw 40% reduction in issue noise.

**ECC Error Classification (Hardware):** Correctable Errors (CEs) vs Uncorrectable Errors (UEs). The "predictable UE" concept -- CEs that escalate into UEs over time -- directly parallels our "correctable promoted to permanent after 3 iterations" rule.

### 4.3 Implementation: Classifier Function

```typescript
type ErrorClass = "transient" | "correctable" | "permanent";

interface ClassifiedError {
  fingerprint: string;
  source: string; // 'test' | 'typecheck' | 'lint' | 'build' | 'verify' | 'network'
  classification: ErrorClass;
  iterationsSeen: number; // How many iterations this fingerprint has appeared
  message: string;
}

function classifyError(
  error: ParsedError,
  checkName: string,
  iterationHistory: Map<string, number>, // fingerprint -> count
): ClassifiedError {
  const fp = fingerprint(error);
  const seenCount = (iterationHistory.get(fp) ?? 0) + 1;

  // Rule-based classification by source
  let classification: ErrorClass;
  switch (checkName) {
    case "test":
    case "typecheck":
    case "lint":
      classification = "correctable";
      break;
    case "build":
      classification = "transient";
      break;
    default:
      classification = "correctable";
  }

  // Pattern-based overrides
  if (
    error.message.includes("Cannot find module") ||
    error.message.includes("circular dependency")
  ) {
    classification = "permanent";
  }
  if (
    error.message.includes("ECONNREFUSED") ||
    error.message.includes("ETIMEDOUT")
  ) {
    classification = "transient";
  }

  // Promotion: correctable -> permanent after 3 iterations
  if (classification === "correctable" && seenCount >= 3) {
    classification = "permanent";
  }

  return {
    fingerprint: fp,
    source: checkName,
    classification,
    iterationsSeen: seenCount,
    message: error.message,
  };
}
```

### 4.4 Permanent Error Handling

**Critical design decision:** Permanent errors are excluded from convergence calculations but tracked in iteration history.

```typescript
function computeConvergence(
  current: ClassifiedError[],
  previous: ClassifiedError[],
): ConvergenceSignals {
  // Filter out permanent errors for convergence calculation
  const currentActive = current.filter((e) => e.classification !== "permanent");
  const previousActive = previous.filter(
    (e) => e.classification !== "permanent",
  );

  return {
    errorCountDelta: currentActive.length - previousActive.length,
    fingerprintOverlap: computeOverlap(
      currentActive.map((e) => e.fingerprint),
      previousActive.map((e) => e.fingerprint),
    ),
    artifactDelta: getGitDiffStatCount(), // from git
  };
}
```

### 4.5 Pitfalls to Avoid

1. **Do not use LLM to classify errors.** It contradicts the external-control principle and adds cost per iteration. Rule-based classification is sufficient for the error types our harness produces.

2. **Do not promote too aggressively.** 3 iterations is a good threshold -- it allows for transient flakiness without getting stuck. The TELUS research shows that truly transient errors resolve within 1-2 retries.

3. **Track promoted errors separately.** When a correctable error is promoted to permanent, log the promotion event for learning capture. This helps identify patterns where the harness/verifier can't resolve certain error types.

---

## Area 5: Cost Budget Enforcement for LLM Loops

### 5.1 Claude Code's Token Budget Model

**Source:** [Claude Code Cost Docs](https://code.claude.com/docs/en/costs), [Token Limits Guide](https://www.faros.ai/blog/claude-code-token-limits)

**Key facts:**

- 5-hour rolling window (not daily/monthly)
- Pro: ~44,000 tokens/window; Max5: ~88,000; Max20: ~220,000
- Model multipliers: Opus 4.5 costs ~1.7x vs Sonnet 4.5
- Agent teams use ~7x more tokens than standard sessions
- Each MCP server adds 500-2,000 tokens of overhead
- Weekly limits introduced August 2025

**Implication for Luca:** We cannot query an API for remaining budget (no stable API exists). Budget tracking must be **estimated** based on iteration patterns, not measured exactly.

### 5.2 Budget Estimation Strategy

**What we can track:**

- Number of iterations executed
- Duration per iteration (proxy for token usage)
- Number of agent invocations per iteration
- Model used per invocation

**What we cannot track:**

- Exact token counts consumed (no API)
- Remaining budget in 5-hour window
- Current usage relative to cap

**Recommended approach:**

```typescript
interface CostBudget {
  maxIterations: number; // Hard cap from complexity gate
  estimatedTokensPerIteration: number; // Calibrated from history
  softStopPercent: number; // Default: 80
  totalBudget: number; // Configurable per-task budget
  spent: number; // Running total estimate
}

function shouldContinue(budget: CostBudget, currentIteration: number): boolean {
  const estimatedSpent = currentIteration * budget.estimatedTokensPerIteration;
  const percentUsed = (estimatedSpent / budget.totalBudget) * 100;

  if (percentUsed >= budget.softStopPercent) {
    return false; // Soft stop -- finish current iteration, don't start new one
  }
  if (currentIteration >= budget.maxIterations) {
    return false; // Hard stop from complexity gate
  }
  return true;
}
```

### 5.3 LangChain/LangGraph Budget Patterns

**Source:** [LangChain Cost Controls](https://medium.com/@Praxen/7-langchain-cost-controls-budget-routers-capped-tools-ffed8faedba8)

LangChain implements 7 cost control patterns:

1. **Budget Routers** -- Route to cheaper models when budget is low
2. **Capped Tools** -- Limit calls per tool per session
3. **Token Counters** -- Track cumulative usage via callbacks
4. **Model Cascading** -- Start with cheap model, escalate if quality insufficient
5. **Output Limiters** -- Cap response length
6. **Session Budgets** -- Per-session token limits
7. **Rate Limiters** -- Slow down to stay within rate limits

**Most relevant for Luca:** Session budgets (#6) and token counters (#3). Since we can't get exact token counts from Claude Code, we use iteration count as a proxy.

### 5.4 Soft Stop vs Hard Stop

**Industry consensus:** Soft stops are preferred. Complete the current unit of work, then halt.

| Stop Type        | When to Use                                 | Risk                                       |
| ---------------- | ------------------------------------------- | ------------------------------------------ |
| Soft stop (80%)  | Budget threshold reached between iterations | Low -- current iteration completes cleanly |
| Hard stop (100%) | Budget exceeded or max iterations hit       | Medium -- may leave partial work           |
| Emergency stop   | Regression detected, permanent errors only  | Low -- rollback to clean state             |

**Our approach (from 17-CONTEXT.md):** Soft stop at 80%. This is correct. The 20% headroom is sufficient for one full iteration to complete.

### 5.5 Budget Reservation Pattern

**Advanced pattern for future consideration:** Before starting an iteration, estimate whether there's enough budget to complete it AND the subsequent convergence check. If not, skip the iteration and halt cleanly.

```
budget_remaining = total - spent
iteration_cost_estimate = avg(previous_iteration_durations) * token_rate
convergence_check_cost = minimal  // Just fingerprint comparison, no LLM

if (budget_remaining < iteration_cost_estimate * 1.5) {
  halt('insufficient_budget_for_full_iteration')
}
```

The 1.5x multiplier accounts for iteration cost variance. This is more sophisticated than our current 80% threshold but can be added later.

---

## Area 6: HITL/AFK Mode Patterns

### 6.1 LangGraph's Interrupt Pattern (Gold Standard)

**Source:** [LangGraph Interrupts](https://docs.langchain.com/oss/python/langgraph/interrupts), [HITL Best Practices](https://www.permit.io/blog/human-in-the-loop-for-ai-agents-best-practices-frameworks-use-cases-and-demo)

**Core mechanism:**

1. Graph node calls `interrupt(payload)` with JSON-serializable context
2. Execution pauses, state persisted to checkpointer (Postgres, DynamoDB, etc.)
3. Human reviews payload, makes decision
4. Resume via `Command(resume=decision)`
5. `interrupt()` returns the human's decision, node continues

**Key architectural property:** "No Python process needs to stay alive. A human operator reviews the current state via a dashboard or UI."

**Relevance to Luca:** Our HITL mode should follow this pattern -- present iteration state, wait for human input, resume based on their choice. The four options (Continue/Rollback/Abort/Skip) map cleanly to this model.

### 6.2 Implementing HITL in Claude Code Context

Claude Code does not have LangGraph's persistent state infrastructure. Instead, HITL in Luca means:

1. **Pause = Print prompt and wait for user input in terminal**
2. **State = Checkpoint JSON files + git tags (already persisted)**
3. **Resume = User provides input, loop controller reads it and continues**

This is simpler than LangGraph's distributed checkpoint model but sufficient for our use case (single developer + AI workflow).

**HITL presentation format:**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ITER ► ITERATION {N} COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| Metric          | Previous | Current | Delta |
|-----------------|----------|---------|-------|
| Total errors    | {N}      | {N}     | {+/-} |
| Files changed   | {N}      | {N}     | {+/-} |
| New errors      | --       | {N}     |       |
| Fixed errors    | --       | {N}     |       |
| Permanent       | {N}      | {N}     |       |

Status: {improved / stalled / regressed}

Options:
  1. Continue — Proceed to iteration {N+1}
  2. Rollback — Revert to iteration {N-1} checkpoint
  3. Abort — Stop loop, keep current state
  4. Skip — Skip remaining iterations, proceed to next step
```

### 6.3 Escalation Triggers (AFK -> HITL)

**From industry research:** Escalation should be triggered by conditions, not scheduled.

**Recommended escalation triggers for Luca:**

| Trigger                    | Condition                                              | Action                             |
| -------------------------- | ------------------------------------------------------ | ---------------------------------- |
| Regression                 | `errorCount[N] > errorCount[N-1] * 1.5`                | Pause, present comparison          |
| Permanent promotion        | 3+ errors promoted to permanent in single iteration    | Pause, show promoted errors        |
| Budget warning             | Token estimate > 80% of budget                         | Pause, show budget status          |
| Unexpected harness failure | Harness check itself fails (not the code)              | Pause, likely infrastructure issue |
| Critical error detected    | Error matches "critical" pattern (security, data loss) | Pause regardless of mode           |

**Implementation note:** These triggers apply even in AFK mode. They override the default behavior and force a pause. This is the "management by exception" pattern from the HITL research.

### 6.4 Mode Configuration

**From 17-CONTEXT.md Decision 3:**

```json
{
  "iteration": {
    "defaultMode": "afk",
    "escalationTriggers": {
      "regressionThreshold": 1.5,
      "permanentPromotionThreshold": 3,
      "budgetWarningPercent": 80,
      "criticalPatterns": ["security", "data loss", "authentication"]
    }
  }
}
```

**Per-invocation override:** `--mode=afk|hitl`

### 6.5 The "Skip" Action

**Our innovation vs LangGraph:** LangGraph's HITL typically offers approve/reject/edit. Our "Skip" option (skip remaining iterations, proceed to next pipeline step) is specific to Luca's multi-loop architecture:

- User sees harness fix loop making slow progress
- Instead of waiting for all N iterations, they skip to the verify loop
- This is valuable because some harness errors might be acceptable for verification
- The verify loop might catch the real problem at a higher level

**Implementation:**

```typescript
type HITLDecision = "continue" | "rollback" | "abort" | "skip";

interface LoopControllerResult {
  decision: HITLDecision;
  iterationsCompleted: number;
  finalState: IterationCheckpoint;
  skippedToNext: boolean; // true if Skip was chosen
}
```

---

## Architecture Patterns Discovered

### Pattern 1: The Iteration Sandwich

Every robust agent iteration system follows the same structure:

```
[Pre-Check] -> [Execute] -> [Evaluate] -> [Classify] -> [Decide] -> [Checkpoint]
     |                                                       |
     |<-------------- Loop (if decide = retry) -------------|
```

- **Pre-Check:** Budget, convergence history, mode check
- **Execute:** Spawn agent with targeted context
- **Evaluate:** Run harness or verifier
- **Classify:** Rule-based error classification
- **Decide:** Continue/rollback/halt based on convergence signals
- **Checkpoint:** Save state for rollback

### Pattern 2: The Stateless Agent, Stateful Orchestrator

```
Orchestrator (loop-controller.ts)
  |-- State: checkpoints[], iterationHistory, convergenceSignals, budget
  |
  |-- Invokes: lu-executor (stateless)
  |     Returns: ResultEnvelope
  |
  |-- Invokes: harness/runner.ts (stateless)
  |     Returns: HarnessResult
  |
  |-- Decision: continue? rollback? halt?
```

This is the pattern used by OpenHands, Aider, and the Ralph Wiggum plugin. It is already how Luca works -- Phase 17 formalizes and extends it.

### Pattern 3: Error Fingerprint Ledger

```
Iteration 1: [fp-A, fp-B, fp-C]           -> 3 errors
Iteration 2: [fp-A, fp-D]                  -> 2 errors (improved: -1, fixed B+C, new D)
Iteration 3: [fp-A, fp-D]                  -> 2 errors (stalled: same fingerprints)
Iteration 4: [fp-A, fp-D]                  -> 2 errors (stalled: 2 consecutive -> HALT)
                                               fp-A promoted to permanent (seen 4 times)
```

---

## Pitfalls and Anti-Patterns to Avoid

### P1: Infinite Context Accumulation

**Problem:** Each iteration adds to the conversation context. After 5+ iterations, context rot degrades agent performance.

**Mitigation:** Each iteration spawns a FRESH agent with only: (a) the original plan/task, (b) the current iteration's harness errors, (c) the previous iteration's classified errors and actions. Do NOT pass the full history of all iterations.

### P2: Fix-Then-Regress Oscillation

**Problem:** Agent fixes error A, introduces error B. Next iteration fixes B, reintroduces A.

**Mitigation:** The fingerprint overlap signal in convergence detection catches this. Additionally, when the same fingerprint appears in non-consecutive iterations (A in iterations 1 and 3), flag it as a potential oscillation and include it in the agent's context as "previously attempted and reverted."

### P3: Premature Permanent Promotion

**Problem:** An error is promoted to permanent too quickly, blocking a fix that would have worked in 1-2 more iterations.

**Mitigation:** 3 iterations is the right threshold based on TELUS research. Transient errors resolve in 1-2; truly stuck errors persist through 3+. Additionally, in HITL mode, permanent promotions are presented to the user who can override.

### P4: Checkpoint Proliferation

**Problem:** Many iterations create many git tags and JSON files, cluttering the repository.

**Mitigation:** Prune all checkpoints after successful phase completion (17-CONTEXT.md Decision 2). During iteration, only keep the last 2-3 checkpoints if space is a concern (but git tags are essentially free).

### P5: Budget Overrun on Final Iteration

**Problem:** Soft stop at 80% leaves 20% for the current iteration, but the current iteration might use 30%.

**Mitigation:** Track average iteration cost and compare against remaining budget before starting each iteration (the reservation pattern from 5.5). For now, 80% with simple estimation is sufficient.

### P6: HITL Notification Fatigue

**Problem:** Too many escalation triggers cause the user to ignore all of them.

**Mitigation:** Escalation triggers should be rare and meaningful. In AFK mode, only truly exceptional conditions (regression > 1.5x, 3+ permanent promotions, budget breach) should trigger a pause. Normal stalling handled automatically.

---

## Recommended Approaches per ITER Requirement

### ITER-01: Loop Controller

**Approach:** TypeScript module at `src/iteration/loop-controller.ts` that exports a `runIterationLoop()` function. Takes configuration (loop type, max iterations, budget, mode) and a callback for the actual agent invocation. Returns `LoopControllerResult` with final state and decision.

**Key files to create:**

- `src/iteration/loop-controller.ts` -- Main loop logic
- `src/iteration/types.ts` -- Zod schemas for all iteration types
- `src/iteration/convergence.ts` -- Convergence detection functions
- `src/iteration/checkpoint.ts` -- Git tag + JSON checkpoint management
- `src/iteration/classifier.ts` -- Error classification logic
- `src/iteration/budget.ts` -- Cost budget tracking
- `src/iteration/index.ts` -- Public API barrel export

### ITER-02: Convergence Detection

**Approach:** Three-signal composite with 2-of-3 rule. Fingerprint-based error identity tracking across iterations. Oscillation detection as a sub-case.

### ITER-03: Hard Iteration Limits

**Approach:** Add `verifyFixIterations` to `ComplexityGate` type alongside existing `harnessFixIterations`. Loop controller reads limits from complexity config.

### ITER-04: Checkpoint/Rollback

**Approach:** Lightweight git tags + JSON metadata in `.planning/checkpoints/`. `git reset --hard <tag>` for rollback. Prune all phase checkpoints on successful completion.

### ITER-05: Error Classification

**Approach:** Rule-based classifier using harness check name + error patterns. 3-iteration promotion to permanent. Permanent errors excluded from convergence calculations.

### ITER-06: Cost Budget Enforcement

**Approach:** Iteration-count-based estimation with 80% soft stop threshold. No external API dependency. Track duration and agent invocations as cost proxies.

### ITER-07: HITL/AFK Modes

**Approach:** Default AFK with escalation triggers. HITL presents iteration comparison + 4 options (Continue/Rollback/Abort/Skip). Config file + per-invocation flag override.

---

## References

### Iterative Agent Loops

- [Ralph Wiggum - Awesome Claude](https://awesomeclaude.ai/ralph-wiggum)
- [Ralph Wiggum Plugin - GitHub](https://github.com/anthropics/claude-code/blob/main/plugins/ralph-wiggum/README.md)
- [Reflexion - NeurIPS 2023](https://arxiv.org/abs/2303.11366)
- [Reflexion - LangGraph Tutorial](https://langchain-ai.github.io/langgraph/tutorials/reflexion/reflexion/)
- [CodeTree - NAACL 2025](https://aclanthology.org/2025.naacl-long.189/)
- [CodeTree - GitHub](https://github.com/SalesforceAIResearch/CodeTree)
- [OpenHands SDK Paper](https://arxiv.org/abs/2511.03690)
- [OpenHands - Parallel Agent Refactoring](https://openhands.dev/blog/automating-massive-refactors-with-parallel-agents)
- [Aider - Lint & Test Docs](https://aider.chat/docs/usage/lint-test.html)
- [From ReAct to Ralph Loop - Alibaba Cloud](https://www.alibabacloud.com/blog/from-react-to-ralph-loop-a-continuous-iteration-paradigm-for-ai-agents_602799)

### Convergence Detection

- [Preventing Agent Infinite Loops - Codieshub](https://codieshub.com/for-ai/prevent-agent-loops-costs)
- [Why Multi-Agent LLM Systems Fail - Galileo](https://galileo.ai/blog/multi-agent-llm-systems-fail)
- [Designing Agentic Loops - Simon Willison](https://simonwillison.net/2025/Sep/30/designing-agentic-loops/)
- [Rearchitecting Agent Loops - Letta](https://www.letta.com/blog/letta-v1-agent)
- [Mini-SWE Agent - Emergent Mind](https://www.emergentmind.com/topics/mini-swe-agent-27d26942-1f63-4337-bee8-576ebb1468c3)
- [Strands Agents - Agent Loop](https://strandsagents.com/latest/documentation/docs/user-guide/concepts/agents/agent-loop/)

### Checkpoint/Rollback

- [Building Resilient CI/CD Pipelines - Medium](https://medium.com/@eren.c.uysal/building-resilient-ci-cd-pipelines-with-automated-recovery-points-f29a4d4dfbe6)
- [Automated Rollbacks in DevOps - Medium](https://medium.com/@surmittal/automated-rollbacks-in-devops-ensuring-stability-and-faster-recovery-in-ci-cd-pipelines-c197e39f9db6)
- [Automated Failover & Git Rollback with GitOps](https://www.aviator.co/blog/automated-failover-and-git-rollback-strategies-with-gitops-and-argo-rollouts/)

### Error Classification

- [Predicting Intermittent CI Failure Categories - arXiv](https://arxiv.org/html/2601.22264)
- [Sentry Issue Grouping](https://docs.sentry.io/concepts/data-management/event-grouping/)
- [Sentry Issue Priority](https://docs.sentry.io/product/issues/issue-priority/)
- [Sentry AI-Powered Grouping](https://blog.sentry.io/ai-powered-updates-issue-grouping-autofix-anomaly-detection-and-more/)
- [Classification of Software Errors - DZone](https://dzone.com/articles/classification-of-the-software-errors)

### Cost Budget Enforcement

- [Claude Code Cost Management](https://code.claude.com/docs/en/costs)
- [Claude Code Token Limits - Faros AI](https://www.faros.ai/blog/claude-code-token-limits)
- [Claude Code Limits - Portkey](https://portkey.ai/blog/claude-code-limits/)
- [7 LangChain Cost Controls - Medium](https://medium.com/@Praxen/7-langchain-cost-controls-budget-routers-capped-tools-ffed8faedba8)
- [Budget Limits in LLM Apps - Portkey](https://portkey.ai/blog/budget-limits-and-alerts-in-llm-apps/)
- [Langfuse Token and Cost Tracking](https://langfuse.com/docs/observability/features/token-and-cost-tracking)

### HITL/AFK Patterns

- [LangGraph Interrupts](https://docs.langchain.com/oss/python/langgraph/interrupts)
- [LangGraph Persistence Guide](https://fast.io/resources/langgraph-persistence/)
- [HITL for AI Agents - Permit.io](https://www.permit.io/blog/human-in-the-loop-for-ai-agents-best-practices-frameworks-use-cases-and-demo)
- [HITL with LangGraph and Elasticsearch - Elastic](https://www.elastic.co/search-labs/blog/human-in-the-loop-hitllanggraph-elasticsearch)
- [Claude Code Hooks Reference](https://code.claude.com/docs/en/hooks)
- [The Escalation Protocol - Medium](https://thought-walks.medium.com/the-escalation-protocol-engineering-pause-buttons-into-ai-systems-that-know-when-to-stop-33c6cf607d25)
- [HITL in AI Workflows - Zapier](https://zapier.com/blog/human-in-the-loop/)

---

_Research completed: 2026-02-11_
_Agent: lu-phase-researcher_
