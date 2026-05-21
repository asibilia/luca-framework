# PLAN-1 Summary: Schema Alignment -- Recall Scoring 6-to-7 Signal Drift

**Phase:** 143
**Plan:** 1
**Wave:** 1
**Status:** COMPLETE

## Objective

Close the schema drift between the recall scoring TypeScript schemas (6 signals) and the lu-cognition agent spec (7 signals with `feedback_score`). After this plan, the TS schema, the scorer implementation, and the agent spec all agree on exactly 7 signals with weights summing to 1.0.

## Tasks Completed

### Task 1: Add feedback_score to schemas
**Commit:** `373a8175`
**Files:** `src/agents/__schemas/recall-scoring.schemas.ts`

- Added `feedback_score` field to `RecallScoringWeightsSchema` with default `0.075`
- Changed `milestone_proximity` default from `0.3` to `0.225` (redistributed weight)
- Added `feedback_score` field to `ScoreBreakdownSchema`
- Updated module-level JSDoc to mention all 7 signals

### Task 2: Add feedback_score computation to scorer
**Commit:** `0f0f21d1`
**Files:** `src/agents/__helpers/embedding-recall.ts`

- Added `computeFeedbackScore()` function (proxy via confidence: High=0.8, Medium/none=0.5, Low=0.2)
- Added `feedback_score` to the breakdown computation in `scoreRecallResults()`
- Added weighted `feedback_score` term to composite score calculation
- Updated module-level JSDoc to mention all 7 signals

### Task 3: Verify lu-cognition spec matches
**Files:** `src/agents/general/lu-cognition.agent.ts`

- Verified: lu-cognition spec already documents all 7 signals with correct weights
- Weights in spec: semantic_similarity=0.25, tag_overlap=0.15, milestone_proximity=0.225, agent_match=0.15, confidence=0.075, recency=0.075, feedback_score=0.075
- Sum: 1.0 -- no discrepancy found, no edit needed

## Weight Distribution (Final)

| Signal | Weight |
|--------|--------|
| semantic_similarity | 0.25 |
| tag_overlap | 0.15 |
| milestone_proximity | 0.225 |
| agent_match | 0.15 |
| confidence | 0.075 |
| recency | 0.075 |
| feedback_score | 0.075 |
| **Total** | **1.0** |

## Deviations

None. All tasks executed as planned.

## Verification

- `bunx --bun tsc --noEmit` passes with zero errors after all changes
- All three sources of truth (schema, scorer, agent spec) now agree on 7 signals
