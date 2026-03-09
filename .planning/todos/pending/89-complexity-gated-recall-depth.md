---
title: "Complexity-gated recall depth for MuninnDB"
area: framework/memory
created: 2026-03-08
source: muninn-memory-audit (context-analyst)
priority: P1
complexity: SIMPLE
---

## Context

The Muninn memory audit found that all MODERATE+ tasks receive full recall depth (5-7 entries) regardless of actual need. MODERATE tasks represent ~80% of work but rarely need more than 3 recalled entries. Current lu-cognition tier scaling gates by agent tier (T0-T3) but not by task complexity.

Audit data: 11-18K tokens overhead per MODERATE task (5.5-9% of context window), with ~40% of recalled data unused.

## Task

1. Update lu-cognition's recall logic to scale entry limits by BOTH agent tier AND task complexity:
   - MODERATE complexity: cap at 3 entries (shallow recall) regardless of agent tier
   - COMPLEX complexity: current limits (5-7 entries)
   - CRITICAL complexity: current limits (7-10 entries)
2. Update `src/agents/general/lu-cognition.agent.ts` recall section
3. Update complexity matrix in `.planning/config.json` to include `recallDepth` per level
4. Verify TRIVIAL/SIMPLE already skip memory via lite mode (no changes needed there)

Estimated savings: **2-3K tokens per MODERATE task (~1.5% of 200K context window)**

## Notes

- Quick win: config-level change + 1 agent edit
- Estimated effort: 2-3 hours
- Part of Muninn Memory Audit Tier 1 recommendations
- Related: #91 (milestone-scoped recall), #94 (lazy recall)
