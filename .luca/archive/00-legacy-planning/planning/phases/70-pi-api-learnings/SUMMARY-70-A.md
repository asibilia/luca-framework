# SUMMARY: Plan 70-A — Critical Fixes + Core Infrastructure

## Status: COMPLETE

## Changes Made

### Task 1: --no-extensions flag

- **File**: `src/hooks/pi-extensions/__helpers/spawn.ts`
- Added `"--no-extensions"` to the `args` array in `spawnPiSubprocess()`
- All subagent spawning (luca-subagents, luca-teams, luca-purpose-gating) automatically benefits

### Task 2: onComplete callback in SpawnOptions

- **File**: `src/hooks/pi-extensions/__helpers/spawn.ts`
- Added `SpawnCompletionInfo` interface and `onComplete` optional callback to `SpawnOptions`
- Wired callback invocation in both `proc.on("close")` and `proc.on("error")` handlers
- Errors inside callback are silently caught (never crashes process handler)

### Task 3: sendMessage in luca-subagents.ts

- **File**: `src/hooks/pi-extensions/luca-subagents.ts`
- Wired `onComplete` with `pi.sendMessage()` in `luca_subagent_create`
- Wired `onComplete` with `pi.sendMessage()` in `luca_subagent_continue`
- Uses `customType: "subagent-result"` and `deliverAs: "followUp"`

### Task 4: sendMessage in luca-teams.ts

- **File**: `src/hooks/pi-extensions/luca-teams.ts`
- Wired `onComplete` in `luca_dispatch_team` background spawn loop
- Uses `customType: "team-result"` and `deliverAs: "followUp"`

### Task 5: sendMessage in luca-purpose-gating.ts

- **File**: `src/hooks/pi-extensions/luca-purpose-gating.ts`
- Wired `onComplete` in `luca_trigger_deferred` auto_spawn path
- Uses `customType: "background-result"` and `deliverAs: "followUp"`

### Task 6: Unit tests for onComplete

- **File**: `__tests__/src/hooks/pi-extensions/__helpers/spawn-callback.test.ts`
- 4 tests: callback fires with correct fields, callback errors caught, backward compat, status/exitCode mapping
- All pass

### Task 7: E2E test updates

- **File**: `__tests__/src/hooks/pi-workflow-extensions.test.ts`
- 7 new tests verifying --no-extensions flag, sendMessage wiring, deliverAs: "followUp" consistency
- All pass

### Task 8: Build and drift check

- `bun run build:all -- --force` succeeded
- `bun run check:drift` reports no drift
- 231 non-E2E hook tests pass (30 E2E failures are pre-existing: `luca-work-tracking.ts` not in `PI_EXTENSION_FILES`)

## Verification Results

| Check                     | Result                      |
| ------------------------- | --------------------------- |
| `bunx --bun tsc --noEmit` | PASS (no type errors)       |
| `bun test` (source-based) | 231 pass, 0 fail            |
| `bun run build:all`       | PASS                        |
| `bun run check:drift`     | No drift                    |
| --no-extensions in args   | Verified                    |
| onComplete fires on exit  | Verified (unit tests)       |
| deliverAs: "followUp"     | Verified (all 3 extensions) |

## Pre-existing Issue Noted

- `luca-work-tracking.ts` exists in source but is NOT in `PI_EXTENSION_FILES` in `scripts/build-shared.ts`
- This causes 30 E2E test failures when importing from `.pi/extensions/luca-work-tracking.ts`
- Not in scope for Plan 70-A; tracked for future fix

## Commits (7 total)

1. `ea33e61` feat(framework): #29 add --no-extensions flag to subagent spawning
2. `3496d95` feat(framework): #29 add onComplete callback to SpawnOptions
3. `60515a0` feat(framework): #29 wire sendMessage auto-delivery in luca-subagents
4. `603a00e` feat(framework): #29 wire sendMessage auto-delivery in luca-teams
5. `09f833f` feat(framework): #29 wire sendMessage auto-delivery in luca-purpose-gating
6. `74d4790` test(framework): #29 add unit tests for onComplete callback in spawn.ts
7. `0f450d0` test(framework): #29 add E2E tests for --no-extensions and sendMessage
