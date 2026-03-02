# Plan 83-A: Real Token Accounting & Role-Based Model Routing

---

id: 83-A
title: Real tokenizer integration, role-based model routing with quality-zone-aware upgrades
phase: 83
wave: 1
tdd: false
gap_closure: false

---

## Objective

Replace the chars/4 heuristic token counting with a real tokenizer (js-tiktoken), add role-based model routing using agent purpose fields, and connect quality zone detection to model selection so more capable models are used when context quality degrades.

## Context

- Token estimator: `src/memory/__helpers/token-estimator.ts` — `estimateTokens()` uses `CHARS_PER_TOKEN = 4`
- 13 call sites across 5 files, all import `estimateTokens(text: string): number` — signature must NOT change
- Model routing: `src/agents/__helpers/resolve-model.ts` — 5-step priority chain
- Agent schemas: `src/agents/__schemas/agent.schemas.ts` — has `purpose` field (PurposeCategory) and `model_tier`
- Quality zones: `src/planner/__helpers/scheduler.ts` and `src/memory/__helpers/context-monitor.ts`
- Complexity schemas: `src/complexity/__schemas/complexity.schemas.ts` — ModelIdSchema, ModelTierSchema
- Budget: `src/iteration/__helpers/budget.ts` — uses iteration count as proxy for token cost

## Tasks

### Task 1: Add js-tiktoken dependency

**Goal:** Install the pure-JS tokenizer library.

**Steps:**

1. Run `bun add js-tiktoken` in the root workspace
2. Verify import works: `import { encodingForModel } from "js-tiktoken"`

**Verification:** `bun test` passes, import resolves

### Task 2: Replace token estimator heuristic with real tokenizer

**Goal:** Replace chars/4 with real BPE tokenization behind the existing API.

**File:** `src/memory/__helpers/token-estimator.ts`

**Steps:**

1. Import `encodingForModel` from `js-tiktoken`
2. Create lazy singleton encoder using `cl100k_base` encoding
3. Replace `estimateTokens()` implementation: `encoder.encode(text).length`
4. Keep heuristic as `estimateTokensHeuristic()` fallback export
5. Add try/catch in `estimateTokens()` to fall back to heuristic if encoder fails
6. Update the CHARS_PER_TOKEN constant comment as deprecated

**Verification:** All 13 call sites work without modification. `estimateTokens("hello world")` returns a real token count (not just `ceil(11/4) = 3`).

### Task 3: Update token estimator tests

**File:** `__tests__/src/memory/token-estimator.test.ts`

**Steps:**

1. Replace exact chars/4 assertions with range-based assertions (real tokenizer returns different counts)
2. Add test for `estimateTokensHeuristic()` fallback
3. Add test confirming `estimateTokens` returns positive integers for various inputs
4. Add test for empty string edge case

**Verification:** `bun test __tests__/src/memory/token-estimator.test.ts` passes

### Task 4: Add role-model mapping to complexity schemas

**File:** `src/complexity/__schemas/complexity.schemas.ts`

**Steps:**

1. Add `ROLE_MODEL_DEFAULTS` constant mapping PurposeCategory to ModelId:
   - researcher → "opus", planner → "sonnet", executor → "sonnet"
   - verifier → "sonnet", reviewer → "opus", synthesizer → "sonnet"
   - auditor → "opus", general → "sonnet"
2. Add `ZoneModelAdjustmentSchema` defining upgrade rules per quality zone:
   - peak/good → no change, degrading → upgrade to "sonnet", stop → upgrade to "opus"
3. Add `ZONE_MODEL_ADJUSTMENTS` constant
4. Export all from barrel

**Verification:** Types compile, schemas parse correctly

### Task 5: Extend model routing with role-based and zone-aware resolution

**File:** `src/agents/__helpers/resolve-model.ts`

**Steps:**

1. Import `ROLE_MODEL_DEFAULTS` and `ZONE_MODEL_ADJUSTMENTS` from complexity schemas
2. Add role-based step to `resolveModel()` priority chain (between tier and gate default)
3. Add new `resolveModelWithZone()` function accepting optional `qualityZone` parameter
4. When zone is "degrading" or "stop", apply zone adjustment (upgrade, never downgrade)
5. Add `ModelRoutingDecision` type with `model`, `reason`, and `factors` fields
6. Add `resolveModelWithDecision()` that returns structured decision for observability
7. Export new functions from agents barrel `src/agents/index.ts`

**Priority chain (updated):**

1. Agent's complexity_overrides[level]
2. Agent's model_routing.default_model
3. Agent's model_tier mapped to ModelId
4. **NEW: Agent's purpose mapped via ROLE_MODEL_DEFAULTS**
5. Complexity gate's default_model
6. "sonnet" (universal fallback)

**Verification:** All existing resolve-model tests pass. New tests for role-based and zone-aware routing pass.

### Task 6: Update resolve-model tests

**File:** `__tests__/src/agents/__helpers/resolve-model.test.ts`

**Steps:**

1. Add test section for purpose-based resolution (all 8 purpose categories)
2. Add test that purpose is lower priority than explicit model_tier
3. Add tests for `resolveModelWithZone()`:
   - peak/good zones don't change model
   - degrading zone upgrades haiku to sonnet
   - stop zone upgrades sonnet to opus
   - explicit opus is never downgraded
4. Add tests for `resolveModelWithDecision()` structured output

**Verification:** `bun test __tests__/src/agents/__helpers/resolve-model.test.ts` passes

### Task 7: Add token-aware budget assessment

**File:** `src/iteration/__helpers/budget.ts`

**Steps:**

1. Add optional `tokenBudget` and `tokenConsumed` fields to budget state schema
2. Add `assessBudgetWithTokens()` function using dual-signal (iterations + tokens)
3. Update `shouldStartIteration()` to accept optional token context
4. Keep existing `assessBudget()` unchanged for backward compatibility

**File:** `src/iteration/__schemas/iteration.schemas.ts`

- Add token fields to budget state schema

**Verification:** Existing budget tests pass. New token-aware budget tests pass.

### Task 8: Expose quality zone from context monitor

**File:** `src/memory/__helpers/context-monitor.ts`

**Steps:**

1. Add `getCurrentZone()` export that returns the current quality zone
2. Add `estimation_method` field to context usage result
3. Ensure context monitor budget is configurable (accept from config)

**Verification:** Context monitor tests pass with updated assertions.

## Success Criteria

- [ ] `estimateTokens()` uses real tokenizer (js-tiktoken cl100k_base), falls back to heuristic
- [ ] All 13 call sites work without modification (API signature preserved)
- [ ] `resolveModel()` respects agent purpose for role-based routing
- [ ] `resolveModelWithZone()` upgrades model when quality degrades
- [ ] `ModelRoutingDecision` provides structured audit trail
- [ ] Budget system accepts optional token counts
- [ ] All existing tests pass, new tests cover added functionality
- [ ] No breaking changes to any exported API
