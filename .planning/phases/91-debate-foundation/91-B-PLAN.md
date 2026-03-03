---
id: 91-B
title: "Stall-vs-retry convergence debate"
phase: 91
wave: 1
complexity: MODERATE
todo: 40
---

# 91-B: Stall-vs-Retry Convergence Debate

## Objective

When the iteration system detects 2+ consecutive stale iterations and prepares to halt, introduce a lightweight prompt-based debate that evaluates whether retrying with a different strategy could succeed. This eliminates approximately 10% of premature halts by considering alternatives before giving up.

This is NOT an agent-team debate. It is a single-function evaluation that considers multiple strategies and picks the most promising one, adding only ~300 tokens per stall event (rare: ~1-2 per COMPLEX phase).

## Context

@src/iteration/**helpers/convergence.ts -- assessConvergence returns ConvergenceResult with should_halt boolean
@src/iteration/**schemas/iteration.schemas.ts -- ConvergenceResult, ConvergenceSignals, ConvergenceStatus, LoopConfig
@src/iteration/**helpers/budget.ts -- BudgetState, shouldStartIteration (budget must still allow retries)
@src/iteration/**helpers/classifier.ts -- ClassifiedError, partitionByClass (error composition informs strategy)
@src/iteration/\_\_helpers/checkpoint.ts -- rollbackToCheckpoint (rollback strategy needs this)
@src/skills/general/phase-execute.skill.ts -- Step 6.6.2 Step C: convergence check, Step D: checkpoint, Step F: spawn executor

The convergence system currently uses a hard rule: 2+ consecutive stale iterations triggers `should_halt: true`. The orchestrator (phase-execute) then exits the loop with outcome "convergence_failure". There is no mechanism to consider whether a different approach might unstall the loop.

Key observation: some stalls occur because the executor keeps trying the same approach. A context tier promotion (giving the executor more project context) or a different error focus (prioritizing different correctable errors) could break the stall pattern.

## Tasks

### Task 1: Define debate strategy schemas

**Goal:** Create Zod schemas for stall debate strategies and outcomes.

**Files:** `src/iteration/__schemas/stall-debate.schemas.ts` (new)

**Steps:**

1. Create `stall-debate.schemas.ts` in `src/iteration/__schemas/`
2. Define `stallDebateStrategySchema` as an enum:
   - `"halt"` -- Current behavior: stop the loop (convergence failure)
   - `"retry_with_context_promotion"` -- Retry with promoted context tier (give executor more project context)
   - `"retry_with_error_focus"` -- Retry with narrowed error focus (pick highest-leverage correctable error subset)
   - `"retry_with_rollback"` -- Roll back to a prior checkpoint and retry from there
3. Define `stallDebateInputSchema` with fields:
   - `convergence_result`: ConvergenceResult (the stall signals)
   - `current_errors`: array of ClassifiedError
   - `budget_remaining`: number (iterations left)
   - `loop_type`: LoopType
   - `iteration_history`: array of `{ iteration: number, error_count: number, status: ConvergenceStatus }` (recent 3-5 iterations)
   - `context_tier`: string (current context tier, e.g., "T0", "T1")
4. Define `stallDebateOutputSchema` with fields:
   - `recommended_strategy`: stallDebateStrategySchema
   - `confidence`: number (0.0-1.0)
   - `reasoning`: string (1-2 sentences explaining why this strategy was chosen)
   - `strategy_params`: optional object for strategy-specific parameters:
     - For `retry_with_context_promotion`: `{ target_tier: string }`
     - For `retry_with_error_focus`: `{ focus_fingerprints: string[] }`
     - For `retry_with_rollback`: `{ rollback_to_iteration: number }`

**Verification:**

- [ ] All schemas use snake_case per API conventions
- [ ] Schemas have JSDoc documentation
- [ ] Types exported via `z.infer`

### Task 2: Implement stall debate evaluator

**Goal:** Create a pure function that evaluates stall conditions and recommends a strategy using deterministic heuristics (no LLM needed).

**Files:** `src/iteration/__helpers/stall-debate.ts` (new)

**Steps:**

1. Create `stall-debate.ts` in `src/iteration/__helpers/`
2. Implement `evaluateStallDebate(input: StallDebateInput): StallDebateOutput`:
   - **Strategy selection heuristics:**
     - If `budget_remaining <= 1`: Always recommend `"halt"` (no room to retry)
     - If `context_tier` is below max tier AND `fingerprint_overlap >= 0.9` (same errors repeating): Recommend `"retry_with_context_promotion"` -- the executor likely needs more context to understand how to fix these errors
     - If correctable errors have a clear "most seen" subset (top 2 errors account for >60% of correctable count): Recommend `"retry_with_error_focus"` -- narrow the executor's attention to the highest-leverage errors
     - If `artifact_change_delta > 0` but `error_count_delta >= 0` (changes were made but errors increased or stayed same): Recommend `"retry_with_rollback"` -- the executor may have gone down a wrong path
     - Default fallback: `"halt"` (when no strategy shows clear promise)
   - **Confidence calculation:**
     - `1.0` for halt when budget_remaining <= 1 (deterministic)
     - `0.7` for context promotion when overlap >= 0.95 (strong signal)
     - `0.6` for error focus when top errors are clearly dominant
     - `0.5` for rollback (moderate confidence, somewhat risky)
     - `0.3` for default halt (low confidence, could go either way)
3. Implement `shouldAttemptDebate(convergenceResult: ConvergenceResult, budgetRemaining: number): boolean`:
   - Returns true only when `should_halt` is true AND `budget_remaining > 0`
   - This is the gate that determines whether the debate function runs at all
4. Add CLI entry point for manual testing:
   - `bun run src/iteration/__helpers/stall-debate.ts evaluate --input='...'`

**Verification:**

- [ ] Function is pure (no side effects, no I/O)
- [ ] All branches have clear heuristic rationale
- [ ] Default is always "halt" (conservative -- debate can only PREVENT halts, never cause them)
- [ ] No LLM calls (this is fully deterministic)

### Task 3: Integrate debate into convergence flow

**Goal:** Modify `assessConvergence` to optionally consult the stall debate before returning `should_halt: true`.

**Files:** `src/iteration/__helpers/convergence.ts`

**Steps:**

1. Add an optional `debate_enabled` parameter to `assessConvergence`:
   - Default: `false` (backward compatible)
   - When `true` and `should_halt` would be `true`: call the debate evaluator
2. Add a new optional field to ConvergenceResult schema: `debate_result` (StallDebateOutput | undefined)
3. When debate is enabled and recommends a non-halt strategy:
   - Set `should_halt` to `false` (override the stall signal)
   - Set `debate_result` to the evaluator output
   - The orchestrator reads `debate_result.recommended_strategy` and adjusts the next iteration accordingly
4. When debate is enabled but recommends halt: Keep `should_halt: true`, attach debate_result for metrics
5. Update `convergenceResultSchema` in `iteration.schemas.ts` to include the optional `debate_result` field

**Important:** The debate function is called INSIDE assessConvergence, not by the orchestrator. This keeps the integration point minimal -- the orchestrator just checks `should_halt` as before, but now it may be overridden by the debate.

**Verification:**

- [ ] Existing tests still pass (debate_enabled defaults to false)
- [ ] When debate_enabled=false, behavior is identical to current
- [ ] When debate overrides halt, should_halt is false and debate_result is populated
- [ ] ConvergenceResult schema is backward compatible (debate_result is optional)

### Task 4: Update phase-execute skill for debate awareness

**Goal:** Update the phase-execute skill's convergence check step to pass debate configuration and act on debate results.

**Files:** `src/skills/general/phase-execute.skill.ts`

**Steps:**

1. In Step 6.6.2 (Loop A Iteration Cycle), Step C (Convergence Check):
   - Read debate config from `.planning/config.json`: `iteration.stall_debate_enabled` (default: false)
   - Pass `--debate-enabled` flag to convergence CLI when config is true
   - After convergence check, inspect `debate_result` in the output
2. When debate recommends a non-halt strategy, adjust Step F (Spawn Executor):
   - For `retry_with_context_promotion`: Add context tier promotion instruction to the executor prompt (e.g., "You have been given additional project context. Previous approaches failed -- try a different angle.")
   - For `retry_with_error_focus`: Filter the error list passed to the executor to only the focus fingerprints
   - For `retry_with_rollback`: Run `bun run src/iteration/checkpoint.ts rollback --tag=...` before spawning the executor
3. Log debate decisions to WORKING.md for learning extraction
4. When metrics infrastructure (91-A) is available, record debate outcomes

**Verification:**

- [ ] Convergence check passes --debate-enabled flag when configured
- [ ] Executor prompt is adjusted per debate strategy recommendation
- [ ] Fallback behavior (debate not enabled) is unchanged

### Task 5: Write tests for stall debate

**Goal:** Comprehensive tests for the debate evaluator and integration.

**Files:** `__tests__/src/iteration/stall-debate.test.ts` (new)

**Steps:**

1. Test `shouldAttemptDebate`:
   - Returns true when should_halt=true and budget > 0
   - Returns false when should_halt=false
   - Returns false when budget_remaining=0
2. Test `evaluateStallDebate`:
   - Recommends halt when budget_remaining <= 1
   - Recommends context_promotion when fingerprint_overlap >= 0.9 and tier is below max
   - Recommends error_focus when top errors dominate
   - Recommends rollback when changes were made but errors didn't improve
   - Falls back to halt when no clear signal
3. Test convergence integration:
   - assessConvergence with debate_enabled=false returns same result as before
   - assessConvergence with debate_enabled=true and stall returns debate_result
   - debate override correctly sets should_halt=false
4. Test strategy_params:
   - Context promotion includes target_tier
   - Error focus includes focus fingerprints
   - Rollback includes target iteration number

**Verification:**

- [ ] `bun test __tests__/src/iteration/stall-debate.test.ts` passes
- [ ] Tests cover all strategy selection branches
- [ ] Tests verify backward compatibility

### Task 6: Update barrel exports and documentation

**Goal:** Export new schemas and functions, document the debate mechanism.

**Files:** `src/iteration/index.ts`, `src/iteration/__schemas/iteration.schemas.ts`

**Steps:**

1. Add stall-debate schema exports to iteration barrel
2. Add stall-debate helper exports to iteration barrel
3. Add JSDoc to all new functions with @example blocks
4. Add module-level JSDoc to stall-debate.ts explaining the debate mechanism

**Verification:**

- [ ] Barrel contains only re-exports
- [ ] All new public APIs are accessible via `~/iteration`
- [ ] JSDoc is complete

## Success Criteria

- [ ] `bun test __tests__/src/iteration/stall-debate.test.ts` passes
- [ ] Existing convergence tests still pass (backward compatible)
- [ ] `bunx --bun tsc --noEmit` passes with no new type errors
- [ ] Debate is opt-in via `iteration.stall_debate_enabled` in config.json (default: false)
- [ ] When enabled, debate can override halt decisions with alternative strategies
- [ ] Conservative default: debate can only prevent halts, never cause them
- [ ] Token cost: ~300 tokens per stall event (function call, no LLM)
- [ ] No cross-tier import violations (stays within T1 iteration domain)
