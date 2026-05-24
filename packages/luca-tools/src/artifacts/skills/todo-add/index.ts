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

4. **Persist the todo via the canonical CLI surface:**

   \\\`\\\`\\\`bash
   luca todo add --title "<title>" --area "<area>" --priority "<low|medium|high|critical>" --source "<origin>" --body "<source context>"
   \\\`\\\`\\\`

   Backlog state lives in MuninnDB (\`todo:*\` engrams under the repo vault) — there is no \`.luca/todos/\` directory in the LUCA_DIR_CONTRACT.

5. **Confirm:**

   \`\`\`
   ✓ Todo captured: {title}

   Area: {area}
   Backlog: MuninnDB todo:<id> (see \`luca todo list\`)

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
- [ ] Todo engram persisted to MuninnDB backlog (\`todo:*\` in repo vault)
- [ ] Todo persisted to MuninnDB backlog via \`luca todo add\` (read back via \`luca todo list\` to confirm)
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
