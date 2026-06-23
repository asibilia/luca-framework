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

3. **Execute the returned procedure.** \`luca todo list\` emits a \`muninn_recall_tree\` procedure (delegation pattern): resolve the cached backlog root, walk the tree, and \`muninn_read\` each non-deleted child for its content. Follow it **exactly as returned**. If the backlog is uninitialized it prints a plain notice instead (no todos) — report that and stop.

4. **Parse each entry.** Each child's \`content\` is JSON conforming to \`TodoSchema\` (\`id\`, \`title\`, \`body?\`, \`status\`, \`priority?\`, \`area?\`, \`source?\`, \`updatedAt\`). Parse every entry, keying off \`content.id\` (not the concept string). If a status filter was requested, keep only todos whose \`content.status\` matches it.

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
