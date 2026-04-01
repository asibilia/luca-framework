---
phase: 262
plan: 1
type: feature
autonomous: true
wave: 1
depends_on: []
---

# Phase 262 Plan 1: Convergence-Aware Stuck Detection

## Objective

Wire the existing iteration intelligence modules (`classifier`, `convergence`, `stall-debate`, `checkpoint`) into the harness fix loop (Step 7i of `lu.skill.ts`) and outer verification loop so that stuck patterns are detected and resolved with intelligent exit strategies rather than exhausting iteration budgets.

All six modules are already implemented. This plan is pure wiring work.

## Context

- @src/skills/luca/lu.skill.ts — Step 7i (harness fix loop) and outer implementation loop
- @src/skills/\_\_helpers/agent-prompts.ts — HARNESS_FIX_PROMPT to update
- @src/iteration/index.ts — Public API for all iteration modules
- @src/iteration/\_\_helpers/classifier.ts — classifyErrors, partitionByClass APIs
- @src/iteration/\_\_helpers/convergence.ts — computeConvergenceSignals, assessConvergence APIs
- @src/iteration/\_\_helpers/stall-debate.ts — evaluateStallDebate, shouldAttemptDebate APIs
- @src/iteration/\_\_helpers/checkpoint.ts — createCheckpoint, rollbackToCheckpoint, buildTagName, getArtifactDelta, getCurrentCommitHash APIs
- @src/iteration/\_\_schemas/iteration.schemas.ts — IterationRecord, ClassifiedError, ConvergenceResult types
- @src/iteration/\_\_schemas/stall-debate.schemas.ts — StallDebateInput, StallDebateOutput, StallDebateStrategy types

## Tasks

### 1. Wire classifier into harness fix loop (STUCK-01)

**Type:** auto
**TDD:** false
**Depends on:** none

Update Step 7i in `src/skills/luca/lu.skill.ts` to initialize and maintain a fingerprint ledger across harness fix iterations. After each harness check run returns errors, call `classifyErrors` to classify them and update the ledger.

Introduce the following state variables before the `FOR attempt = 1 to HARNESS_FIX_ITERATIONS` loop:

```
FINGERPRINT_LEDGER = {}           // Record<string, number>: fingerprint -> iterations_seen
PREVIOUS_CLASSIFIED = []          // ClassifiedError[] from the previous iteration
HARNESS_ITER_HISTORY = []         // Lightweight iteration history for stall-debate
CONSECUTIVE_STALE = 0             // int: consecutive stale count
CONTEXT_TIER = "T1"              // Current context tier, starts at T1 for harness loop
PREV_CHECKPOINT_TAG = ""          // Git tag of the previous checkpoint (for rollback)
```

Inside the loop, after each failed harness check (before calling the fix agent):

```bash
# 1. Extract check results from HARNESS_OUTPUT
# 2. Call classifier via bun inline expression:
CLASSIFY_RESULT=$(bun -e "
import { classifyErrors } from './src/iteration/__helpers/classifier';
const checkResults = JSON.parse(process.env.HARNESS_CHECKS || '[]');
const ledger = JSON.parse(process.env.FINGERPRINT_LEDGER || '{}');
const result = classifyErrors(checkResults, ledger);
console.log(JSON.stringify(result));
" 2>/dev/null || echo '{"classified":[],"updated_ledger":{}}')
FINGERPRINT_LEDGER=$(echo "$CLASSIFY_RESULT" | bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(JSON.stringify(r.updated_ledger))" 2>/dev/null || echo '{}')
CURRENT_CLASSIFIED=$(echo "$CLASSIFY_RESULT" | bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(JSON.stringify(r.classified))" 2>/dev/null || echo '[]')
```

**Files to create/edit:**

- `src/skills/luca/lu.skill.ts` (Step 7i — harness fix loop)

**Verification:**

- Step 7i contains `FINGERPRINT_LEDGER`, `PREVIOUS_CLASSIFIED`, and `HARNESS_ITER_HISTORY` state variables initialized before the fix loop
- `classifyErrors` call appears inside the FOR loop after a failed harness check
- The ledger is updated each iteration so fingerprint counts accumulate

### 2. Wire convergence signals into harness fix loop (STUCK-02)

**Type:** auto
**TDD:** false
**Depends on:** 1

After classifying errors in each iteration (Task 1), compute convergence signals by comparing current classified errors against the previous iteration's errors.

