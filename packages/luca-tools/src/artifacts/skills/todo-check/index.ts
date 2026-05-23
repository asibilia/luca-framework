/**
 * todo-check skill — List pending todos and select one to work on next.
 *
 * Ported from fd0b169be:packages/luca-framework/.cursor/skills/todo-check/SKILL.md (pre-D-4) (E-5).
 * Body path-retargeting: .planning/ → .luca/; uppercase artifacts
 * (PLAN.md, RESEARCH.md, CONTEXT.md, POSTMORTEM.md) → LUCA_DIR_CONTRACT
 * canonicals (plan.md, research.md, context.md, learn.md).
 */
import { defineSkill } from '../../../define/skill.ts'

const BODY = `<main>
# Luca Check Todos

List pending todos and select one to work on.

**Arguments:** \`[area]\` (optional - filter by area like 'api', 'ui', etc.)

## Process

1. **List pending todos:**

   \`\`\`bash
   ls .luca/todos/pending/*.md 2>/dev/null
   \`\`\`

2. **Filter by area (if provided):**
   - Read each todo's frontmatter
   - Filter to matching area

3. **Present list:**

   \`\`\`
   ## Pending Todos
   
   | # | Title | Area | Age |
   |---|-------|------|-----|
   | 1 | Fix modal z-index | ui | 3 days |
   | 2 | Add auth refresh | api | 1 day |
   | 3 | Update docs | docs | 5 hours |
   
   Select a number to view details, or:
   - /todo-add — capture new idea
   - /progress — return to main workflow
   \`\`\`

4. **Handle selection:**
   - Load full todo content
   - Present context and task details
   - Offer options:
     - "Work on now" - move to done/, start work
     - "Add to phase" - suggest adding to current phase
     - "Brainstorm" - discuss approach
     - "Back" - return to list

5. **If "Work on now":**
   - Move todo to \`.luca/todos/done/\`
   - Route to appropriate action

## Success Criteria

- [ ] Pending todos listed with title, area, age
- [ ] Area filter works (if provided)
- [ ] Selected todo shows full context
- [ ] Options appropriate to todo content
- [ ] Completed todos moved to done/

## Next Steps

| Condition | Action | Command |
|-----------|--------|---------|
| Selected a todo to work on | Work on it | \`/lu {selected todo}\` |
| No todos ready | Continue planned work | \`/progress\` |
| Want to add more | Capture new todo | \`/todo-add\` |

**Primary:** \`/lu {selected}\` — Work on the selected todo

**Also available:**
- \`/progress\` — Return to planned work
- \`/todo-add\` — Capture additional todos
</main>
`

export const todoCheckSkill = defineSkill({
    name: "todo-check",
    description: "List pending todos and select one to work on next.",
    body: BODY,
})
