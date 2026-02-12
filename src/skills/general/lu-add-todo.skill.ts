/**
 * lu-add-todo Skill - Capture an idea or task as a todo for later without acting on it now.
 */
import { BaseSkillImpl } from "../base/base-skill";
import type { SkillConfig } from "../types/skill.types";

// Define the lu-add-todo skill configuration
const luAddTodoConfig: SkillConfig = {
  frontmatter: {
    name: "lu-add-todo",
    description: `Capture an idea or task as a todo for later without acting on it now.`,
    "disable-model-invocation": true,
  },
  sections: [
    {
      title: "main",
      content: `<main>
# Luca Add Todo

Capture idea or task as todo from current conversation.

**Arguments:** \`[description]\` (optional - infers from conversation if not provided)

## Process

1. **Extract context:**
   - If description provided: use it
   - If not: infer from recent conversation context

2. **Infer area:**
   - Check file paths mentioned in conversation
   - Categorize: api, ui, auth, data, etc.

3. **Check for duplicates:**
   - Search existing pending todos for similar content
   - Warn if duplicate found

4. **Create todo file:**
   - Location: \`.planning/todos/pending/{slug}.md\`
   - Include: title, area, source context, timestamp

5. **Update STATE.md:**
   - Increment todo count

6. **Confirm:**

   \`\`\`
   ✓ Todo captured: {title}
   
   Area: {area}
   File: .planning/todos/pending/{slug}.md
   
   /lu-check-todos to review pending
   \`\`\`

## Todo File Format

\`\`\`markdown
---
title: {title}
area: {api/ui/auth/data/etc}
created: {timestamp}
source: conversation
---

## Context

{What the user was discussing when this came up}

## Task

{Specific thing to do}

## Notes

{Any additional context}
\`\`\`

## Success Criteria

- [ ] Todo content extracted (from args or conversation)
- [ ] Area inferred from context
- [ ] Duplicate check performed
- [ ] Todo file created in \`.planning/todos/pending/\`
- [ ] STATE.md updated
- [ ] User knows how to review todos

## Next Steps

**Primary:** Continue current work — todo captured for later

**Also available:**
- \`/lu-check-todos\` — Review all pending todos
- \`/lu-progress\` — Check project status
</main>`,
      order: 1,
    },
  ],
};

export class LuAddTodoSkill extends BaseSkillImpl {
  constructor() {
    super(luAddTodoConfig);
  }
}
