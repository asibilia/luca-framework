/**
 * todo-check slash command — List all items in the development backlog.
 *
 * Ported from ~/.claude/commands/todo-check.md (user copy canonical) (E-6).
 */
import { defineCommand } from '../../define/command.ts'

const BODY = `# /todo-check

List the development backlog. Todos live in **MuninnDB** (concept \`todo:*\`, repo vault).

## Steps

1. **Parse the filter.** Check \`$ARGUMENTS\` for an optional status filter — one of \`pending\`, \`backlog\`, or \`done\`.

2. **List the todos.** Run the \`luca todo list\` CLI:

   \`\`\`
   luca todo list
   \`\`\`

   Pass \`--status <filter>\` if a filter was given.

3. **Execute the returned instruction.** \`luca todo list\` prints a \`mcp__muninn__muninn_recall\` instruction blob (delegation pattern). Execute it **exactly as returned** to recall the todos.

4. **Parse each entry.** Each recalled memory's \`content\` is JSON conforming to \`TodoSchema\` (\`id\`, \`title\`, \`body?\`, \`status\`, \`priority?\`, \`area?\`, \`source?\`, \`updatedAt\`). Parse every entry. If a status filter was requested, keep only todos whose \`content.status\` matches it.

5. **Display.** Render a numbered checklist grouped by status, in this order:

   1. ⬜ **Pending** — \`status: "pending"\`
   2. 📋 **Backlog** — \`status: "backlog"\`
   3. ✅ **Done** — \`status: "done"\`

   For each todo, show its \`id\`, \`title\`, \`priority\` (if set), \`area\` (if set), \`source\` (if set), and \`updatedAt\`.

6. **Empty backlog.** If no todos came back, tell the user the backlog is empty and suggest \`/todo-add\` to start building it.

$ARGUMENTS
`

export const todoCheckCommand = defineCommand({
    name: 'todo-check',
    description: 'List all items in the development backlog.',
    body: BODY,
})
