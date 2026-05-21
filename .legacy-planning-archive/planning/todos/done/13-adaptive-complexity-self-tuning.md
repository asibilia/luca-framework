---
title: "Adaptive Complexity Self-Tuning"
area: framework/complexity
created: 2026-03-01
source: expert-panel-research
tier: 3
complexity: COMPLEX
moat: Strong
---

## Context

Complexity is classified once at task start and never reassessed. If actuals exceed the classified level (more files touched, more harness iterations), the task is under-resourced.

## Task

Mid-execution complexity reassessment. After each wave completes, compare actual signals (files touched, harness iterations consumed, convergence status, error classification distribution) against expected profile from COMPLEXITY_CLASSIFICATIONS. If actuals exceed thresholds, auto-promote complexity by one tier.

Promotion unlocks: more harness iterations, code review agents, potential model upgrade (per #1 Role-Based Model Routing). Store promotion event in MuninnDB for future calibration.

**Implementation:**

- Add ComplexityReassessmentSchema to `src/complexity/__schemas/complexity.schemas.ts`
- Add signal thresholds in `src/complexity/__helpers/defaults.ts`
- Trigger reassessment at wave boundaries in `src/iteration/__helpers/checkpoint.ts`
- Feed back actual costs in `src/planner/__helpers/cost-model.ts`
- Persist reassessment events via `mcp__muninn__muninn_remember()` (MuninnDB replaced file-based memory)

## Notes

- Depends on #1 (Model Routing) for model upgrades on promotion
- Source agent: Intelligence Expert
- **Audit update (2026-03-08):** Memory has migrated from MEMORY.md to MuninnDB MCP. `src/memory/__helpers/bridge.ts` no longer exists. Persistence should use `mcp__muninn__muninn_remember(concept: "decision:complexity-promotion-{phase}", content: "...")`.
- **Audit synergy:** Complexity promotion directly affects recall depth (#89) — if complexity is promoted mid-execution, recall depth should also increase. This creates a feedback loop between complexity self-tuning and memory efficiency.
- **Audit synergy:** Promotion events should feed into the Apply-Measure-Refine cycle (#95) — track whether complexity promotions correlated with better outcomes.
