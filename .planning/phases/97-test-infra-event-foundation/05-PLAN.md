---
id: "97-05"
title: "Ledger bridge CLI integration"
phase: 97
wave: 2
complexity: MODERATE
depends_on: ["97-04"]
tasks:
  - id: "97-05-1"
    title: "Add read-ledger subcommand to bridge CLI"
    goal: "Enable reading ledger entries via bridge.ts CLI with filter arguments"
    verify: "bun run packages/luca-framework/src/state/bridge.ts read-ledger outputs JSON"
  - id: "97-05-2"
    title: "Wire ledger append into handleTransition"
    goal: "Automatically append ledger entry after every successful state transition"
    verify: "After bridge transition, session-ledger.jsonl contains the new entry"
  - id: "97-05-3"
    title: "Wire ledger append into handleSetField"
    goal: "Optionally record field-set operations in the ledger as field_set events"
    verify: "After bridge set-field, session-ledger.jsonl contains a field_set entry"
  - id: "97-05-4"
    title: "Write integration tests for bridge-ledger wiring"
    goal: "Test that bridge transitions produce ledger entries end-to-end"
    verify: "bun test __tests__/packages/luca-framework/src/state/bridge-ledger.test.ts passes"
  - id: "97-05-5"
    title: "Final verification"
    goal: "Run full type check and test suite to confirm no regressions"
    verify: "bunx --bun tsc --noEmit passes; bun test passes"
---

# 97-05: Ledger Bridge CLI Integration

## Goal

Wire the session ledger into the bridge CLI so that (a) every state transition automatically appends to the ledger, and (b) a new `read-ledger` subcommand allows querying the ledger from the command line. This completes the todo #6 specification by making the ledger operational within the existing bridge workflow.

## Context

@packages/luca-framework/src/state/bridge.ts -- Bridge CLI with `runBridgeCli()` dispatcher (line 888)
@packages/luca-framework/src/state/bridge.ts -- `handleTransition()` (lines 461-524) -- primary integration point
@packages/luca-framework/src/state/bridge.ts -- `handleSetField()` (lines 362-448) -- secondary integration point
@packages/luca-framework/src/state/ledger.ts -- `appendLedgerEntry()`, `readLedger()` (created in Plan 97-04)
@packages/luca-framework/src/state/events.ts -- `buildTransitionRecord()` (lines 103-123)
@packages/luca-framework/src/state/observer-emitter.ts -- `emitObserverEvent()` -- already called after transitions

**Data flow after integration:**

```
State Machine Transition
  -> bridge.ts handleTransition()
    -> persistActor() (state.json)
    -> appendLedgerEntry() (session-ledger.jsonl)  [NEW]
    -> emitObserverEvent() (HTTP POST to observer)  [EXISTING, if URL set]
    -> updateStateMd() (STATE.md)
    -> console.log(record)
```

**Bridge CLI additions:**

- `read-ledger` subcommand with `--session`, `--event`, `--since`, `--limit`, `--tail` arguments

## Tasks

### Task 97-05-1: Add read-ledger subcommand to bridge CLI

Add a `read-ledger` case to the `runBridgeCli` switch and implement the handler function.

**File:** `packages/luca-framework/src/state/bridge.ts`

**Steps:**

1. Add import at the top of `bridge.ts`:

   ```typescript
   import { readLedger, appendLedgerEntry } from "./ledger";
   import type { LedgerFilters } from "./ledger";
   ```

2. Add the `handleReadLedger` function before `runBridgeCli`:

   ```typescript
   // ─── Ledger Commands ──────────────────────────────────────────────────────

   /**
    * Read and output ledger entries with optional filters.
    *
    * Supported arguments:
    * - --session=<id>   Filter by session ID
    * - --event=<type>   Filter by event type
    * - --since=<iso>    Only entries after this timestamp
    * - --limit=<N>      Maximum entries to return
    * - --tail=<N>       Read last N entries (default: 20)
    *
    * @param args - CLI arguments
    */
   async function handleReadLedger(args: string[]): Promise<void> {
     const filters: LedgerFilters = {};

     const sessionArg = getArg(args, "session");
     if (sessionArg) filters.session_id = sessionArg;

     const eventArg = getArg(args, "event");
     if (eventArg) filters.event_type = eventArg;

     const sinceArg = getArg(args, "since");
     if (sinceArg) filters.since = sinceArg;

     const limitArg = getArg(args, "limit");
     if (limitArg) {
       const n = parseInt(limitArg, 10);
       if (!Number.isNaN(n) && n > 0) filters.limit = n;
     }

     const tailArg = getArg(args, "tail");
     if (tailArg) {
       const n = parseInt(tailArg, 10);
       if (!Number.isNaN(n) && n > 0) filters.tail = n;
     }

     // Default to tail=20 if no filters specified
     if (
       !filters.session_id &&
       !filters.event_type &&
       !filters.since &&
       filters.limit === undefined &&
       filters.tail === undefined
     ) {
       filters.tail = 20;
     }

     const entries = await readLedger(filters);
     console.log(JSON.stringify(entries, null, 2));
   }
   ```

