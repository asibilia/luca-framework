---
title: "Semantic Memory Embeddings with Vector Recall"
area: framework/memory
created: 2026-03-01
source: expert-panel-research
tier: 4
complexity: COMPLEX
moat: Medium
priority: P2
---

## Context

Current memory recall uses tag overlap, milestone proximity, confidence, and recency. Lexical matching misses semantic connections (e.g., "Bun.spawn timeout" not recalled when working on "child process hangs").

**Updated (2026-03-08 Muninn Memory Audit):** Memory has migrated from MEMORY.md to MuninnDB MCP. File paths below are OUTDATED — `src/memory/` no longer exists. The recall scoring logic now lives in `src/agents/general/lu-cognition.agent.ts` (agent-aware scoring with tag filtering, milestone proximity weighting, and tier-scaled entry limits). MuninnDB may already support semantic similarity natively — check `mcp__muninn__muninn_recall` capabilities before building a custom embedding layer.

The audit confirmed ~40% of recalled data is unused, partly because lexical recall surfaces irrelevant entries. Semantic embeddings would directly reduce this noise.

## Task

Add optional embedding layer to MuninnDB recall pipeline. Target: improve recall precision so agents get more relevant entries per token spent.

1. Check if MuninnDB natively supports embedding-based recall (may already exist — see `mcp__muninn__muninn_similar_entities`)
2. If not native: compute lightweight embedding when entries written via `mcp__muninn__muninn_remember`, store as entity metadata
3. During recall in lu-cognition, add cosine similarity as additional scoring factor alongside existing agent-aware scoring
4. Rebalance weights: semantic_similarity 25%, tag_overlap 15%, milestone_proximity 30%, agent_match 15%, confidence 7.5%, recency 7.5%
5. Gracefully degradable — falls back to lexical recall if embeddings unavailable

**Implementation (updated paths):**

- Modify `src/agents/general/lu-cognition.agent.ts` — add embedding-aware scoring to recall logic
- Check MuninnDB API for native embedding support (`mcp__muninn__muninn_similar_entities`)
- If custom needed: add embedding computation helper to `src/agents/__helpers/` or `src/shared/__helpers/`

## Notes

- Source agent: Intelligence Expert
- **Audit dependency:** Should implement AFTER #89 (complexity-gated depth) and #91 (milestone-scoped prioritization) — those are quick wins that reduce recall noise without embeddings
- **Audit synergy:** #95 (close learning loop) benefits from better recall precision — more relevant patterns recalled = higher APPLY success rate
- Memory system migrated from file-based (MEMORY.md) to MuninnDB MCP — old file paths in this todo are stale
