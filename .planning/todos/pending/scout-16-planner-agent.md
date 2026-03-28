---
title: "Scout: Create lu-scout-planner agent"
area: scouting
created: 2026-03-28
source: conversation
tags: [scout, agents, phase-3]
---

## Context

Step 7 of the pipeline. Generates small, digestible todos from the integration analysis. Includes conflict detection against existing pending todos.

## Task

Create `src/agents/general/lu-scout-planner.agent.ts`:

1. **Tools**: Read, Write, Grep, Glob
2. **Cognition tier**: T1 (memory reader — recall existing patterns and decisions)
3. **Input**: Integration analysis document, list of impact documents for `integrate` verdicts
4. **Process**:
   - Read integration analysis for recommended actions and ordering
   - For each recommended action:
     - Break into smallest possible atomic todos
     - Each todo should be independently implementable
     - Each todo should include: what to change, where in the codebase, why, and verification criteria
   - **Conflict detection**:
     - Scan all files in `.planning/todos/pending/` and `.planning/todos/done/`
     - For each proposed todo, check:
       - Does it duplicate an existing todo? → Skip (don't create duplicate)
       - Does it supersede an existing todo? → Create new todo, note supersession (normal evolution)
       - Does it conflict with a necessary existing todo (both valid, mutually exclusive)? → Skip todo, route scout to CONFLICTING/manual-review with conflict annotation
   - Follow existing todo format (frontmatter with title, area, created, source, tags)
5. **Output**: Todo files in `.planning/todos/pending/scout-{slug}-{N}.md`

## Notes

- Todos must be SMALL and DIGESTIBLE — one logical change per todo
- Todos must make sense in context with other planned todos
- The conflict detection is critical:
  - Supersession is normal: "use new approach X instead of planned approach Y" — create the new todo
  - True conflict is rare: "todo A is necessary AND todo B is necessary AND they negate each other" — this needs human review
- Each todo should reference the source scout digest and impact analysis
- Tags should include `[scout, {area}, from-scout]` for traceability
