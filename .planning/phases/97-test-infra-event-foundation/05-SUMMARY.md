# Plan 97-05: Ledger Bridge CLI Integration

## Status: COMPLETE

## What Was Done

Wired the session ledger (created in Plan 97-04) into the bridge CLI so that every state transition and field mutation automatically appends to the ledger, and a new `read-ledger` subcommand enables querying the ledger from the command line.

### Task 97-05-1: read-ledger subcommand

- Added `handleReadLedger()` function to `bridge.ts` with support for 5 CLI filters: `--session`, `--event`, `--since`, `--limit`, `--tail`
- Defaults to `tail=20` when no filters are specified
- Added to `runBridgeCli()` switch, updated usage text and module docstring
- Exported `handleReadLedger` for programmatic use

### Task 97-05-2: Ledger append in handleTransition

- Added fire-and-forget `appendLedgerEntry(record)` call after the transition record is built via `buildTransitionRecord()`
- Failed ledger writes log to stderr but do not block the transition

### Task 97-05-3: Ledger append in handleSetField

- Added fire-and-forget `appendLedgerEntry()` call with `event_type: "field_set"` and `event_data: { field, value }`
- Uses the same state for both `previous_state` and `current_state` since field set does not change machine state
- Reads `session_id` from the updated context

### Task 97-05-4: Integration tests

- Created `__tests__/packages/luca-framework/src/state/bridge-ledger.test.ts` with 7 test cases:
  1. Default tail=20 behavior with 30 entries
  2. Session filter
  3. Event type filter
  4. Since timestamp filter
  5. Combined filters (session + event + since + limit)
  6. Transition ledger entry with correct sequence_number and parent_id
  7. field_set entry with correct event_data shape

### Task 97-05-5: Verification

- `bunx --bun tsc --noEmit` -- passes (zero errors)
- `bun test` -- 3197 pass, 0 fail
- `bun test __tests__/packages/luca-framework/src/state/` -- 38 pass, 0 fail (7 new + 31 existing)

## Files Changed

| File                                                                | Change                                                                                                               |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `packages/luca-framework/src/state/bridge.ts`                       | Added imports, `handleReadLedger()`, ledger wiring in `handleTransition` and `handleSetField`, updated exports/usage |
| `__tests__/packages/luca-framework/src/state/bridge-ledger.test.ts` | New file: 7 integration tests                                                                                        |

## Data Flow (Post-Integration)

```
State Machine Transition
  -> bridge.ts handleTransition()
    -> persistActor() (state.json)
    -> appendLedgerEntry() (session-ledger.jsonl)  [NEW]
    -> emitObserverEvent() (HTTP POST, if URL set) [EXISTING]
    -> updateStateMd() (STATE.md)
    -> console.log(record)

Field Set
  -> bridge.ts handleSetField()
    -> Bun.write(STATE_FILE_PATH) (state.json)
    -> updateStateMd() (STATE.md)
    -> appendLedgerEntry() (session-ledger.jsonl, event_type=field_set) [NEW]
    -> console.log(result)
```

## Todo #6: Fully Implemented

The session ledger is now operational within the bridge workflow:

- Every `handleTransition` call appends to `session-ledger.jsonl`
- Every `handleSetField` call appends a `field_set` entry
- `read-ledger` CLI subcommand enables querying with 5 filter options
- Ledger append is fire-and-forget (does not block transitions)
