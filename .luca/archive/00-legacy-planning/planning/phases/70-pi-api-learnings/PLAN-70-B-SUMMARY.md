# Plan 70-B Summary: Slash Commands + Notifications + Confirmations

## Status: COMPLETE

## What Was Done

### Task 1: Create `luca-commands.ts` (NEW)

- Created `src/hooks/pi-extensions/luca-commands.ts` with 6 slash commands
- `/status`: Reads STATE.md, extracts Phase/Plan/Complexity/Oversight, displays via notify
- `/track`: Shows active subagent count and status summary from shared registry
- `/verify`: Shows last cached harness verification result
- `/todos`: Lists pending todos from `.planning/todos/pending/`
- `/subagents`: Detailed table with id, agent, status, duration
- `/safety`: Directs user to luca_list_safety_rules tool
- All commands are lightweight (< 50ms, no shell execution)

### Task 2: ctx.ui.notify() in luca-subagents.ts

- Added `ctx` as 6th parameter to `luca_subagent_create` and `luca_subagent_continue` execute functions
- Toast notifications fire in `onComplete` callbacks (info for success, error for failure)
- Toast notifications fire in catch blocks for spawn errors/limit hits (warn level)

### Task 3: ctx.ui.notify() in luca-harness.ts

- Renamed `_ctx` to `ctx` in `luca_verify` execute function
- Added toast notification after verification results computed
- Shows "Verification passed (N checks, Nms)" or "Verification FAILED: check1, check2"

### Task 4: ctx.ui.confirm() for safety actions

- Added confirmation dialog in `tool_call` handler for critical violations in warn mode
- Added confirmation dialog in `luca_set_safety_mode` when downgrading from "block" to less strict modes
- User declining blocks the operation with descriptive reason

### Task 5: before_agent_start in luca-memory.ts

- Added `before_agent_start` event handler that re-injects BRAIN.md on every agent turn
- Uses same `"luca-brain"` ID so addSystemContext replaces (no duplication)
- Existing `session_start` handler preserved for initial load

### Task 6: ctx.abort() for critical safety violations

- Added `ctx.abort()` call in `tool_call` handler for critical violations in block mode
- Added `ctx.ui.notify()` for BLOCKED notification before abort
- Only fires for critical severity + block mode (most severe combination)

### Task 7: Build pipeline registration

- Added `"luca-commands.ts"` to `PI_EXTENSION_FILES` in `scripts/build-shared.ts`
- Updated `.pi/settings.json` extensions list

### Task 8: Tests

- **NEW**: `__tests__/src/hooks/pi-extensions/luca-commands.test.ts` (15 tests)
  - Validates 6 commands registered, 0 tools, 0 events
  - Tests each command handler calls ctx.ui.notify
  - Tests graceful handling of missing ctx.ui
- **Extended**: `pi-extension-e2e.test.ts`
  - Added luca-commands.ts to loading tests and loadAllExtensions
  - Updated luca-memory events count to 2
  - Added slash commands section (2 tests)
  - Added before_agent_start section (3 tests)
  - Added safety confirm/abort section (5 tests)
- **Extended**: `pi-workflow-extensions.test.ts`
  - Added before_agent_start event subscription test
  - Added event count validation (2 handlers)

### Task 9: Build and drift check

- `bun run build:all` -- 24 extensions deployed (up from 23)
- `bun run check:drift` -- no drift detected
- `bunx --bun tsc --noEmit` -- no type errors

## Files Modified/Created

| File                                                      | Change                                     |
| --------------------------------------------------------- | ------------------------------------------ |
| `src/hooks/pi-extensions/luca-commands.ts`                | **NEW**: 6 slash commands                  |
| `src/hooks/pi-extensions/luca-subagents.ts`               | ctx.ui.notify in onComplete + catch        |
| `src/hooks/pi-extensions/luca-harness.ts`                 | ctx.ui.notify after verification           |
| `src/hooks/pi-extensions/luca-safety-rules.ts`            | ctx.ui.confirm + ctx.abort + ctx.ui.notify |
| `src/hooks/pi-extensions/luca-memory.ts`                  | before_agent_start handler                 |
| `scripts/build-shared.ts`                                 | luca-commands in PI_EXTENSION_FILES        |
| `.pi/settings.json`                                       | luca-commands in extensions                |
| `.pi/extensions/luca-commands.ts`                         | Deployed copy                              |
| `.pi/extensions/luca-memory.ts`                           | Deployed copy (updated)                    |
| `.pi/extensions/luca-harness.ts`                          | Deployed copy (updated)                    |
| `.pi/extensions/luca-safety-rules.ts`                     | Deployed copy (updated)                    |
| `.pi/extensions/luca-subagents.ts`                        | Deployed copy (updated)                    |
| `__tests__/src/hooks/pi-extensions/luca-commands.test.ts` | **NEW**: 15 tests                          |
| `__tests__/src/hooks/pi-extension-e2e.test.ts`            | Extended: 10 new tests                     |
| `__tests__/src/hooks/pi-workflow-extensions.test.ts`      | Extended: 2 new tests                      |

## Verification Results

- `bunx --bun tsc --noEmit`: PASS (0 errors)
- `bun test __tests__/src/hooks/pi-extensions/luca-commands.test.ts`: 15/15 pass
- `bun test __tests__/src/hooks/pi-workflow-extensions.test.ts`: 87/87 pass (72 existing + 15 new + 2 updated)
- `bun run build:all`: SUCCESS (24 extensions)
- `bun run check:drift`: No drift

## Commits

1. `5c69f69` feat(framework): #29 create luca-commands.ts with 6 slash commands
2. `114918b` feat(framework): #29 add ctx.ui.notify() to luca-subagents.ts
3. `20ec7ba` feat(framework): #29 add ctx.ui.notify() to luca-harness.ts
4. `2e2e8f4` feat(framework): #29 add ctx.ui.confirm() and ctx.abort() to safety rules
5. `02926b7` feat(framework): #29 add before_agent_start handler to luca-memory.ts
6. `c3967e1` feat(framework): #29 register luca-commands.ts in build pipeline
7. `e90af62` feat(framework): #29 add tests for Plan 70-B slash commands and safety UI
8. `637d7a4` feat(framework): #29 build output + test type fixes for Plan 70-B
