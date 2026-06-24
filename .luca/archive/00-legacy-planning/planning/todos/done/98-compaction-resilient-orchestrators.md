---
title: Make orchestrators compaction-resilient with agent result journaling
area: workflow
created: 2026-03-09T21:30:00Z
source: conversation
priority: P0
---

## Context

During long sessions, context compaction loses references to spawned agents (executor, planner, verifier). The orchestrator (phase-execute, lu) parses agent result envelopes from conversation text but never persists them to disk. When compaction sweeps those messages, the orchestrator loses track of what completed.

Investigation confirmed three gaps:

1. Agent result envelopes are conversation-only (code reviewers, lu-cognition, lu-router)
2. Context monitor only fires on Stop event, can't warn mid-session
3. No wave-level checkpointing in phase-execute

## Task

Implement three changes to `src/skills/general/phase-execute.skill.ts`:

### Change 1: Wave Progress Journal

Add instructions for orchestrator to write `.planning/phases/NN/.wave-progress.jsonl` after each wave/review:

```jsonl
{"wave":1,"agent":"lu-executor","plan":"PLAN-04-01","status":"success","summary":"...","ts":"..."}
{"wave":"review","agent":"dx-advocate","status":"success","findings":3,"ts":"..."}
{"wave":"harness","status":"passed","ts":"..."}
```

If compaction happens mid-phase, orchestrator re-reads this file to know what already completed.

### Change 2: Review Report Persistence

Add instructions to write `.planning/phases/NN/REVIEW.md` with aggregated reviewer findings after code review step. Currently all 5 reviewers' YAML findings evaporate after consumption.

### Change 3: Context Budget Check Between Waves

Add instructions for orchestrator to check transcript size between waves. If HIGH/CRITICAL:

1. Write wave progress journal
2. Write `.continue-here.md` with current state
3. Tell user to start fresh session

Converts compaction from a crash into a graceful handoff.

## Notes

- All changes are prompt-level modifications to skill definitions (no infrastructure code)
- Agents that already write to disk: lu-executor (SUMMARY.md), lu-verifier (VERIFICATION.md), lu-planner (PLAN.md)
- Agents that don't persist output: all 5 code reviewers, lu-cognition, lu-router
- session-resume should also be updated to check for `.wave-progress.jsonl` during recovery
- The `.wave-progress.jsonl` approach mirrors session-ledger.jsonl (append-only, simple)