Inside the loop, after classification:

```bash
# Compute artifact delta since previous checkpoint
ARTIFACT_DELTA=$(bun src/iteration/__helpers/checkpoint.ts artifact-delta \
  --from-ref="$PREV_CHECKPOINT_TAG" 2>/dev/null | \
  bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(r.artifact_delta ?? 0)" 2>/dev/null || echo "0")

# Compute convergence signals
CONVERGENCE_RESULT=$(bun -e "
import { computeConvergenceSignals, assessConvergence } from './src/iteration/__helpers/convergence';
const current = JSON.parse(process.env.CURRENT_CLASSIFIED || '[]');
const previous = JSON.parse(process.env.PREVIOUS_CLASSIFIED || '[]');
const artifactDelta = parseInt(process.env.ARTIFACT_DELTA || '0', 10);
const previousStale = parseInt(process.env.CONSECUTIVE_STALE || '0', 10);
const signals = computeConvergenceSignals(current, previous, artifactDelta);
const result = assessConvergence(signals, previousStale);
console.log(JSON.stringify(result));
" 2>/dev/null || echo '{"signals":{},"status":"improved","consecutive_stale":0,"should_halt":false}')
CONSECUTIVE_STALE=$(echo "$CONVERGENCE_RESULT" | bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(r.consecutive_stale)" 2>/dev/null || echo "0")
```

Update `PREVIOUS_CLASSIFIED = CURRENT_CLASSIFIED` at the end of each loop iteration.

**Files to create/edit:**

- `src/skills/luca/lu.skill.ts` (Step 7i — after classification block)

**Verification:**

- `computeConvergenceSignals` and `assessConvergence` calls appear in the loop
- `CONVERGENCE_RESULT` variable is populated
- `CONSECUTIVE_STALE` is updated each iteration
- `PREVIOUS_CLASSIFIED` is rotated at the bottom of the loop body

### 3. Wire stall-debate evaluator into harness fix loop (STUCK-03)

**Type:** auto
**TDD:** false
**Depends on:** 2

After computing convergence (Task 2), check `should_halt`. When `should_halt` is true, invoke the stall-debate evaluator before breaking. Act on the recommended strategy: halt, retry_with_context_promotion, retry_with_error_focus, or retry_with_rollback.

Inside the loop, after convergence assessment:

```bash
SHOULD_HALT=$(echo "$CONVERGENCE_RESULT" | bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(r.should_halt)" 2>/dev/null || echo "false")

if [ "$SHOULD_HALT" = "true" ]; then
  BUDGET_REMAINING=$((HARNESS_FIX_ITERATIONS - attempt))

  STALL_RESULT=$(bun -e "
import { evaluateStallDebate } from './src/iteration/__helpers/stall-debate';
const input = {
  convergence_result: JSON.parse(process.env.CONVERGENCE_RESULT),
  current_errors: JSON.parse(process.env.CURRENT_CLASSIFIED || '[]'),
  budget_remaining: parseInt(process.env.BUDGET_REMAINING || '0', 10),
  loop_type: 'harness',
  iteration_history: JSON.parse(process.env.HARNESS_ITER_HISTORY || '[]'),
  context_tier: process.env.CONTEXT_TIER || 'T1',
};
console.log(JSON.stringify(evaluateStallDebate(input)));
" 2>/dev/null || echo '{"recommended_strategy":"halt","confidence":1.0,"reasoning":"stall-debate unavailable","strategy_params":{}}')

  STALL_STRATEGY=$(echo "$STALL_RESULT" | bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(r.recommended_strategy)" 2>/dev/null || echo "halt")

  if [ "$STALL_STRATEGY" = "halt" ]; then
    echo "INFO: Harness fix loop halting — convergence failure (strategy: halt)"
    break
  elif [ "$STALL_STRATEGY" = "retry_with_context_promotion" ]; then
    CONTEXT_TIER=$(echo "$STALL_RESULT" | bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(r.strategy_params?.target_tier ?? 'T2')" 2>/dev/null || echo "T2")
    echo "INFO: Promoting context tier to $CONTEXT_TIER and retrying"
  elif [ "$STALL_STRATEGY" = "retry_with_error_focus" ]; then
    FOCUS_SOURCES=$(echo "$STALL_RESULT" | bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(JSON.stringify(r.strategy_params?.focus_sources ?? []))" 2>/dev/null || echo "[]")
    echo "INFO: Retrying with error focus on sources: $FOCUS_SOURCES"
  elif [ "$STALL_STRATEGY" = "retry_with_rollback" ]; then
    echo "INFO: Stall strategy is rollback — deferring to Task 6 rollback logic"
    # Rollback is handled by the checkpoint rollback block (STUCK-06)
  fi
fi
```

