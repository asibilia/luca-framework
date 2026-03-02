---
title: "Semantic Memory Embeddings with Vector Recall"
area: framework/memory
created: 2026-03-01
source: expert-panel-research
tier: 4
complexity: COMPLEX
moat: Medium
---

## Context

Current memory recall uses tag overlap, milestone proximity, confidence, and recency. Lexical matching misses semantic connections (e.g., "Bun.spawn timeout" not recalled when working on "child process hangs").

## Task

Add optional embedding layer to memory pipeline. Compute lightweight embedding when entries written to MEMORY.md, store in sidecar `.planning/memory-vectors.json`. During recall, compute embedding of current task and add cosine similarity as 4th scoring factor in scoreMilestoneRecall.

Rebalance weights: semantic_similarity 25%, tag_overlap 20%, milestone_proximity 30%, confidence 12.5%, recency 12.5%. Gracefully degradable — falls back to lexical recall if embeddings unavailable.

**Implementation:**

- Add optional embedding field to `src/memory/__schemas/memory.schemas.ts`
- Add calculateSemanticSimilarity, rebalance to `src/memory/__helpers/milestone-recall.ts`
- New: `src/memory/__helpers/embedding.ts` — embedding computation and storage
- Async embedding on write, vector recall on read in `src/memory/__helpers/bridge.ts`

## Notes

- Source agent: Intelligence Expert
