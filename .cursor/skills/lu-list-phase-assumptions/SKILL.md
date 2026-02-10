---
name: lu-list-phase-assumptions
description: Preview AI planning assumptions before execution. Use when user wants to see what AI will do, mentions /lu-list-phase-assumptions, or wants to course-correct before planning.
disable-model-invocation: true
---

<main>
<main>
# Luca List Phase Assumptions

See what AI is planning to do before it starts.

**Arguments:** `<phase number>`

Shows AI's intended approach for a phase so you can course-correct if needed.

**No files created** - conversational output only.

## Process

1. **Load phase context:**
   - Read ROADMAP.md for phase goal
   - Read REQUIREMENTS.md for mapped requirements
   - Read research (if exists)
   - Read existing CONTEXT.md (if exists)

2. **Generate assumptions:**
   Based on phase goal and requirements, list:
   - **Technical approach:** Libraries, patterns, architecture choices
   - **Scope interpretation:** What's in, what's out
   - **Dependencies:** What the phase assumes exists
   - **Risks:** Potential challenges

3. **Present assumptions:**

   ```
   ## Phase {N}: {Name} - AI Assumptions
   
   ### Technical Approach
   - Will use {X} for {purpose}
   - Following pattern from {existing code}
   - Targeting {specific outcome}
   
   ### Scope
   **In scope:**
   - {item 1}
   - {item 2}
   
   **Out of scope:**
   - {item 3}
   - {item 4}
   
   ### Dependencies
   - Assumes {X} exists from Phase {Y}
   - Requires {Z} to be configured
   
   ### Potential Risks
   - {risk 1}
   - {risk 2}
   
   ---
   
   Does this match your expectations?
   
   - **Yes** → /lu-plan-phase {N}
   - **Adjust** → /lu-discuss-phase {N} to clarify
   ```

4. **No files created:**
   - This is conversational output only
   - Use `/lu-discuss-phase` to capture corrections

## Success Criteria

- [ ] Phase goal and requirements loaded
- [ ] Technical assumptions clearly stated
- [ ] Scope boundaries explicit
- [ ] Dependencies identified
- [ ] User can validate before planning

## Next Steps

| Condition | Action | Command |
|-----------|--------|---------|
| Assumptions look good | Plan the phase | `/lu-plan-phase {phase}` |
| Assumptions need clarification | Discuss the phase | `/lu-discuss-phase {phase}` |
| Need more research | Research the domain | `/lu-research-phase {phase}` |

**Primary:** `/lu-plan-phase {phase}` — Proceed with planning

**Also available:**
- `/lu-discuss-phase {phase}` — Clarify vision if assumptions seem off
- `/lu-progress` — Check overall project status
</main>
</main>