Append a lightweight entry to `HARNESS_ITER_HISTORY` at the end of each loop iteration:

```bash
HARNESS_ITER_HISTORY=$(bun -e "
const hist = JSON.parse(process.env.HARNESS_ITER_HISTORY || '[]');
const convResult = JSON.parse(process.env.CONVERGENCE_RESULT || '{}');
hist.push({
  iteration: ${attempt},
  error_count: JSON.parse(process.env.CURRENT_CLASSIFIED || '[]').filter(e => e.classification !== 'permanent').length,
  convergence_status: convResult.status ?? 'improved',
  stale_count: convResult.consecutive_stale ?? 0,
});
console.log(JSON.stringify(hist));
" 2>/dev/null || echo "$HARNESS_ITER_HISTORY")
```

**Files to create/edit:**

- `src/skills/luca/lu.skill.ts` (Step 7i — after convergence block)

**Verification:**

- When `SHOULD_HALT=true`, stall-debate evaluator is invoked before breaking
- All four strategies are handled (`halt`, `retry_with_context_promotion`, `retry_with_error_focus`, `retry_with_rollback`)
- `HARNESS_ITER_HISTORY` is appended each iteration
- `halt` strategy breaks the loop immediately

### 4. Update HARNESS_FIX_PROMPT to accept only correctable errors (STUCK-04)

**Type:** auto
**TDD:** false
**Depends on:** 1

Modify `HARNESS_FIX_PROMPT` in `src/skills/__helpers/agent-prompts.ts` to:

1. Accept an optional `classifiedErrors` parameter alongside the existing `errors` string
2. When `classifiedErrors` is provided, filter out permanent errors from what is sent to the fixer
3. Include convergence context (consecutive stale count, strategy hint) in the prompt when available

Update the function signature:

```typescript
export const HARNESS_FIX_PROMPT = (
  errors: string,
  p: AgentPromptParams,
  classifiedErrors?: ClassifiedError[],
  convergenceCtx?: { consecutive_stale: number; strategy_hint?: string },
): string => {
```

When `classifiedErrors` is provided, build a filtered error list that excludes permanent errors:

```typescript
const correctableErrors = classifiedErrors
  ? classifiedErrors
      .filter((e) => e.classification !== "permanent")
      .map((e) => `[${e.source}] ${e.file ?? ""}:${e.line ?? 0} — ${e.message}`)
      .join("\n")
  : sanitized;
const errorContent = classifiedErrors
  ? correctableErrors.slice(0, 4000)
  : sanitized;
```

Add a convergence context section to the prompt body when `convergenceCtx` is present:

```
<convergence_context>
Consecutive stale iterations: {consecutive_stale}
{strategy_hint ? `Strategy hint: {strategy_hint}` : ""}
Focus only on correctable errors above. Permanent errors (module resolution failures, circular imports) are excluded — do not attempt to fix them.
</convergence_context>
```

Update Step 7i in `lu.skill.ts` to pass `CURRENT_CLASSIFIED` and `CONVERGENCE_RESULT` when invoking the fix agent, so the executor's call to `HARNESS_FIX_PROMPT` can use the enriched signature.

**Files to create/edit:**

- `src/skills/__helpers/agent-prompts.ts` — HARNESS_FIX_PROMPT signature and body
- `src/skills/luca/lu.skill.ts` — Pass classified errors and convergence context to fix agent prompt

**Verification:**

- `HARNESS_FIX_PROMPT` function signature has optional third and fourth parameters
- When called without `classifiedErrors`, behavior is identical to before (no regression)
- When called with `classifiedErrors`, prompt body excludes permanent errors
- Convergence context section appears in the prompt when `consecutive_stale > 0`
- TypeScript type check passes: `bunx --bun tsc --noEmit`

### 5. Add convergence tracking to outer verification loop (STUCK-05)

**Type:** auto
**TDD:** false
**Depends on:** 2

Add verification-level stuck detection to the outer `VERIFY_FIX_ITERATIONS` loop in Step 7j of `lu.skill.ts`. Track which `verification-result.json` criteria are failing across iterations, detect overlap ≥ 80% between consecutive failing criterion sets, and invoke stuck detection.

