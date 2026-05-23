/**
 * todo-add skill — Capture an idea or task as a todo for later without acting on it now.
 *
 * Ported from fd0b169be:packages/luca-framework/.cursor/skills/todo-add/SKILL.md (pre-D-4) (E-5).
 * Body path-retargeting: .planning/ → .luca/; uppercase artifacts
 * (PLAN.md, RESEARCH.md, CONTEXT.md, POSTMORTEM.md) → LUCA_DIR_CONTRACT
 * canonicals (plan.md, research.md, context.md, learn.md).
 */
import { defineSkill } from '../../../define/skill.ts'

const BODY = `<main>
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
   - Location: \`.luca/todos/pending/{slug}.md\`
   - Include: title, area, source context, timestamp

5. **Update state (bridge primary, STATE.md fallback):**

   \\\`\\\`\\\`bash
   # Primary: Regenerate STATE.md from state machine (reflects todo changes)
   bun run packages/luca-framework/src/state/bridge.ts snapshot 2>/dev/null || true
   # Fallback: Manually increment todo count in STATE.md
   \\\`\\\`\\\`

6. **Confirm:**

   \`\`\`
   ✓ Todo captured: {title}
   
   Area: {area}
   File: .luca/todos/pending/{slug}.md
   
   /todo-check to review pending
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
- [ ] Todo file created in \`.luca/todos/pending/\`
- [ ] State updated via bridge snapshot (or STATE.md fallback)
- [ ] User knows how to review todos

## Next Steps

**Primary:** Continue current work — todo captured for later

**Also available:**
- \`/todo-check\` — Review all pending todos
- \`/progress\` — Check project status
</main>
`

export const todoAddSkill = defineSkill({
    name: "todo-add",
    description: "Capture an idea or task as a todo for later without acting on it now.",
    body: BODY,
})
