# Research: Learning 4 — Stuck Detection in the Implementation Loop

> **Date:** 2026-03-31
> **Status:** Research complete
> **Learning:** GSD2 Learning 4 — Stuck Detection
> **Pipeline scope:** Step 5h-5k (Implementation Loop)
> **Cross-references:** [05-structured-verification.md](./05-structured-verification.md), [06-deterministic-classification.md](./06-deterministic-classification.md)

## Summary

GSD2 uses sliding-window analysis of dispatch history to detect repeated A-B-A-B cycling. Luca already has a convergence detection system (`src/iteration/`) that is more sophisticated than GSD2's, but it is not wired into the orchestrator's implementation loop. The proposed pipeline (Steps 5h-5k) references `MAX_IMPL_ITERATIONS` as the termination mechanism, but convergence detection should be the primary loop exit signal, with iteration count as a backstop only.

## Current State of Stuck Detection in Luca

Luca already has a rich iteration management subsystem:

| Module              | Location                                       | Purpose                                                                                                                  |
| ------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Convergence signals | `src/iteration/__helpers/convergence.ts`       | Jaccard similarity (fingerprint overlap), cosine similarity (semantic overlap), error count delta, artifact change delta |
| Stall detector      | `src/iteration/__helpers/stall-detector.ts`    | 2-of-3 (or 2-of-4) composite stall rule from convergence signals                                                         |
| Error classifier    | `src/iteration/__helpers/classifier.ts`        | Rule-based error classification: transient, correctable, permanent                                                       |
| Stall debate        | `src/iteration/__helpers/stall-debate.ts`      | Pure heuristic retry/halt decision with 4 strategy options                                                               |
| Budget tracking     | `src/iteration/__helpers/budget.ts`            | Iteration + optional token budget with soft stop                                                                         |
| Checkpoint system   | `src/iteration/__helpers/checkpoint.ts`        | Git tag-based iteration snapshots                                                                                        |
| Iteration schemas   | `src/iteration/__schemas/iteration.schemas.ts` | Full Zod schema suite for all iteration types                                                                            |

**The problem is not that stuck detection doesn't exist. The problem is that none of this infrastructure is referenced in the proposed pipeline or in the current orchestrator prompt.**

The `lu.skill.ts` implementation loop (Step 7h-7o) uses a simple `FOR attempt = 1 to HARNESS_FIX_ITERATIONS` with no convergence checking. The harness agent returns `PASSED: true/false` and `ERROR_COUNT: N`. The orchestrator either breaks on pass or spawns a fix agent and loops. There is no fingerprint tracking, no convergence assessment, and no stall debate.

## What Specifically Needs to Change

### Pipeline Step 5h-5k: Implementation Loop

The current proposal:

```
FOR attempt = 1 to MAX_IMPL_ITERATIONS:
  5h. Execute wave tasks
  5i. Harness fix loop (tsc + test)
  5j. Goal-backward verification
  5k. If passed -> BREAK. If gaps -> plan gaps, loop. If max -> park/escalate.
```

Should become:

```
INITIALIZE: fingerprint_ledger = {}, previous_errors = [], stale_count = 0, budget = createBudgetState(MAX_IMPL_ITERATIONS)

FOR attempt = 1 to MAX_IMPL_ITERATIONS:
  5h. Execute wave tasks
  5i. Harness check (tsc + test) -> structured result
  5i-a. Classify errors (classifier.ts) -> classified errors + updated ledger
  5i-b. Compute convergence signals (convergence.ts) -> signals
  5i-c. Detect stall (stall-detector.ts) -> stall result
  5i-d. IF stall detected:
        - Run stall debate (stall-debate.ts) -> strategy
        - IF strategy == "halt": park phase, BREAK
        - IF strategy == "retry_with_context_promotion": promote model tier, CONTINUE
        - IF strategy == "retry_with_error_focus": narrow fix prompt to top patterns, CONTINUE
        - IF strategy == "retry_with_rollback": git checkout to checkpoint, CONTINUE
  5i-e. IF not stalled and errors exist: spawn fix agent with classified error context
  5i-f. Advance budget, check shouldStartIteration
  5j. Goal-backward verification (only after harness passes)
  5k. IF all passed -> BREAK. IF gaps -> plan gaps with convergence context, loop.
```

