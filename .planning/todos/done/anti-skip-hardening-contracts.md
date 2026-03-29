---
title: "Hardening: Agent behavioral contracts + formal properties (optional)"
area: workflow
created: 2026-03-28
source: conversation
---

## Context

The Agent Behavioral Contracts paper (Feb 2026) proved that without contracts, multi-step compliance drops to 36.6% over 100 steps. With contracts + recovery (r=0.95): 95% compliance. This is the optional Phase 4 hardening step for critical workflows.

## Task

### Part A: Behavioral Contracts

Define hard invariants for critical workflow steps:

- "Step N cannot be marked complete unless its handler was called and returned success"
- "No git push without LEARNED transition"
- "No milestone archive without shadow debt scan"

Implement as `src/workflow/__schemas/contracts/` with:

- Hard invariants (must hold at every step)
- Soft invariants (allow transient violations with bounded recovery)
- Recovery mechanisms (re-invoke skipped steps)
- Drift detection metrics

### Part B: LTL Formal Properties (Optional)

For the most critical workflow paths, define Linear Temporal Logic properties:

```
G(push_started -> learned_completed)
G(milestone_archived -> shadow_scanned)
```

Check at runtime against the event log.

## Notes

- Research: `docs/research/anti-step-skipping/04-novel-approaches.md` (Sections 4, 8)
- Only implement if layers 0-3 prove insufficient
- Agent Behavioral Contracts: arxiv.org/abs/2602.22302
- Policies on Paths: arxiv.org/abs/2603.16586
- Estimated effort: 1-2 weeks
- This is the "if we still have problems" escalation path