3. Add case to the `runBridgeCli` switch (after the `resume-phase` case):

   ```typescript
   case "read-ledger":
     await handleReadLedger(args);
     break;
   ```

4. Export `handleReadLedger` so it can be imported from the barrel:
   Add `handleReadLedger` to the existing export list (alongside `handleReadComplexity`, etc.)

**Verify:**

- [ ] `handleReadLedger` function added to `bridge.ts`
- [ ] `read-ledger` case added to `runBridgeCli` switch
- [ ] Supports `--session`, `--event`, `--since`, `--limit`, `--tail` arguments
- [ ] Defaults to `tail=20` when no filters provided
- [ ] Outputs JSON array to stdout
- [ ] `handleReadLedger` exported from bridge.ts
- [ ] `bunx --bun tsc --noEmit` passes

### Task 97-05-2: Wire ledger append into handleTransition

After the transition record is built and logged, append it to the ledger.

**File:** `packages/luca-framework/src/state/bridge.ts`

**Steps:**

1. In `handleTransition()`, after line 523 (`console.log(JSON.stringify(record, null, 2))`), add ledger append:

   ```typescript
   // Append to session ledger (fire-and-forget, non-blocking)
   appendLedgerEntry(record).catch((err) => {
     console.error("[bridge] Failed to append ledger entry:", err);
   });
   ```

   The append is fire-and-forget with error logging. A failed ledger write should NOT block the transition or cause the bridge to exit with an error code. The state transition is already persisted to `state.json` and `STATE.md`.

2. The import from Task 97-05-1 already covers `appendLedgerEntry`.

**Note:** The `emitObserverEvent` call (if LUCA_OBSERVER_URL is set) happens inline in the `handleTransition` function or is called by the agent/skill that invoked the bridge. The ledger append happens at the bridge level to ensure every transition is recorded regardless of caller.

**Verify:**

- [ ] `appendLedgerEntry(record)` called after the transition record is built
- [ ] Error handling via `.catch()` -- logs error but does not crash
- [ ] Does not block the transition (fire-and-forget pattern)
- [ ] `bunx --bun tsc --noEmit` passes

### Task 97-05-3: Wire ledger append into handleSetField

Record field-set operations in the ledger as a special `field_set` event type.

**File:** `packages/luca-framework/src/state/bridge.ts`

**Steps:**

1. In `handleSetField()`, after the state is persisted and STATE.md is updated, build and append a ledger entry for the field change:

   ```typescript
   // Append field change to session ledger
   const fieldRecord: TransitionRecord = {
     previous_state: String(snapshot.value),
     current_state: String(snapshot.value), // State doesn't change on field set
     event_type: "field_set",
     event_data: { field: fieldName, value: fieldValue },
     actions_executed: [],
     context: {},
     timestamp: new Date().toISOString(),
     session_id: snapshot.context.session_id ?? "",
   };
   appendLedgerEntry(fieldRecord).catch((err) => {
     console.error(
       "[bridge] Failed to append ledger entry for field_set:",
       err,
     );
   });
   ```

2. Add the `TransitionRecord` type import if not already present:
   ```typescript
   import type { TransitionRecord } from "./types";
   ```

