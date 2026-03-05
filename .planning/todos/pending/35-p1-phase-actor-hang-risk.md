---
title: "P1: Add timeout/auto-transition to phase actor idle state"
area: agentic
created: 2026-03-04
source: repo-review audit (agentic-reviewer)
priority: P1
---

## Context

The phase actor starts in `idle` state and waits for external `PLAN_WAVE` events to begin wave execution. If the parent workflow machine fails to send the initial event, the phase actor hangs indefinitely with no timeout or error signal.

## Task

1. Review `packages/luca-framework/src/state/actors/phase-actor.ts:166-172`
2. Add one of:
   - Automatic `always` transition when waves exist in context
   - Timeout guard that escalates to `paused` after N seconds
   - Entry action that self-sends PLAN_WAVE when waves > 0
3. Add stall detection test

## Notes

- Related: WARN-4 from agentic review — no error recovery policy in verify loop either
- The parent machine must manually send PLAN_WAVE events currently
- Consider adding max retry limit to the verify → execute → verify loop too
