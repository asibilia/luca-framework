---
title: "P1: Define missing shouldRunDiscussion guard in XState machine"
area: agentic
created: 2026-03-04
source: repo-review audit (agentic-reviewer)
priority: P1
---

## Context

The XState v5 workflow machine references a `shouldRunDiscussion` guard in the `routing` state (line 293-303 of machine.ts), but the guard is never defined in the `guards` object. This means complexity gating for the discussion phase is not mechanically enforced.

## Task

1. Add `shouldRunDiscussion` guard to `packages/luca-framework/src/state/machine.ts`
2. Guard should check complexity level: `['MODERATE', 'COMPLEX', 'CRITICAL'].includes(context.complexity)`
3. Verify all other guard references in the machine have corresponding definitions
4. Add test for guard behavior at each complexity level

## Notes

- Without the guard, AI agents can send ROUTE_COMPLETE events that cause undefined behavior
- Complexity gating matrix specifies "Skip" for TRIVIAL/SIMPLE discussion
- This should be a quick fix but has high correctness impact
