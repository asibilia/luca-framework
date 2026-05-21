---
phase: 143
plan: 1
type: improvement
autonomous: true
wave: 1
depends_on: []
---

# Phase 143 Plan 1: Schema Alignment — Recall Scoring 6-to-7 Signal Drift

## Objective

Close the schema drift between the recall scoring TypeScript schemas (6 signals) and the lu-cognition agent spec (7 signals with `feedback_score`). After this plan, the TS schema, the scorer implementation, and the agent spec all agree on exactly 7 signals with weights summing to 1.0.

> Audit refs: Integration Gap #2, MEDIUM #7

## Context

@src/agents/**schemas/recall-scoring.schemas.ts
@src/agents/**helpers/embedding-recall.ts
@src/agents/general/lu-cognition.agent.ts

**Current state of drift:**

- `RecallScoringWeightsSchema` has 6 fields. `milestone_proximity` defaults to 0.30. No `feedback_score`. Sum = 1.0.
- `ScoreBreakdownSchema` has 6 fields. No `feedback_score`.
- `scoreRecallResults()` in embedding-recall.ts computes 6 signals and produces a 6-field breakdown.
- lu-cognition.agent.ts documents 7 signals with `milestone_proximity` = 0.225 and `feedback_score` = 0.075. Sum = 1.0.

**Target state:**

- All three locations agree on 7 signals: semantic_similarity (0.25), tag_overlap (0.15), milestone_proximity (0.225), agent_match (0.15), confidence (0.075), recency (0.075), feedback_score (0.075). Sum = 1.0.

## Tasks

### 1. Add feedback_score to RecallScoringWeightsSchema and ScoreBreakdownSchema

**Type:** auto
**TDD:** false
**Depends on:** none

In `src/agents/__schemas/recall-scoring.schemas.ts`:

1. Add `feedback_score` field to `RecallScoringWeightsSchema` (after `recency`):

   ```
   /** Weight for feedback-derived score proxy via confidence level. */
   feedback_score: z.number().min(0).max(1).default(0.075),
   ```

2. Change `milestone_proximity` default from `0.3` to `0.225` (line 32).

3. Add `feedback_score` field to `ScoreBreakdownSchema` (after `recency`, line 56):

   ```
   feedback_score: z.number().min(0).max(1),
   ```

4. Update the module-level JSDoc comment (lines 9-11) to mention all 7 signals including `feedback_score`.

**Files to create/edit:**

- `src/agents/__schemas/recall-scoring.schemas.ts`

**Verification:**

- `RecallScoringWeightsSchema.parse({})` produces 7 fields with weights summing to 1.0
- `ScoreBreakdownSchema` has 7 fields
- `bunx --bun tsc --noEmit` passes

### 2. Add feedback_score computation to scoreRecallResults in embedding-recall.ts

**Type:** auto
**TDD:** false
**Depends on:** 1

In `src/agents/__helpers/embedding-recall.ts`:

1. Add a new `computeFeedbackScore()` function (after `extractConfidenceScore`, before the closing of the file). This function implements the proxy mapping documented in lu-cognition:
   - Engrams with "Confidence: High" -> 0.8
   - Engrams with "Confidence: Medium" or no marker -> 0.5
   - Engrams with "Confidence: Low" -> 0.2

   ```typescript
   /**
    * Compute feedback score proxy via engram confidence level.
    *
    * Uses engram confidence as a proxy for accumulated feedback data.
    * This works because lu-learner (via feedback-based confidence evolution)
    * promotes/demotes engram confidence based on actual `muninn_feedback` results.
    *
    * Weight is deliberately small (0.075) to avoid circular amplification
    * with MuninnDB's internal SGD-based scoring.
    *
    * @param content - Engram content text
    * @returns Feedback score proxy (0.2-0.8)
    */
   export function computeFeedbackScore(content: string): number {
     if (!content) return 0.5;
     const lower = content.toLowerCase();
     if (
       lower.includes("confidence: high") ||
       lower.includes("confidence:high")
     )
       return 0.8;
     if (lower.includes("confidence: low") || lower.includes("confidence:low"))
       return 0.2;
     return 0.5; // Medium or no marker = neutral
   }
   ```

2. In `scoreRecallResults()`, add `feedback_score` to the breakdown computation (after `recency` on line 274):

   ```
   feedback_score: computeFeedbackScore(result.content),
   ```

3. Add the weighted `feedback_score` term to the composite score calculation (after line 283):

   ```
   breakdown.feedback_score * resolvedWeights.feedback_score;
   ```

4. Update the module-level JSDoc (lines 7-8) to mention all 7 signals including `feedback_score`.

**Files to create/edit:**

- `src/agents/__helpers/embedding-recall.ts`

**Verification:**

- `scoreRecallResults()` returns results with 7-field `score_breakdown` including `feedback_score`
- Composite score includes the weighted feedback_score term
- `bunx --bun tsc --noEmit` passes

### 3. Verify lu-cognition spec matches schema (no code change expected)

**Type:** auto
**TDD:** false
**Depends on:** 1, 2

In `src/agents/general/lu-cognition.agent.ts`, verify the documented weights match the updated schema:

- semantic_similarity: 0.25
- tag_overlap: 0.15
- milestone_proximity: 0.225
- agent_match: 0.15
- confidence: 0.075
- recency: 0.075
- feedback_score: 0.075
- Sum: 1.0

The lu-cognition spec already documents these values correctly (it was the source of truth for the 7-signal model). No changes should be needed unless a discrepancy is found during verification.

**Files to create/edit:**

- `src/agents/general/lu-cognition.agent.ts` (read-only verification; edit only if discrepancy found)

**Verification:**

- All three files (schema, scorer, agent spec) agree on 7 signals and weights
- `bunx --bun tsc --noEmit` passes for the entire project

## Verification

1. TypeScript compilation: `bunx --bun tsc --noEmit` passes
2. `RecallScoringWeightsSchema.parse({})` returns 7 fields whose values sum to 1.0
3. `ScoreBreakdownSchema` defines exactly 7 fields (semantic_similarity, tag_overlap, milestone_proximity, agent_match, confidence, recency, feedback_score)
4. `scoreRecallResults()` composite score formula includes all 7 weighted signals
5. lu-cognition agent spec documents the same 7 signals with matching weights

## Success Criteria

- Zero schema drift between recall-scoring.schemas.ts, embedding-recall.ts, and lu-cognition.agent.ts
- All 7 signals documented, implemented, and weighted identically across all three files
- Weights sum to exactly 1.0
- No regression in existing recall scoring behavior (6 original signals retain their logic)

## Output Specification

- Modified: `src/agents/__schemas/recall-scoring.schemas.ts` (feedback_score added, milestone_proximity weight adjusted)
- Modified: `src/agents/__helpers/embedding-recall.ts` (computeFeedbackScore added, composite score updated)
- Potentially unchanged: `src/agents/general/lu-cognition.agent.ts` (verification only)
