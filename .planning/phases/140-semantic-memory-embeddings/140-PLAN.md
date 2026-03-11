# Phase 140: Semantic Memory Embeddings

## Goal

Add embedding-aware scoring to lu-cognition recall, first checking if MuninnDB supports native similarity, then adding cosine similarity as a scoring factor with rebalanced weights and graceful fallback to lexical recall.

## Context

Current recall in lu-cognition uses tag overlap, milestone proximity, confidence, and recency. Lexical matching misses semantic connections. MuninnDB may already support semantic similarity natively via `mcp__muninn__muninn_similar_entities`. The recall scoring logic lives in `src/agents/general/lu-cognition.agent.ts`.

## Tasks

### Task 1: Document MuninnDB native similarity capabilities

**File:** `src/agents/__helpers/embedding-recall.ts`

Create helper that:

1. Wraps `mcp__muninn__muninn_similar_entities` for entity-level similarity
2. Wraps `mcp__muninn__muninn_recall` with `mode: "semantic"` for engram-level similarity
3. Returns similarity scores normalized to 0.0-1.0
4. Gracefully returns null if similarity not available

### Task 2: Add embedding-aware scoring schema

**File:** `src/agents/__schemas/recall-scoring.schemas.ts` (new or extend existing)

Create:

- `RecallScoringWeightsSchema`: `semantic_similarity` (0.25), `tag_overlap` (0.15), `milestone_proximity` (0.30), `agent_match` (0.15), `confidence` (0.075), `recency` (0.075)
- `ScoredRecallResultSchema`: extends base recall with `composite_score`, `score_breakdown`

### Task 3: Implement composite scoring function

**File:** `src/agents/__helpers/embedding-recall.ts`

Create `scoreRecallResults(results, context, weights): ScoredRecallResult[]` that:

1. Computes semantic similarity using MuninnDB native mode
2. Computes tag overlap between recall result tags and task context tags
3. Applies milestone proximity decay
4. Applies agent match bonus
5. Combines scores using configured weights
6. Falls back to lexical-only scoring if semantic unavailable

### Task 4: Wire into lu-cognition recall section

**File:** `src/agents/general/lu-cognition.agent.ts`

Update the recall logic to:

1. Use `mode: "semantic"` for MuninnDB recall
2. Pass results through `scoreRecallResults()` for composite scoring
3. Sort by composite score descending
4. Respect existing complexity-gated depth limits

### Task 5: Update barrel exports

**File:** `src/agents/index.ts`

Export new schemas and helpers.

## Verification

- [ ] `bunx --bun tsc --noEmit` passes
- [ ] Scoring weights sum to 1.0
- [ ] Composite scorer handles missing semantic scores (fallback)
- [ ] lu-cognition recall section references new scoring
