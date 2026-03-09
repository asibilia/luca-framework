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
- Procedure recall via MuninnDB: `mcp__muninn__muninn_recall(context: "procedure:* matching plan domain")`
- Expose historical harness stats in `src/iteration/__helpers/checkpoint.ts`
- Export reflection utilities from `src/planner/index.ts`

## Notes

- Depends on #7 (Scorecard) and #12 (Procedure Replay) for data
- Source agent: Intelligence Expert
- **Audit update (2026-03-08):** The Muninn memory audit directly validates the urgency of this todo. The audit's #1 critical finding is that the learning loop is OPEN at the APPLY step — recalled patterns/procedures don't feed into planning. This todo IS the planning-side fix for that gap.
- **Audit dependency:** This is a SUBSET of #95 (Close the Learning Loop). Implementing #95 Phase A (pattern application in lu-planner) would deliver most of this todo's value. Consider merging into #95 or implementing as Phase A.1 of #95.
- **Audit finding:** lu-planner currently receives NO MuninnDB session context when spawned (#92). Reflective meta-cognition requires the planner to have access to recalled patterns — #92 (inject memory into sub-agents) is a prerequisite.
- **Path update:** `src/memory/__helpers/procedure-recall.ts` no longer exists. Procedure recall is via MuninnDB: `mcp__muninn__muninn_recall(context: "procedures for {domain}")`
