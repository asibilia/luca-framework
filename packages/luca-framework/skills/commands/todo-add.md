---
name: todo-add
description: Add a new item to the development backlog.
---

# /todo-add

Add a new todo to the development backlog. Todos persist in **MuninnDB** (concept `todo:<id>`, repo vault) — there is no `.luca/todos/` directory.

## Steps

1. **Parse the title.** Treat `$ARGUMENTS` as the todo title — a short imperative description (e.g. "Add retry to the upload client"). If no arguments were provided, ask the user what they'd like to add.

2. **Create the todo.** Run the `luca todo add` CLI with the title:

   ```
   luca todo add --title "<title>" --source manual
   ```

   - `--source manual` marks this as a hand-entered item (vs. `gh-issue-#N` or `phase-research`).
   - If the user supplied acceptance criteria or extra context, pass it as `--body "<text>"`.
   - The `id` is derived from the title automatically; only pass an explicit `--id` if the user asked for a specific slug.

3. **Execute the returned instruction.** `luca todo add` validates the input and prints a `mcp__muninn__muninn_remember` instruction blob (delegation pattern — the `luca` CLI cannot call MuninnDB directly). Execute that instruction **exactly as returned** to persist the todo.

4. **Confirm.** Report that the todo was created and show its `id` (the kebab-case slug derived from the title) and its status (`pending`).

$ARGUMENTS
