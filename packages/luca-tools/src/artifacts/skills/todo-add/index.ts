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

   - \`--source\` records where the item came from: \`manual\` for a hand-entered item, otherwise the origin (\`gh-issue-#42\`, \`phase-research\`, …). Use \`manual\` when the user just told you about it.
   - The \`id\` is a kebab-case slug **derived from the title automatically**. Only pass an explicit \`--id\` if the user asked for a specific slug.

5. **Execute the returned instruction — this is the step that actually writes:**

   \`luca todo add\` only VALIDATES. It cannot reach MuninnDB itself (the \`luca\` CLI cannot call another MCP server), so it prints a \`muninn_*\` procedure — the delegation pattern — and **you** are the one that runs it. Execute the returned steps **exactly as returned**:

   - Fast path (backlog root already cached): a single \`mcp__muninn__muninn_add_child\` under the root, with \`parent_id\` already filled in.
   - Bootstrap path (first todo in this vault): \`mcp__muninn__muninn_remember_tree\` to create the backlog root, then IMMEDIATELY \`luca todo set-root --id <root_id>\` to cache it, then the \`add_child\` with the placeholder substituted for that \`root_id\`.

   Parse each step's args via \`JSON.parse(argsJson)\` — the title and body live only inside that payload. **Stopping after the CLI call persists nothing**: the command exits 0, the todo validates, and the backlog never sees it.

6. **Confirm:**

   \`\`\`
   ✓ Todo captured: {title}

   Id: {id}
   Status: pending
   Area: {area}
   Backlog: MuninnDB todo:<id> (see \`luca todo list\`)

   /todo-check to review pending
   \`\`\`

## Success Criteria

- [ ] Todo content extracted (from args or conversation)
- [ ] Area inferred from context
- [ ] Duplicate check performed
- [ ] The \`muninn_*\` procedure returned by \`luca todo add\` was EXECUTED (not just printed) — this is what persists the todo
- [ ] Todo engram persisted to MuninnDB backlog (\`todo:*\` in repo vault)
- [ ] Persistence read back via \`luca todo list\` to confirm
- [ ] User knows how to review todos

## Next Steps

**Primary:** Continue current work — todo captured for later

**Also available:**
- \`/todo-check\` — Review all pending todos
- \`/progress\` — Check project status
</main>
`

export const todoAddSkill = defineSkill({
    name: 'todo-add',
    description:
        'Capture an idea or task as a todo for later without acting on it now.',
    body: BODY,
})
