---
title: "v4: Divergent mode advisory nudge"
area: workflow
created: 2026-03-10
source: docs/brainstorm/3.final-workflow.md
priority: P2
complexity: SIMPLE
milestone: v4.0.0
---

## Context

After sustained convergent (spec-driven) work, developers benefit from divergent thinking — architecture sketching, research, product exploration. Luca nudges gently at milestone boundaries. No enforcement.

Design decision D4: trigger at 8+ consecutive milestones (not 3).

Spec: `docs/brainstorm/3.final-workflow.md` (Divergent Mode)

## Task

### 1. Milestone Counter

Track consecutive milestones without divergent mode in MuninnDB:

- Increment `metric:convergent-streak` at each milestone completion
- Reset to 0 when developer opts into divergent mode

### 2. Advisory Nudge

At milestone boundary (in `src/skills/general/milestone-complete.skill.ts`):

- If streak >= 8: "You've completed N milestones without a break. Consider divergent mode."
- If developer opts in:
  - No acceptance criteria
  - Encouraged: architecture sketching, research reading, product exploration, shaping future work
  - Min duration: 1 calendar day (COMPLEX), 2 calendar days (CRITICAL)
  - Cognitively distinct from convergent spec-driven work
- If developer opts out: tracked in process metrics

### 3. State Machine

Add optional `cooldown` state: `complete` → `cooldown` → `idle` (skippable)

### 4. Graduation Criteria

- If opt-in rate <10% over 20 milestones → drop the nudge
- Track via `metric:divergent-optin-rate` engram

## Notes

- No enforcement — honest advisory only
- Complexity-gated: COMPLEX+ only
- Zero token cost (simple counter check at milestone boundary)
