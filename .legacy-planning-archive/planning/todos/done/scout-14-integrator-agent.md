---
title: "Scout: Create lu-scout-integrator agent"
area: scouting
created: 2026-03-28
source: conversation
tags: [scout, agents, phase-3]
---

## Context

Step 6 of the pipeline (cross-cutting). After all per-article pipelines reach READY, this agent analyzes the batch holistically — how do the learnings fit together, and how do they fit with the existing framework?

## Task

Create `src/agents/general/lu-scout-integrator.agent.ts`:

1. **Tools**: Read, Grep, Glob, Write
2. **Cognition tier**: T1 (memory reader — recall project identity, architecture, existing patterns/decisions)
3. **Input**: List of all READY impact documents
4. **Process**:
   - Read all impact documents in the batch
   - Cross-scout cohesion analysis:
     - Do any scouts reinforce each other? (same technique from different angles)
     - Do any scouts conflict with each other? (contradictory approaches)
     - What's the natural integration ordering? (dependencies between improvements)
   - Framework fit assessment:
     - Read current ROADMAP.md and existing pending todos
     - How do proposed improvements align with current direction?
     - Which improvements are additive vs require rework?
   - Per-scout verdict:
     - `integrate` — proceed to todo generation
     - `defer` — valid but too costly/disruptive right now (with specific reasoning + revisit conditions)
     - `conflict` — conflicts with existing planned work in a way that needs human review
5. **Output**: Writes `docs/scouting/integration/{date}-batch-{id}.md` using integration analysis template

## Notes

- This is the gate that produces DEFERRED and CONFLICTING terminal states
- The "defer" verdict must include specific Conditions to Revisit — not just "too hard"
- The "conflict" verdict must reference the specific existing todo(s) that conflict
- Integration ordering should consider dependency chains (e.g., "must do A before B")
- MuninnDB recall: query for `decision:*` and `pitfall:*` to avoid re-recommending rejected approaches
