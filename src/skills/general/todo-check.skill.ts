/**
 * todo-check Skill - List pending todos and select one to work on next.
 */
import { createSkill } from "~/skills/__helpers/create-skill";
import type { SkillConfig } from "~/skills/__schemas/skill.schemas";

// Define the todo-check skill configuration
const todoCheckConfig: SkillConfig = {
  frontmatter: {
    name: "todo-check",
    description: `List pending todos and select one to work on next.`,
  },
  sections: [
    {
      title: "main",
      content: `<main>
# Luca Check Todos

List pending todos and select one to work on.

**Arguments:** \`[area]\` (optional - filter by area like 'api', 'ui', etc.)

## Process

1. **List pending todos:**

   \`\`\`bash
   ls .planning/todos/pending/*.md 2>/dev/null
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
   - Move todo to \`.planning/todos/done/\`
   - Route to appropriate action

6. **Show deferred items (if any exist):**

   \`\`\`bash
   ls .planning/todos/deferred/*.md 2>/dev/null
   \`\`\`

   If deferred items exist, show them in a separate section below the pending list:

   \`\`\`
   ## Deferred Items (intentionally postponed)

   | # | Title | Area | Deferred Since |
   |---|-------|------|----------------|
   | 1 | Agent cross-talk protocol | agents | 2026-03-24 |

   To promote a deferred item, move it to pending/ manually or ask to work on deferred items.
   \`\`\`

## Success Criteria

- [ ] Pending todos listed with title, area, age
- [ ] Area filter works (if provided)
- [ ] Deferred items shown separately below pending list
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
</main>`,
      order: 1,
    },
  ],
};

export const todoCheckSkill = createSkill(todoCheckConfig);
