---
title: "Cross-Session Procedure Replay Engine"
area: framework/memory
created: 2026-03-01
source: expert-panel-research
tier: 3
complexity: COMPLEX
moat: Strong
---

## Context

HEADLINE FEATURE: First framework where AI provably improves at your specific project over time. No competitor has learning-to-execution feedback loops.

## Task

Auto-replay high-confidence procedures as pre-plans. When procedure score exceeds configurable threshold (e.g., 0.7), phase-execute injects it as a pre-plan that lu-executor follows. Harness success/failure automatically updates execution_count and success_rate via updateExecutionStats(), closing the learning loop.

**Implementation:**

- Enhance scoring threshold in `src/memory/__helpers/procedure-recall.ts`
- Auto-update stats in `src/memory/__helpers/procedure-lifecycle.ts`
- New: `src/memory/__helpers/procedure-replay.ts` — step-to-plan conversion
- Inject pre-plan in `src/skills/general/phase-execute.skill.ts`
- Add replay result schema to `src/memory/__schemas/memory.schemas.ts`

## Notes

- Depends on #7 (Agent Effectiveness Scorecard) for data
- Source agent: Competitive Edge Expert
