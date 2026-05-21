---
name: todo-check
description: List all items in the development backlog.
---

# /todo-check

List the development backlog. Todos live in **MuninnDB** (concept `todo:*`, repo vault).

## Steps

1. **Parse the filter.** Check `$ARGUMENTS` for an optional status filter — one of `pending`, `backlog`, or `done`.

2. **List the todos.** Call `luca_todo_list`:

   ```
   luca_todo_list({})
   ```

   Pass `status: "<filter>"` if a filter was given.

3. **Execute the returned instruction.** `luca_todo_list` returns a `mcp__muninn__muninn_recall` instruction blob (delegation pattern). Execute it **exactly as returned** to recall the todos.

4. **Parse each entry.** Each recalled memory's `content` is JSON conforming to `TodoSchema` (`id`, `title`, `body?`, `status`, `source?`, `updatedAt`). Parse every entry. If a status filter was requested, keep only todos whose `content.status` matches it.

5. **Display.** Render a numbered checklist grouped by status, in this order:

   1. ⬜ **Pending** — `status: "pending"`
   2. 📋 **Backlog** — `status: "backlog"`
   3. ✅ **Done** — `status: "done"`

   For each todo, show its `id`, `title`, `source` (if set), and `updatedAt`.

6. **Empty backlog.** If no todos came back, tell the user the backlog is empty and suggest `/todo-add` to start building it.

$ARGUMENTS