### Inner Harness Fix Loop (Step 7i in lu.skill.ts)

The inner harness fix loop also needs convergence awareness:

```
INITIALIZE: harness_ledger = {}, harness_prev = [], harness_stale = 0

FOR attempt = 1 to HARNESS_FIX_ITERATIONS:
  Run harness agent -> harness result
  Classify errors against harness_ledger
  Compute convergence signals vs harness_prev
  IF stalled (2-of-3 indicators fire):
    Evaluate stall debate
    Act on strategy or break
  ELSE IF errors exist:
    Spawn fix agent with classified error context (top correctable errors only)
  Update harness_prev, harness_ledger, harness_stale
```

## Claude Code Constraints

### No Process Control

GSD2 runs on the Pi SDK and can directly control agent sessions, model selection, and context windows at the process level. Luca runs inside Claude Code where:

- **Agent() calls are the only mechanism** for fresh context. We cannot programmatically create Pi SDK sessions.
- **The orchestrator IS an LLM prompt**, not TypeScript code. The convergence logic must be either (a) invoked via CLI tools from the prompt, or (b) pre-computed by hooks.
- **State between iterations lives in files** (context-cli.ts, harness-result.json) and in the orchestrator's own context window.

### CLI-Invocable Convergence Pipeline

The iteration modules already have CLI entry points:

```bash
# Classify errors from harness result
bun src/iteration/__helpers/classifier.ts \
  --harness-result='{"checks":[...]}' \
  --ledger='{}' \
  --promotion-threshold=3

# Compute convergence and assess stall
bun src/iteration/__helpers/convergence.ts \
  --current='[...]' \
  --previous='[...]' \
  --artifact-delta=3 \
  --previous-stale-count=0 \
  --stale-threshold=2 \
  --semantic
```

The orchestrator prompt can invoke these via Bash after each harness run. The key is that the prompt must be instructed to:

1. Capture the harness-result.json after each harness agent run
2. Pass it through the classifier CLI
3. Pass the classified errors through the convergence CLI
4. Read the exit code (0 = continue, 1 = halt) and the JSON output
5. Act on the result

### Context Window Pressure

Each iteration adds context to the orchestrator's window: harness output, fix agent output, convergence assessment. With 3 harness fix iterations at COMPLEX (which could mean 6+ agent calls counting fixes), the orchestrator's context fills rapidly.

**Mitigation:** The convergence pipeline runs outside the LLM context (CLI tools). Only the final decision (`should_halt`, `recommended_strategy`, `reason`) needs to be injected back into the orchestrator's context, not the full signal computation.

## Concrete Implementation Approach

### 1. Orchestrator Prompt Changes (lu.skill.ts)

Add convergence tracking to the implementation loop in lu.skill.ts Step 7i:

```
#### 7i. Harness Fix Loop (INLINE, hoisted, CONVERGENCE-AWARE)

INITIALIZE convergence state:
\`\`\`bash
LEDGER='{}'
PREV_ERRORS='[]'
STALE_COUNT=0
\`\`\`

FOR attempt = 1 to HARNESS_FIX_ITERATIONS:
  Agent(name: "harness-{NN}", ...)

  # Classify errors
  CLASSIFIED=$(bun src/iteration/__helpers/classifier.ts \
    --harness-result="$(cat .planning/harness-result.json)" \
    --ledger="$LEDGER")
  LEDGER=$(echo "$CLASSIFIED" | bun -e "...")  # extract updated_ledger
  CURRENT_ERRORS=$(echo "$CLASSIFIED" | bun -e "...")  # extract classified

  # Compute convergence
  CONVERGENCE=$(bun src/iteration/__helpers/convergence.ts \
    --current="$CURRENT_ERRORS" \
    --previous="$PREV_ERRORS" \
    --artifact-delta=$(git diff --stat HEAD~1 | tail -1 | awk '{print $1}') \
    --previous-stale-count=$STALE_COUNT \
    --stale-threshold=2)

  SHOULD_HALT=$?  # exit code 1 = halt
  STALE_COUNT=$(echo "$CONVERGENCE" | bun -e "...")

  IF SHOULD_HALT == 1:
    Log: "Stall detected after $attempt iterations. Parking phase."
    Park phase, BREAK

  IF PASSED: BREAK

  # Fix with classified error context (only correctable errors)
  CORRECTABLE=$(echo "$CURRENT_ERRORS" | bun -e "... filter correctable ...")
  Agent(name: "fix-{NN}", ..., prompt: HARNESS_FIX_PROMPT($CORRECTABLE, {...}))

  PREV_ERRORS=$CURRENT_ERRORS
```

