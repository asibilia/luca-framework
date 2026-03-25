---
title: "v2 Enhanced Existing Agents — lu-phase-researcher, lu-learner, lu-premortem, lu-plan-checker"
area: agents
created: 2026-03-23
source: docs/workflow-system/v2/04-agent-orchestration/README.md
---

## Context

v2 enhances 4 existing agents in addition to creating 8 new ones. These modifications need to maintain backward compatibility with v1.

## Task

### lu-phase-researcher

- **Change**: Becomes orchestrator that spawns 4 specialist researchers instead of doing all research itself
- **When v2 enabled**: Spawns lu-architecture-researcher, lu-implementation-researcher, lu-ecosystem-researcher, lu-risk-researcher in parallel
- **When v1**: Behaves identically to current
- **Phase**: 1

### lu-learner

- **Change**: Gains `research:*` engram promotion pathway
- After verification (Step 10), may PROMOTE high-value `research:*` engrams to permanent `pattern:*`/`pitfall:*`/`decision:*` in DEFAULT vault
- Then clean up remaining `research:*` via `muninn_forget` (Decision 21)
- **Phase**: 3 (graduation) and 6 (integration)

### lu-premortem

- **Change**: Receives research files as input (previously operated on plan only)
- Risk analysis is more accurate with verified research context
- **Phase**: 6 (orchestrator wires research files to premortem)

### lu-plan-checker

- **Change**: Gains review loop support with convergence detection
- Multi-reviewer plan review loop (Step 8) replaces single-pass checking
- **Phase**: 4

### lu-research-synthesizer

- **Change**: Unchanged from v1 — still combines outputs into SUMMARY.md
- Now processes 4 researcher files instead of 1
- Re-runs after deep expand (Step 4)
- No prompt or frontmatter changes needed

## Notes

- Each modification must preserve v1 behavior when `workflow.version: "v1"`
- Stagger across phases per the rollout plan
