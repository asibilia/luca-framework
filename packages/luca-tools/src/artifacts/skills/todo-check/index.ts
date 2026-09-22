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

**Arguments:** \`[area]\` (optional — filter by area like 'api', 'ui') and/or a status filter (\`pending\`, \`backlog\`, \`done\`)

## Process

1. **List pending todos:**

   \`\`\`bash
   luca todo list --status pending
   \`\`\`

   Backlog state is MuninnDB-backed; \`luca todo list\` is the canonical read surface — there is no \`.luca/todos/\` directory in the LUCA_DIR_CONTRACT.

   \`luca todo list\` enumerates the backlog **completely** — it resolves the backlog-root engram, then walks its tree (\`muninn_recall_tree\`), so every todo is returned regardless of vault size. Status is a content field: valid filters are \`pending\`, \`backlog\`, \`done\`; **omit \`--status\` to list all**. \`pending\` = ready to work; \`backlog\` = deferred/hidden tier.

   If todos created before the tree-backed backlog are missing from the list, run \`luca todo migrate\` once (re-run until it links nothing new) to pull legacy flat \`todo:\` engrams under the root.

2. **Execute the returned procedure — the CLI does not read MuninnDB for you:**

   \`luca todo list\` emits a \`muninn_recall_tree\` procedure (delegation pattern): resolve the cached backlog root by its ULID, walk the tree, then \`muninn_read\` each non-deleted child for its content. Follow it **exactly as returned**. If the backlog is uninitialized the CLI prints a plain notice instead of a procedure — report that and stop; there is nothing to walk.

3. **Parse each entry.** Each child's \`content\` is JSON conforming to \`TodoSchema\` (\`id\`, \`title\`, \`body?\`, \`status\`, \`priority?\`, \`area?\`, \`source?\`, \`updatedAt\`). Parse every entry and key off **\`content.id\`, not the concept string**. Apply any requested status filter against \`content.status\`.

4. **Filter by area (if provided):**
   - Inspect each todo's \`content.area\`
   - Filter to matching area

5. **Present list**, grouped by status in this order — ⬜ **Pending** (\`pending\`), then 📋 **Backlog** (\`backlog\`), then ✅ **Done** (\`done\`). Show each todo's \`id\`, \`title\`, \`priority\` (if set), \`area\` (if set), \`source\` (if set), and \`updatedAt\`:

   \`\`\`
   ## Pending Todos

   | # | Id | Title | Priority | Area | Updated |
   |---|----|-------|----------|------|---------|
   | 1 | fix-modal-z-index | Fix modal z-index | high | ui | 3 days ago |
   | 2 | add-auth-refresh  | Add auth refresh  | medium | api | 1 day ago |

   Select a number to view details, or:
   - /todo-add — capture new idea
   - /progress — return to main workflow
   \`\`\`

   **Empty backlog:** if nothing came back, say so plainly and suggest \`/todo-add\` to start building it. Do not invent entries.

6. **Handle selection:**
   - Load full todo content
   - Present context and task details
   - Offer options:
     - "Work on now" - start work
     - "Add to phase" - suggest adding to current phase
     - "Brainstorm" - discuss approach
     - "Back" - return to list

7. **If "Work on now":**
   - There is no "in-progress" status — valid statuses are \`pending\`, \`backlog\`, \`done\`. Leave it \`pending\` while you work; mark it \`done\` only when verified: \`luca todo update --id <id> --title "<title>" --status done --verification-criterion <criterionId>\` (the criterion must be met=true with evidence in the active phase's verify.json).
   - \`luca todo update\` is also a delegation: it returns a multi-step procedure that REPLACES the node (\`muninn_add_child\` the new version, then \`muninn_forget\` the old) — **not** \`muninn_evolve\`, which orphans tree members. Run the returned steps exactly as returned, and re-send the FULL payload: update is full-replace, so any optional field you omit (body, source, metadata, priority, area) is dropped.
   - Route to appropriate action

## Success Criteria

- [ ] The \`muninn_recall_tree\` procedure returned by \`luca todo list\` was EXECUTED, not just printed
- [ ] Entries parsed from \`content\` JSON, keyed on \`content.id\`
- [ ] Todos listed with id, title, priority, area, updatedAt — grouped pending → backlog → done
- [ ] Area/status filters work (if provided)
- [ ] Empty backlog reported honestly (no invented entries)
- [ ] Selected todo shows full context
- [ ] Options appropriate to todo content
- [ ] Completed todos marked \`done\` via \`luca todo update\` (full-replace payload; procedure executed)

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
    name: 'todo-check',
    description: 'List pending todos and select one to work on next.',
    body: BODY,
})