Introduce state variables before the verify fix loop:

```
VERIFY_PREV_FAILING_IDS = []      // string[]: criterion_ids that failed last iteration
VERIFY_CONSECUTIVE_STALE = 0      // int: consecutive stale iterations
```

After each `lu-verifier` agent returns and before the fix agent is spawned, read `verification-result.json` and compare the current failing set against the previous set:

```bash
# Read failing criterion IDs from verification-result.json
CURRENT_FAILING=$(bun -e "
import { Bun } from 'bun';
const globPattern = '.planning/phases/PHASE_NUMBER-*/verification-result.json';
const glob = new Bun.Glob(globPattern);
let failing = [];
for await (const f of glob.scan('.')) {
  const data = await Bun.file(f).json().catch(() => null);
  if (data?.criteria) {
    failing = data.criteria.filter(c => !c.met).map(c => c.criterion_id);
  }
}
console.log(JSON.stringify(failing));
" 2>/dev/null || echo '[]')

# Compute overlap between current and previous failing sets
VERIFY_OVERLAP=$(bun -e "
const current = new Set(JSON.parse(process.env.CURRENT_FAILING || '[]'));
const previous = new Set(JSON.parse(process.env.VERIFY_PREV_FAILING_IDS || '[]'));
if (current.size === 0 && previous.size === 0) { console.log('0'); process.exit(0); }
let intersection = 0;
for (const id of current) { if (previous.has(id)) intersection++; }
const union = new Set([...current, ...previous]).size;
console.log((union > 0 ? intersection / union : 0).toFixed(4));
" 2>/dev/null || echo "0")

# Determine if outer loop is stalled (overlap >= 0.80)
if bun -e "process.exit(parseFloat(process.env.VERIFY_OVERLAP || '0') >= 0.8 ? 0 : 1)" 2>/dev/null; then
  VERIFY_CONSECUTIVE_STALE=$((VERIFY_CONSECUTIVE_STALE + 1))
  if [ "$VERIFY_CONSECUTIVE_STALE" -ge 2 ]; then
    echo "WARN: Outer verification loop stalled — same criteria failing for 2+ consecutive iterations (overlap: $VERIFY_OVERLAP)"
    echo "INFO: Halting verify fix loop to avoid budget waste"
    break
  fi
else
  VERIFY_CONSECUTIVE_STALE=0
fi
VERIFY_PREV_FAILING_IDS="$CURRENT_FAILING"
```

**Files to create/edit:**

- `src/skills/luca/lu.skill.ts` (Step 7j — verify fix loop)

**Verification:**

- `VERIFY_PREV_FAILING_IDS` and `VERIFY_CONSECUTIVE_STALE` variables are initialized before the loop
- After each verifier run, failing criterion IDs are extracted from `verification-result.json`
- Jaccard overlap is computed between current and previous failing sets
- When overlap ≥ 0.80 for 2 consecutive iterations, loop breaks with a WARN log message

### 6. Wire git checkpoint tags for rollback support (STUCK-06)

**Type:** auto
**TDD:** false
**Depends on:** 3

Add checkpoint creation at the start of each harness fix iteration and implement the rollback action when `retry_with_rollback` is selected by the stall evaluator.

At the top of the harness fix loop (before spawning the fix agent), create a checkpoint:

```bash
# Create git checkpoint before each harness fix iteration
COMMIT_HASH=$(bun src/iteration/__helpers/checkpoint.ts commit-hash 2>/dev/null | \
  bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(r.commit_hash)" 2>/dev/null || echo "unknown")
CHECKPOINT_TAG="iter/PHASE_NUMBER/harness/${attempt}"
ITER_RECORD=$(bun -e "console.log(JSON.stringify({
  tag: process.env.CHECKPOINT_TAG,
  phase: PHASE_NUMBER,
  loop: 'harness',
  iteration: ${attempt},
  error_count: JSON.parse(process.env.CURRENT_CLASSIFIED || '[]').filter(e => e.classification !== 'permanent').length,
  error_delta: 0,
  error_fingerprints: JSON.parse(process.env.CURRENT_CLASSIFIED || '[]').map(e => e.fingerprint),
  convergence_status: 'improved',
  stale_count: parseInt(process.env.CONSECUTIVE_STALE || '0', 10),
  permanent_errors: JSON.parse(process.env.CURRENT_CLASSIFIED || '[]').filter(e => e.classification === 'permanent').map(e => e.fingerprint),
  correctable_errors: JSON.parse(process.env.CURRENT_CLASSIFIED || '[]').filter(e => e.classification === 'correctable').map(e => e.fingerprint),
  transient_errors: JSON.parse(process.env.CURRENT_CLASSIFIED || '[]').filter(e => e.classification === 'transient').map(e => e.fingerprint),
  artifacts_delta: 0,
  commit_hash: process.env.COMMIT_HASH || 'unknown',
  agent_invoked: 'lu-executor',
  duration_ms: 0,
  timestamp: new Date().toISOString(),
}))" 2>/dev/null || echo '{}')
bun src/iteration/__helpers/checkpoint.ts create --record="$ITER_RECORD" 2>/dev/null || true
PREV_CHECKPOINT_TAG="$CHECKPOINT_TAG"
```

