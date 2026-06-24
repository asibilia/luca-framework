---
title: "Close the learning loop: Apply-Measure-Refine cycle"
area: framework/memory
created: 2026-03-08
source: muninn-memory-audit (learning-loop-tracer)
priority: P1
complexity: COMPLEX
---

## Context

The Muninn memory audit's most critical finding: **the learning loop is OPEN at the APPLY step.** Learnings are rigorously captured (lu-learner, best-in-class) and recalled (lu-cognition, well-designed), but NO agent has logic to act on recalled patterns, avoid recalled pitfalls, or follow recalled procedures. Memory is injected as context and hoped to help — it's not a behavioral constraint system.

Evidence from audit:

- 0 agents check if a recalled pattern should apply to current work
- 0 agents avoid known pitfalls explicitly via conditional logic
- 0 agents enforce past decisions unless user re-states them
- 0 agents follow stored procedures when trigger conditions match
- Intuition flags (RISK, CAUTION, OPPORTUNITY) are generated but never checked downstream
- `mcp__muninn__muninn_feedback()` never called (no effectiveness tracking)
- `mcp__muninn__muninn_consolidate()` never called (no deduplication)
- `mcp__muninn__muninn_evolve()` barely called (confidence rarely updated)

## Task

### Phase A: APPLY (Make agents act on recalled memory)

1. **Pattern application in lu-planner:** _(absorbs #15 Reflective Meta-Cognition)_
   - When generating plan, check recalled patterns for HIGH-confidence matches
   - If pattern matches current task domain + tags, bias plan structure toward pattern
   - Add explicit "Applied patterns: [list]" section to PLAN.md output
   - Add plan confidence score based on historical pattern match strength
   - Flag plans that match historically problematic patterns (e.g., touching auth + DB in same wave)

2. **Pitfall avoidance in lu-executor:**
   - Before executing each task, check recalled pitfalls for tag/domain matches
   - If pitfall applies, add preventive validation step to execution
   - Log "Avoided pitfall: [name]" in session findings

3. **Decision respect in lu-planner:**
   - Check recalled decisions for technology/architecture choices
   - If a past decision applies (e.g., "use Zod over Yup"), enforce it unless new evidence contradicts
   - Flag when plan would contradict a past decision

4. **Procedure execution in lu-executor:**
   - Check recalled procedures for trigger condition matches
   - If procedure found with success_rate > 0.7, suggest following it
   - Track procedure execution outcome

### Phase B: MEASURE (Track whether recalled memory helped)

5. **Post-execution pattern check:**
   - After lu-executor completes, check which recalled patterns were actually applied
   - Write "pattern_applied: true/false" to session findings

6. **Effectiveness feedback:**
   - Call `mcp__muninn__muninn_feedback(engram_id, useful: true/false)` after verification
   - If pattern was applied AND verification passed → useful: true
   - If pitfall was avoided AND no related failure → useful: true

### Phase C: REFINE (Improve memory quality over time)

7. **Confidence evolution:**
   - Call `mcp__muninn__muninn_evolve()` to bump confidence when pattern/pitfall confirmed useful
   - Demote confidence when recalled item was applied but didn't help

8. **Entity consolidation:**
   - Periodically call `mcp__muninn__muninn_consolidate()` to merge duplicate entries
   - Add consolidation step to milestone-complete skill

9. **Stale memory pruning:**
   - Flag entries that are recalled 5+ times but never applied (noise candidates)
   - Flag entries with LOW confidence after 3+ milestones (never validated)
   - Archive or deprecate via `mcp__muninn__muninn_evolve()` with status: "deprecated"

Files to modify:

- `src/agents/luca/lu-planner.agent.ts` — pattern application + decision respect
- `src/agents/luca/lu-executor.agent.ts` — pitfall avoidance + procedure execution
- `src/agents/general/lu-learner.agent.ts` — feedback + evolve + consolidate
- `src/skills/general/phase-execute.skill.ts` — measure step after verification
- `src/skills/general/milestone-complete.skill.ts` — consolidation step

## Notes

- This is the MOST TRANSFORMATIONAL todo from the audit
- Estimated effort: 12-20 hours (3 phases)
- Phase A alone (APPLY) delivers majority of value: 6-8 hours
- Transforms memory from "context injection" to "behavioral constraint system"
- #15 (reflective meta-cognition) has been absorbed into this todo's Phase A, step 1
- Related: #18 (semantic embeddings improve recall quality for apply step)
- Depends on: #92 (sub-agent memory injection) being stable before implementation
