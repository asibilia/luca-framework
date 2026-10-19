# @luca/engine: modules in `src/guards/`

The guard: what each role may write and run, and checks of a worktree around a
turn. A module in another folder is on its folder's page; the
[README](../README.md) lists them.

| Module | What it does |
| --- | --- |
| `src/guards/role-rules.ts` | Pure: what each role may write and run, checked per tool call (`checkToolCall`) ([its modules](#role-rules-modules)). |
| `src/guards/guard-hook.ts` | The guard as the SDK's `PreToolUse` hook; it counts each agent's running helpers. |
| `src/guards/helper-rules.ts` | Pure: the read-only `searcher` helper's definition, and what a helper call and a helper's own calls may do (#627). |
| `src/guards/sandbox-settings.ts` | Pure: each role's OS sandbox, in absolute paths. |
| `src/guards/after-turn-check.ts` | Pure: compares a worktree before and after an agent's turn. |
| `src/guards/worktree-state.ts` | Snapshots a worktree and its git state, and undoes violations. The engine's own refs (the run branch, other tickets' branches) don't count. |

## role-rules modules

The modules split out of `src/guards/role-rules.ts`. It re-exports them.

| Module | What it does |
| --- | --- |
| `src/guards/guard-roles.ts` | The guard's roles, their tools, and its decision type. |
| `src/guards/write-rules.ts` | Pure: the paths each role may write (`mayWrite`). |
| `src/guards/shell-rules.ts` | Pure: the shell commands each role may run. |
| `src/guards/permission-rules.ts` | Pure: each role's SDK permission rules. |
