---
title: "Inject memory context into sub-agent Task() prompts"
area: framework/memory
created: 2026-03-08
source: muninn-memory-audit (pipeline-auditor)
priority: P1
complexity: MODERATE
---

## Context

The Muninn memory audit identified the **single highest-impact gap** in the memory system: every sub-agent spawned via Task() starts with fresh context and receives ZERO MuninnDB session context or recalled learnings. Context degrades from 100% at lu-cognition to ~20% at lu-executor to ~10% at lu-verifier.

The pipeline auditor mapped the "memory dilution curve":

- lu-cognition: 100% context (full recall)
- phase-plan skill: ~70% (has explicit recall)
- lu-planner subagent: ~30% (files only, no memory)
- lu-executor subagent: ~20% (plan only, no memory)
- lu-verifier subagent: ~10% (summary only, no memory)

## Task

1. When phase-execute spawns lu-executor via Task(), include the cognitive report (recalled patterns, pitfalls, decisions) in the prompt
2. When phase-plan spawns lu-planner via Task(), include recalled patterns/decisions relevant to planning
3. When phase-execute spawns lu-verifier, include recalled pitfalls and verification patterns
4. Create a standard helper function: `buildMemoryContextBlock(agentName, complexity)` that:
   - Reads current session context from MuninnDB
   - Filters by agent's memory_tags
   - Returns a formatted markdown block to inject into Task() prompts
5. Add this helper to `src/agents/__helpers/` (or `src/shared/__helpers/`)

Files to modify:

- `src/skills/general/phase-execute.skill.ts` — inject memory block into executor/verifier Task() calls
- `src/skills/general/phase-plan.skill.ts` — inject memory block into planner/plan-checker Task() calls
- `src/agents/__helpers/` — new helper for building memory context blocks

This fixes the context dilution problem without requiring sub-agents to recall independently.

## Notes

- Estimated effort: 6-8 hours
- Part of Muninn Memory Audit Tier 2 recommendations
- This is the SINGLE HIGHEST IMPACT fix identified by the audit
- Related: #90 (session digest reduces what needs to be injected)