### 2. Fix Agent Prompt Enhancement

The current `HARNESS_FIX_PROMPT` receives raw error text. With convergence data, it should receive:

- Only correctable errors (not permanent, not transient)
- Whether each error is new or recurring (iterations_seen)
- What was attempted before (from previous fix agent, via context file)

This prevents the fix agent from re-attempting the same fix strategy on recurring errors.

### 3. Stall Strategy Execution

When `evaluateStallDebate` returns a non-halt strategy, the orchestrator must act:

| Strategy                       | Orchestrator Action                                                                                         |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `retry_with_context_promotion` | Promote the fix agent's model tier (e.g., haiku -> sonnet -> opus). Already possible via the routing table. |
| `retry_with_error_focus`       | Narrow the fix prompt to only the top 3 correctable error patterns (from `strategy_params.focus_sources`).  |
| `retry_with_rollback`          | Run `git checkout` to the pre-fix commit hash (from checkpoint). Then retry with the full error context.    |
| `halt`                         | Park the phase, log the reason, emit `PHASE_PARK` transition.                                               |

### 4. Checkpoint Integration

The checkpoint module (`src/iteration/__helpers/checkpoint.ts`) uses git tags to snapshot iteration state. The orchestrator should:

- Create a checkpoint tag before each fix agent run
- Use the tag for rollback when stall debate recommends it
- Store the tag name in the context file for crash recovery

## What "Stuck" Means in Our Context

In Luca's implementation loop (5h-5k), "stuck" manifests in these specific patterns:

### Pattern 1: Harness Oscillation (A-B-A-B)

Fix agent resolves error A but introduces error B. Next iteration resolves B but reintroduces A. The fingerprint overlap will be high (same fingerprints cycling) and error_count_delta will hover around 0.

**Detection:** `fingerprint_overlap >= 0.8` AND `error_count_delta >= 0`

**Current behavior:** Loop runs to `HARNESS_FIX_ITERATIONS` limit, wasting all iterations.

**With convergence:** Detected on iteration 2 (after 1 consecutive stale). Stall debate evaluates whether context promotion or error focus could break the cycle.

### Pattern 2: Unfixable Errors (Permanent)

Error requires architectural change beyond the fix agent's scope (e.g., circular dependency, missing module). The classifier promotes to "permanent" after `promotion_threshold` (default 3) iterations. But the outer loop doesn't know this.

**Detection:** `classifySingleError` returns `classification: "permanent"` after threshold.

**Current behavior:** Fix agent keeps attempting the same fix. Errors remain.

**With convergence:** Permanent errors are excluded from active error count. If all remaining errors are permanent, the loop recognizes this as convergence failure and parks the phase with a diagnostic: "N errors classified as permanent after M iterations."

### Pattern 3: Semantic Drift Without Progress

Fix agent makes changes (non-zero `artifact_change_delta`) but the error messages, while slightly different in wording, describe the same root cause. Fingerprint overlap may be moderate (different line numbers) but semantic overlap is high.

**Detection:** `semantic_overlap >= 0.9` (when enabled with `--semantic` flag)

**Current behavior:** Not detected at all.

**With convergence:** The optional 4th signal catches this pattern.

### Pattern 4: Goal Verification Stall

The outer implementation loop (5h-5k) passes harness but fails goal-backward verification repeatedly. The verifier finds the same gaps each iteration because the executor doesn't have enough context to understand what's missing.

**Detection:** The outer loop needs its own convergence tracking, separate from the inner harness loop. Track verification verdicts across iterations. If verification returns `ISSUES` with the same criteria failing, that's a stall.

**Current behavior:** The outer loop has `MAX_IMPL_ITERATIONS` but no convergence checking.