Add the rollback action within the stall strategy handling block from Task 3. When `STALL_STRATEGY = "retry_with_rollback"` and `PREV_CHECKPOINT_TAG` is set:

```bash
elif [ "$STALL_STRATEGY" = "retry_with_rollback" ] && [ -n "$PREV_CHECKPOINT_TAG" ]; then
  echo "INFO: Rolling back to checkpoint $PREV_CHECKPOINT_TAG"
  ROLLBACK_RESULT=$(bun src/iteration/__helpers/checkpoint.ts rollback \
    --tag="$PREV_CHECKPOINT_TAG" 2>/dev/null || echo '{"success":false}')
  ROLLBACK_OK=$(echo "$ROLLBACK_RESULT" | bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(r.success)" 2>/dev/null || echo "false")
  if [ "$ROLLBACK_OK" = "true" ]; then
    echo "INFO: Rollback succeeded — continuing with next iteration"
    FINGERPRINT_LEDGER='{}'
    CONSECUTIVE_STALE=0
  else
    echo "WARN: Rollback failed — halting loop"
    break
  fi
```

After the harness fix loop completes successfully (all checks passed), prune phase checkpoints:

```bash
bun src/iteration/__helpers/checkpoint.ts prune --phase=PHASE_NUMBER 2>/dev/null || true
```

**Files to create/edit:**

- `src/skills/luca/lu.skill.ts` (Step 7i — checkpoint creation at loop start, rollback logic in stall handler, pruning after loop)

**Verification:**

- `bun src/iteration/__helpers/checkpoint.ts create` is called at the start of each harness fix iteration
- `PREV_CHECKPOINT_TAG` is set to `iter/PHASE_NUMBER/harness/${attempt}` before the fix agent
- When `STALL_STRATEGY = "retry_with_rollback"`, `rollbackToCheckpoint` is invoked via the CLI
- After a successful rollback, `FINGERPRINT_LEDGER` and `CONSECUTIVE_STALE` are reset
- After loop success, `prune` is called to clean up checkpoint tags and metadata files

## Verification

1. TypeScript type check passes with no new errors: `bunx --bun tsc --noEmit`
2. Step 7i in `lu.skill.ts` contains all six wiring blocks in order: state init → checkpoint → classify → convergence → stall-debate → strategy dispatch
3. `HARNESS_FIX_PROMPT` in `agent-prompts.ts` compiles with the new optional parameters and produces identical output when called without them (regression guard)
4. Step 7j in `lu.skill.ts` contains the outer loop stall detection block comparing `VERIFY_PREV_FAILING_IDS` against current failing criteria
5. All iteration module imports resolve: `src/iteration/index.ts` exports all referenced functions

## Success Criteria

1. When harness fix loop encounters same error fingerprints for 2 consecutive iterations, `assessConvergence` returns `should_halt: true` and `evaluateStallDebate` returns one of the 4 strategies
2. `HARNESS_FIX_PROMPT` is called with filtered (correctable-only) errors and convergence context injected
3. When outer verify loop detects same criteria failing across 2 iterations with ≥ 80% Jaccard overlap, the loop breaks with a WARN log
4. Git checkpoint tags (`iter/<phase>/harness/<N>`) are created before each fix iteration; rollback strategy invokes `git reset --hard <tag>`

## Output Specification

- Modified `src/skills/luca/lu.skill.ts` — Step 7i and Step 7j wiring
- Modified `src/skills/__helpers/agent-prompts.ts` — enriched `HARNESS_FIX_PROMPT`
