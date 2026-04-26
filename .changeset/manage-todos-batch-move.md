---
'@alecsibilia/luca-framework': minor
---

Add a `move-batch` action to the `manageTodos` tool so multiple todos can be transitioned between `pending` / `backlog` / `done` in a single, index-shift-safe call.

Previously, marking N todos done required N sequential `move` calls. The numeric `#index` on each todo is reassigned every time the backlog is listed (order is `pending → backlog → done`), so as soon as the first item moves, every later index in the agent's plan now points at a different todo. Agents would either silently mark the wrong items done, or have to fall back to per-item slug lookups.

Changes:

- New `manageTodos(action: "move-batch", items: [{ identifier, targetStatus }, …])` action. Identifiers may be numeric indices or slug strings; mixing is allowed. All identifiers are resolved against a single backlog snapshot before any filesystem moves run, so the indices captured from a prior `list` remain valid for the entire batch.
- New `moveBatch({ items })` export from `src/todos.ts`. Returns both `moved` and `missing` so callers can surface partial-success errors instead of aborting.
- `assignBatch` now delegates to `moveBatch`, making it index-shift-safe as well.
- Updated execute / finalize mode instructions and the README tool table to recommend `move-batch` whenever multiple todos change status.
