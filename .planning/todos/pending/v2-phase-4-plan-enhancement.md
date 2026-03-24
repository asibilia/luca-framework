---
title: "v2 Phase 4: Plan Enhancement — research refs + plan review loop"
area: skills
created: 2026-03-23
source: docs/workflow-system/v2/06-implementation-plan/phased-rollout.md
---

## Context

Enhance the planner to reference graduated research engrams in PLAN.md tasks, and add a plan review loop using existing reviewer agents (code-architect, dx-advocate, security-auditor) in cold isolation.

## Task

### New Files (1)

- `src/skills/general/phase-plan-review.skill.ts` — plan review loop orchestration

### Modified Files (3)

- `src/agents/luca/lu-planner.agent.ts` — add section on referencing research engrams, `research_refs` in task frontmatter
- `src/skills/general/phase-plan.skill.ts` — pass GRADUATION-REPORT.md research refs list to planner
- `src/skills/__helpers/build-skill-registry.ts` — register `phase-plan-review` skill

### PLAN.md Task Format Enhancement

Each task gets a `research_refs` field listing MuninnDB concept prefixes:

```
**Research refs:** research:approach-ws-reconnect, research:api-bun-websocket
```

### Plan Review Loop

- Uses existing agents: code-architect, dx-advocate, security-auditor
- Cold isolation from planner
- Uses BLOCKING/ADVISORY severity (not CRITICAL/IMPORTANT like research review)
- Iteration budgets: TRIVIAL=1, SIMPLE=1, MODERATE=2, COMPLEX=2, CRITICAL=3

### Verification

- Enhanced planner + plan review skill pass `bunx --bun tsc --noEmit`
- PLAN.md tasks include `research_refs` when v2 enabled
- Plan review loop uses cold isolation
- Loop terminates by approval or budget exhaustion

## Notes

- Depends on Phase 3 (needs GRADUATION-REPORT.md)
- Can be parallelized with Phase 5 (both depend on Phase 3, not each other)
- Low risk — small changes to existing planner, reuses existing reviewer agents
