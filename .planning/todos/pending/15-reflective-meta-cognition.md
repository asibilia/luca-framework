---
title: "Reflective Meta-Cognition for Plan Quality"
area: framework/planner
created: 2026-03-01
source: expert-panel-research
tier: 3
complexity: COMPLEX
moat: Strong
---

## Context

Procedure system captures step sequences but doesn't feed them back into planning. Plans with historically problematic patterns (e.g., touching auth + DB in same wave) aren't flagged.

## Task

Reflective layer between planner and plan-checker:

1. Compare plan structure (task count, file count, dependency depth) against historical execution data from checkpoints
2. Flag plan patterns that historically correlated with high harness iterations or convergence failures
3. Recall relevant procedures and suggest incorporation into plan
4. Generate "plan confidence score" — how much maps to proven patterns vs unknown territory
5. Score feeds into complexity gate for planVerificationIterations adjustment

**Implementation:**

- New: `src/planner/__helpers/plan-reflection.ts` — meta-cognitive analysis
- Add planConfidenceSchema to `src/planner/__schemas/planner.schemas.ts`
- Add plan-structure matching to `src/memory/__helpers/procedure-recall.ts`
- Expose historical harness stats in `src/iteration/__helpers/checkpoint.ts`
- Export reflection utilities from `src/planner/index.ts`

## Notes

- Depends on #7 (Scorecard) and #12 (Procedure Replay) for data
- Source agent: Intelligence Expert