**Note:** For `field_set` events, `previous_state` and `current_state` are the same (field changes don't cause state transitions). The `event_data` contains the field name and value for auditability.

**Verify:**

- [ ] `handleSetField` appends a `field_set` ledger entry after successful field update
- [ ] `event_data` includes `field` and `value` keys
- [ ] Fire-and-forget with error logging (does not block)
- [ ] `previous_state` === `current_state` for field_set events
- [ ] `bunx --bun tsc --noEmit` passes

### Task 97-05-4: Write integration tests for bridge-ledger wiring

Create tests that verify the bridge correctly appends to the ledger during transitions.

**File:** `__tests__/packages/luca-framework/src/state/bridge-ledger.test.ts`

**Test approach:** These tests cannot easily invoke the full bridge CLI (which reads `Bun.argv`). Instead, test the `handleReadLedger` function by pre-populating a ledger file, and test the append wiring by verifying `appendLedgerEntry` produces correct entries when given transition records.

**Test cases:**

1. **read-ledger with default tail:**
   - Pre-populate a ledger file with 30 entries
   - Call `readLedger({ tail: 20 })` and verify 20 entries returned

2. **read-ledger with session filter:**
   - Pre-populate ledger with entries from 2 different sessions
   - Filter by `session_id` and verify only matching entries returned

3. **read-ledger with event type filter:**
   - Pre-populate ledger with mixed event types
   - Filter by `event_type: "START"` and verify

4. **read-ledger with since filter:**
   - Pre-populate entries across different timestamps
   - Filter with `since` and verify chronological filtering

5. **read-ledger with combined filters:**
   - Apply `session_id` + `event_type` + `limit` together

6. **Transition produces ledger entry:**
   - Create a `TransitionRecord` and call `appendLedgerEntry`
   - Read back and verify `sequence_number` and `parent_id` are correct

7. **Field set produces field_set entry:**
   - Create a `TransitionRecord` with `event_type: "field_set"`
   - Append and verify `event_data` contains field details

**Test setup:**

```typescript
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { writeFileSync, rmSync, existsSync } from "node:fs";

import {
  readLedger,
  appendLedgerEntry,
  _resetSequenceCounter,
} from "../../../../../packages/luca-framework/src/state/ledger";

import type { TransitionRecord } from "../../../../../packages/luca-framework/src/state/types";

const TEST_LEDGER = "/tmp/luca-bridge-ledger-test.jsonl";

function makeRecord(
  overrides: Partial<TransitionRecord> = {},
): TransitionRecord {
  return {
    previous_state: "idle",
    current_state: "preflight",
    event_type: "START",
    event_data: {},
    actions_executed: [],
    context: {},
    timestamp: new Date().toISOString(),
    session_id: "test-session",
    ...overrides,
  };
}

beforeEach(() => {
  if (existsSync(TEST_LEDGER)) rmSync(TEST_LEDGER);
  _resetSequenceCounter();
});

afterEach(() => {
  if (existsSync(TEST_LEDGER)) rmSync(TEST_LEDGER);
  _resetSequenceCounter();
});
```

**Verify:**

- [ ] Test file created at `__tests__/packages/luca-framework/src/state/bridge-ledger.test.ts`
- [ ] All test cases pass
- [ ] Tests use `/tmp/` paths (not real `.planning/`)
- [ ] Tests clean up temp files

### Task 97-05-5: Final verification

Run the complete verification suite to ensure no regressions.

**Steps:**

1. Type check the entire project:

   ```bash
   bunx --bun tsc --noEmit
   ```

2. Run all tests:

   ```bash
   bun test
   ```

3. Run ledger-specific tests:

   ```bash
   bun test __tests__/packages/luca-framework/src/state/
   ```

4. Verify the bridge CLI `read-ledger` subcommand works:

   ```bash
   bun run packages/luca-framework/src/state/bridge.ts read-ledger --tail=5
   ```

   (Should output `[]` if no ledger exists, or entries if one does)

5. Verify bridge CLI help still lists all commands (no regression in switch):
   ```bash
   bun run packages/luca-framework/src/state/bridge.ts
   ```
   (Should show unknown command error with available commands)

**Verify:**

- [ ] `bunx --bun tsc --noEmit` passes
- [ ] `bun test` passes (pre-existing failures acceptable)
- [ ] `bun test __tests__/packages/luca-framework/src/state/` passes (all state domain tests)
- [ ] `read-ledger` subcommand produces valid JSON output
- [ ] No new type errors, no new test failures

## Success Criteria

- [ ] `read-ledger` bridge subcommand with `--session`, `--event`, `--since`, `--limit`, `--tail` arguments
- [ ] Every `handleTransition` call appends to `session-ledger.jsonl`
- [ ] Every `handleSetField` call appends a `field_set` entry to the ledger
- [ ] Ledger append is fire-and-forget (does not block transitions)
- [ ] `handleReadLedger` exported from bridge and added to barrel
- [ ] Integration tests pass
- [ ] `bunx --bun tsc --noEmit` passes
- [ ] `bun test` passes (no new failures)
- [ ] Todo #6 fully implemented
