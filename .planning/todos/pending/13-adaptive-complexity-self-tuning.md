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

Promotion unlocks: more harness iterations, code review agents, potential model upgrade (per #1 Role-Based Model Routing). Store promotion event as MEMORY.md entry for future calibration.

**Implementation:**

- Add ComplexityReassessmentSchema to `src/complexity/__schemas/complexity.schemas.ts`
- Add signal thresholds in `src/complexity/__helpers/defaults.ts`
- Trigger reassessment at wave boundaries in `src/iteration/__helpers/checkpoint.ts`
- Feed back actual costs in `src/planner/__helpers/cost-model.ts`
- Persist reassessment events in `src/memory/__helpers/bridge.ts`

## Notes

- Depends on #1 (Model Routing) for model upgrades on promotion
- Source agent: Intelligence Expert
