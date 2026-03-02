---
title: "Semantic Convergence Detection"
area: framework/iteration
created: 2026-03-01
source: expert-panel-research
tier: 1
complexity: MODERATE
moat: Strong
---

## Context

Current convergence detection uses SHA-256 fingerprints. Semantically identical errors with different wording produce different fingerprints and are missed.

## Task

Add cosine-similarity signal to convergence detector. 2-of-3 stale rule becomes 2-of-4 with semantic overlap as the 4th signal. Gate by complexity level (COMPLEX/CRITICAL only) to avoid overhead.

**Implementation:**

- Add semantic_overlap to signals in `src/iteration/__schemas/iteration.schemas.ts`
- Add embedding-based similarity in `src/iteration/__helpers/convergence.ts`
- Gate by complexity in `src/complexity/__schemas/complexity.schemas.ts`
- New: `src/shared/__helpers/embeddings.ts` — embedding client wrapper

## Notes

- No competitor has convergence detection at all — deepens Luca's unique iteration moat
- Source agent: Competitive Edge Expert
