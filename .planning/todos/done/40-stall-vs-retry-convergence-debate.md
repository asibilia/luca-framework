---
title: Add stall-vs-retry debate for convergence loop termination
area: framework/iteration
created: 2026-03-02
source: conversation — debate-pattern-review team research (flow-researcher)
---

## Context

Flow-researcher identified that when the iteration system detects 2+ consecutive stale iterations, it halts — but this may be premature. A lightweight debate between "retry with different strategy" vs "halt and report" could eliminate ~10% of premature halts.

## Task

Before halting on convergence failure, run a quick debate:

1. **Trigger:** 2+ consecutive stale iterations detected (convergence stall)
2. **Debate strategies (2-3 options):**
   - Retry with promoted context tier
   - Retry with different executor strategy
   - Halt and report (current behavior)
3. **Resolution:** Take most optimistic viable strategy (avoid premature halt)

### Token cost

- +300 tokens per stall event (very cheap)
- Stall events are rare (~1-2 per COMPLEX phase)
- No complexity gate needed — cost is negligible

## Notes

- Flow-researcher flagged this as "Quick Win, 3-4h" implementation
- This is a lightweight debate — no agent teams needed, could be prompt-based
- Current system: `src/iteration/__helpers/` and `src/iteration/__schemas/`
- Requires ground truth tracking to measure effectiveness (see todo #41)
