---
title: "Aggressive milestone-scoped recall prioritization"
area: framework/memory
created: 2026-03-08
source: muninn-memory-audit (context-analyst)
priority: P2
complexity: SIMPLE
---

## Context

The Muninn memory audit found that milestone-scoped recall scoring exists in lu-cognition (lines 261-265) but isn't aggressive enough. Entries from old milestones (v1.x, v2.x) surface alongside current milestone entries, adding ~30% noise to recall results. Current estimated utilization of milestone scoping: 60%.

## Task

1. In lu-cognition's recall scoring, increase milestone proximity weight from current 0.4 to 0.6
2. Add a decay factor: entries from milestones 2+ versions behind get 0.25x score multiplier
3. Entries tagged with current milestone get 1.5x boost
4. Entries with no milestone tag (legacy) get 0.5x score (instead of current 1.0)
5. Saves 300-500 tokens per recall by deprioritizing irrelevant old learnings

Files to modify:

- `src/agents/general/lu-cognition.agent.ts` — recall scoring weights

## Notes

- Quick win: 1-2 hours effort
- Part of Muninn Memory Audit Tier 1 recommendations
- Related: #89 (complexity-gated depth), #18 (semantic memory embeddings adds another scoring dimension)
