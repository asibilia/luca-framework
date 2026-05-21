# Phase 214 Plan 1 Summary: Fix Jotai Save Callback Crash

## Outcome

All 4 tasks completed successfully. The P0 Jotai save callback crash that affected 5 pages (Agents, Skills, Rules, Config, Pipeline) on mount is fixed. Three additional defense-in-depth guards were added to prevent cascading failures.

## Tasks Completed

| #   | Task                                                     | Commit     | Files                                                  |
| --- | -------------------------------------------------------- | ---------- | ------------------------------------------------------ |
| 1   | Fix save callback atom setter                            | `80eb640c` | `packages/luca-studio/stores/layout.ts`                |
| 2   | Add ETag null guard in entity save hook                  | `7e5da7ef` | `packages/luca-studio/hooks/use-entity-save.ts`        |
| 3   | Add dirty guard in config save hook                      | `82f326d5` | `packages/luca-studio/hooks/use-config-save.ts`        |
| 4   | Add try/catch around save callback in keyboard shortcuts | `ce874e7d` | `packages/luca-studio/hooks/use-keyboard-shortcuts.ts` |

## Key Changes

### Task 1 -- Root Cause Fix

Jotai's primitive atom `set` treats function values as updaters (like React's `setState`). When `set(_saveCallbackAtom, callback)` receives a function, Jotai invokes it as `callback(previousValue)` instead of storing it. Fixed by wrapping: `set(_saveCallbackAtom, callback ? () => callback : null)`. The thunk wrapper tells Jotai "store this function" rather than "run this function as an updater."

### Task 2 -- ETag Defense

Replaced `throw new Error(...)` with `console.warn(...)` + early return when ETag is null. During the mount-crash cascade, the save callback fires before the ETag fetch completes, and throwing here crashes the page. Warning + return is the correct behavior since save without ETag is a no-op.

### Task 3 -- Dirty-Set Defense

Added `dirtySetAtom` read and `if (!dirtySet.has("config")) return` guard to `useConfigSave`'s `save` function. Prevents spurious save attempts during mount when no user edits exist.

### Task 4 -- Error Boundary

Added `.catch()` to the `saveCallback()` invocation in the Cmd+S keyboard shortcut handler. Save errors are now logged to console rather than becoming unhandled promise rejections.

## Verification

- `bunx --bun tsc --noEmit -p packages/luca-studio/tsconfig.json` passes with 0 new errors (8 pre-existing errors in unrelated files confirmed via stash comparison)
- All 4 modified files compile cleanly

## Deviations

None. All tasks executed as planned.