**With convergence:** Track which success criteria pass/fail across iterations. If the same criteria fail in iterations N and N+1, invoke stall debate with the verification context.

## Convergence Detection vs Iteration Counting

The key insight from GSD2 is that **convergence detection is more valuable than iteration count limits**. Here's why:

| Signal                | What It Tells You                                           |
| --------------------- | ----------------------------------------------------------- |
| Iteration count       | "You've tried N times" (says nothing about progress)        |
| Error count delta     | "Things got better/worse/same"                              |
| Fingerprint overlap   | "You're seeing the same errors as last time"                |
| Artifact change delta | "Code was actually modified"                                |
| Semantic overlap      | "The errors mean the same thing even if worded differently" |

A loop that is making progress (error count decreasing, new fingerprints appearing, artifacts changing) should continue even if it has used 2 of 3 iterations. A loop that is stalled (same errors, no artifact changes) should stop after iteration 2 even if it has budget for 3.

**Proposed rule:** Convergence status is the primary exit signal. Iteration count is a hard backstop. Budget soft-stop is a warning signal. In priority:

1. `all_passed` -> success, exit
2. `convergence_failure` (stall detected + stall debate says halt) -> park, exit
3. `budget_exhausted` (iteration hard limit or token limit) -> park, exit
4. `soft_stop` (80% of budget used) -> finish current iteration, don't start new one

## Risks and Tradeoffs

### Adopting

| Risk                                                | Mitigation                                                                                         |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Additional complexity in orchestrator prompt        | CLI tools do the computation; prompt only reads JSON output                                        |
| Context pressure from convergence state tracking    | Only inject decision (halt/continue/strategy), not full signal data                                |
| Stall debate recommends retry but retry still fails | Budget backstop ensures eventual termination; stall debate can only recommend retry once per stall |
| Checkpoint git tags clutter the repo                | Clean up tags after phase completes (already handled by checkpoint module)                         |

### Not Adopting

| Risk                                                          | Impact                                                                                                                                                   |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wasted iterations on identical failures                       | Each iteration costs tokens and time; COMPLEX phases with 3 harness fix iterations could waste 2 iterations on the same error                            |
| No diagnostic context for parking decisions                   | When a phase is parked, the developer gets "max iterations reached" instead of "stalled on error X which was classified as permanent after 3 iterations" |
| Fix agent receives full error list including unfixable errors | Dilutes the fix agent's attention; correctable errors get less focus when mixed with permanent ones                                                      |

## Interaction With Other Learnings

### Learning 5 (Structured Verification Data)

The convergence pipeline depends on structured harness output. The current harness (`src/harness/__schemas/harness.schemas.ts`) already produces structured `HarnessResult` JSON with `ParsedError` arrays. The classifier and convergence modules consume this structured data.

If the goal-backward verifier also produces structured output (Learning 5), then the outer implementation loop (5h-5k) can track verification convergence using the same pattern: fingerprint verification criteria, compute overlap between iterations.

### Learning 6 (Deterministic Classification)

Stuck detection and complexity classification are independent decisions, but they share a design principle: deterministic heuristics over LLM calls. The stall debate (`evaluateStallDebate`) is already a pure heuristic function with no LLM calls. Complexity classification should follow the same pattern.

Additionally, if complexity classification consults routing history (Learning 6's adaptive learning), then stuck detection outcomes become an input signal: phases that repeatedly stall at a given complexity should be routed to higher complexity on future similar tasks.

## Recommendation

**Adopt fully.** The infrastructure exists but is disconnected from the orchestrator. The work is:

1. Update the `lu.skill.ts` harness fix loop to invoke classifier + convergence CLIs (prompt change only)
2. Update `HARNESS_FIX_PROMPT` to accept classified errors instead of raw text
3. Add a convergence tracking block to the outer implementation loop (5h-5k) for goal verification stalls
4. Wire the checkpoint module into the loop for rollback support
5. Add the convergence state to the context file for crash recovery

Estimated effort: Moderate. This is primarily orchestrator prompt engineering plus ensuring the CLI tools are correctly invoked from the prompt. No new TypeScript modules needed -- the infrastructure is built.
