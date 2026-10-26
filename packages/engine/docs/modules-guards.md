# @luca/engine: modules in `src/guards/`

The guard: what each role may write and run, and checks of a worktree around a
turn. A module in another folder is on its folder's page; the
[README](../README.md) lists them.

| Module | What it does |
| --- | --- |
| `src/guards/role-rules.ts` | Pure: what each role may write and run, checked per tool call (`checkToolCall`) ([its modules](#role-rules-modules)). |
| `src/guards/guard-hook.ts` | The guard as the SDK's `PreToolUse` hook; it counts each agent's running helpers. |
| `src/guards/helper-rules.ts` | Pure: the read-only `searcher` helper's definition, and what a helper call and a helper's own calls may do (#627). |
| `src/guards/sandbox-settings.ts` | Pure: each role's OS sandbox, in absolute paths, with macOS's per-user temp folder writable for writers. |
| `src/guards/after-turn-check.ts` | Pure: compares a worktree before and after an agent's turn. |
| `src/guards/worktree-state.ts` | The after-turn check: finds a turn's violations and undoes them ([its modules](#worktree-state-modules)). The engine's own refs (the run branch, other tickets' branches) don't count, and a new ref counts only at a commit the turn made. |

## role-rules modules

The modules split out of `src/guards/role-rules.ts`. It re-exports them.

| Module | What it does |
| --- | --- |
| `src/guards/guard-roles.ts` | The guard's roles, their tools, and its decision type. |
| `src/guards/write-rules.ts` | Pure: the paths each role may write (`mayWrite`). |
| `src/guards/shell-rules.ts` | Pure: the shell commands each role may run. |
| `src/guards/permission-rules.ts` | Pure: each role's SDK permission rules. |

## worktree-state modules

The modules split out of `src/guards/worktree-state.ts`. It re-exports `snapshotWorktree`.

| Module | What it does |
| --- | --- |
| `src/guards/worktree-git.ts` | Runs git with no fsmonitor, hooks, or content filters, and the ignore rules from before a turn. |
| `src/guards/worktree-snapshot.ts` | Snapshots a worktree and its git state before a turn (`snapshotWorktree`). |
| `src/guards/worktree-undo.ts` | Undoes a turn's violations: git state, refs the turn made, paths, `node_modules`, and the branch's config. |
