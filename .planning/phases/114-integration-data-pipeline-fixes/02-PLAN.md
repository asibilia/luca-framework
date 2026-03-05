---
id: 114-02
title: "Integration Wiring — Harness Pipeline, useLedger Fix, Double Write Removal"
wave: 2
phase: 114
gap_closure: true
---

# Wave 2 — Integration Wiring: Harness Pipeline, useLedger Fix, Double Write Removal

**Ticket:** #44
**Depends on:** Wave 1 (01-PLAN.md) — shared config must be in place before wiring new reducer calls
**Complexity:** MODERATE (5 files, feature-scoped)

## Objective

Wire the remaining integration gaps and fix data pipeline correctness issues:

1. **Harness -> SpacetimeDB pipeline** — The harness runner writes `harness-result.json` but never sends results to SpacetimeDB. The `update_harness_result` reducer exists but is never called. This means the observer dashboard has no visibility into harness results.
2. **useLedger inverted field mapping** — The `useLedger` hook maps `row.action` to `current_state` and `row.result` to `event_type`, which is backwards. Also, `timestamp` is hardcoded to `""` instead of converting `row.timestamp`.
3. **Double ledger write in bridge.ts** — The `handleTransition` function calls `callReducer("append_ledger_entry", ...)` at line 713 AND then calls `appendLedgerEntry(record)` at line 738. The `appendLedgerEntry` function (in `ledger.ts`) itself calls `callReducer("append_ledger_entry", ...)` internally, resulting in two reducer calls with different payload shapes per transition. The same pattern exists for `handleSetField` at line 624.

## Context

- @file `src/harness/__helpers/runner.ts` — Harness runner, writes JSON result at lines 252-274 but never calls SpacetimeDB
- @file `packages/luca-observer/module_bindings/update_harness_result_reducer.ts` — SpacetimeDB-generated reducer binding: expects `{ passed, totalErrors, totalWarnings, checksJson, timestamp }`
- @file `packages/luca-observer/hooks/use-ledger.ts` — useLedger hook with inverted field mapping at lines 31-42
- @file `packages/luca-framework/src/state/bridge.ts` — Double write at lines 712-740 (transition) and line 624 (set-field)
- @file `packages/luca-framework/src/state/ledger.ts` — `appendLedgerEntry()` at line 177 already calls `callReducer("append_ledger_entry", ...)`
- @file `packages/luca-framework/src/state/__helpers/observer-emitter.ts` — `callReducer()` function used for all SpacetimeDB writes (uses camelCase to match module_bindings)
- @file `packages/luca-framework/src/state/__helpers/stdb-config.ts` — Shared config created in Wave 1

---

## Task 2.1: Wire harness runner to SpacetimeDB via `update_harness_result` reducer

**File:** `src/harness/__helpers/runner.ts`

After the harness writes `harness-result.json` (line 271), add a `callReducer("update_harness_result", ...)` call to send results to SpacetimeDB.

**Import needed:**

```typescript
import { callReducer } from "~/shared/__helpers/observer-emitter";
```

**Note on import path:** The harness domain is T1, and `callReducer` lives in `packages/luca-framework/src/state/__helpers/observer-emitter.ts`. However, the harness is in `src/harness/` (the top-level `src/` domain structure), not in `packages/luca-framework/src/`. The import path must be determined by checking how the harness currently imports from shared domains.

Check `runner.ts` line 23: it already imports from `~/shared/__helpers/validation-utils`, confirming that `~/` path alias works. However, `callReducer` is in `packages/luca-framework/src/state/` which is a separate package. The correct approach is to either:

- (a) Import `callReducer` from the `luca-framework` package if it's exported via barrel, OR
- (b) Call the reducer directly using a lightweight fetch call (avoiding cross-package import)

Since the harness already uses `Bun.write` for best-effort persistence, add a similar best-effort reducer call inline using `fetch()` directly, reusing the `stdb-config.ts` constants via a new export from the harness barrel, OR import `callReducer` if the module boundary permits.

**Preferred approach:** Since `callReducer` is exported from `packages/luca-framework/src/state/index.ts` (line 157) and the harness is in `src/harness/` which is T1 Core, importing from `packages/luca-framework/` would cross package boundaries. Instead, create a minimal inline fire-and-forget function within the runner, OR re-export `callReducer` to be accessible. Given the architecture constraints, the simplest correct approach is to inline a minimal reducer call:

```typescript
// After Bun.write for harness-result.json (inside the try block, after line 271):
// Fire-and-forget: send to SpacetimeDB for observer dashboard
try {
  const stdbUrl =
    process.env.LUCA_SPACETIMEDB_URL ||
    process.env.LUCA_OBSERVER_URL ||
    "http://localhost:3000";
  const dbName = process.env.LUCA_SPACETIMEDB_DB || "luca-observer";
  const reducerUrl = `${stdbUrl.replace(/\/+$/, "")}/v1/database/${dbName}/call/update_harness_result`;
  fetch(reducerUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      passed: result.status === "passed",
      totalErrors: result.totalErrors,
      totalWarnings: result.totalWarnings,
      checksJson: JSON.stringify(result.checks),
      timestamp: Date.now(),
    }),
    signal: AbortSignal.timeout(2000),
  }).catch(() => {
    // Best-effort — SpacetimeDB may not be running
  });
} catch {
  // Best-effort — never fail the harness run
}
```

**Note on field names:** The SpacetimeDB module_bindings define all table schemas using camelCase field names (e.g., `totalErrors`, `totalWarnings`, `checksJson`). The payload must use camelCase to match. The `api-snake-case` rule applies to REST API boundaries, not SpacetimeDB reducer calls where the backend schema dictates the format. Plain numbers are used instead of `BigInt()` because `JSON.stringify` cannot serialize `BigInt` values (throws `TypeError`).

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `bun test __tests__/scripts/` passes (harness tests)
- Manual: run harness with SpacetimeDB running, verify `update_harness_result` reducer receives the call (check SpacetimeDB logs)
- Manual: run harness WITHOUT SpacetimeDB, verify harness still completes without error

---

## Task 2.2: Fix useLedger inverted field mapping

**File:** `packages/luca-observer/hooks/use-ledger.ts` lines 31-42

**Current (WRONG):**

```typescript
return {
  previous_state: "",
  current_state: row.action, // WRONG: action is the event type
  event_type: row.result, // WRONG: result is the state
  event_data: eventData,
  actions_executed: [] as string[],
  context: {} as Record<string, unknown>,
  timestamp: "", // WRONG: should convert row.timestamp
  session_id: row.sessionId,
  sequence_number: Number(row.sequenceNumber),
  parent_id: null,
};
```

**Fix:**

```typescript
return {
  previous_state: "",
  current_state: row.result, // CORRECT: result is the current state
  event_type: row.action, // CORRECT: action is the event type
  event_data: eventData,
  actions_executed: [] as string[],
  context: {} as Record<string, unknown>,
  timestamp: row.timestamp ? new Date(Number(row.timestamp)).toISOString() : "", // CORRECT: convert SpacetimeDB timestamp
  session_id: row.sessionId,
  sequence_number: Number(row.sequenceNumber),
  parent_id: null,
};
```

**Rationale:**

- The `append_ledger_entry` reducer (as seen in `bridge.ts:717` and `ledger.ts:181`) sets `action` to the event type (e.g., `"transition:START_PHASE"`) and `result` to the current state value (e.g., `"executing"`)
- The `useLedger` hook had these swapped, causing the observer dashboard to show event types where states should be and vice versa
- `row.timestamp` is a SpacetimeDB `u64` (Unix timestamp in milliseconds). Converting via `new Date(Number(row.timestamp)).toISOString()` produces a proper ISO 8601 string

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Manual: observer dashboard ledger page shows correct event_type and current_state values
- Verify `row.timestamp` is indeed a numeric field by checking the SpacetimeDB `ledger_entries` table schema in `module_bindings/types.ts`

---

## Task 2.3: Remove double ledger write in bridge.ts handleTransition

**File:** `packages/luca-framework/src/state/bridge.ts` lines 712-740

**Problem:** Two separate ledger write paths fire per transition:

1. **Line 712-725:** Direct `callReducer("append_ledger_entry", {...})` with raw transition data
2. **Line 737-740:** `appendLedgerEntry(record)` which internally (in `ledger.ts:177`) ALSO calls `callReducer("append_ledger_entry", {...})` with a different payload shape, plus writes to local JSONL file

This creates duplicate SpacetimeDB entries with conflicting payloads.

**Fix:** Remove the direct `callReducer` call at lines 712-725. Keep the `appendLedgerEntry(record)` call at line 738, which is the canonical ledger write path that handles both SpacetimeDB AND local file backup.

The `appendLedgerEntry` function in `ledger.ts`:

- Generates sequence numbers
- Validates via Zod schema
- Calls `callReducer("append_ledger_entry", ...)` with the proper payload
- Writes to local JSONL file as backup

By keeping only `appendLedgerEntry`, we get a single write path with proper sequence numbers, validation, and backup.

**Code change:**

Remove lines 712-725:

```typescript
// DELETE THIS BLOCK:
// Fire-and-forget: append ledger entry for this transition
callReducer("append_ledger_entry", {
  sessionId: nextSnapshot.context.session_id ?? "",
  phase: String(nextSnapshot.context.current_phase ?? ""),
  plan: "",
  action: `transition:${eventType}`,
  result: String(nextSnapshot.value),
  timestamp: Date.now(),
  detailsJson: JSON.stringify({
    from: String(prevState),
    to: String(nextSnapshot.value),
    event: eventType,
  }),
});
```

The `appendLedgerEntry(record)` call at line 738 already handles the write correctly.

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `grep -c "append_ledger_entry" packages/luca-framework/src/state/bridge.ts` returns `0` (the callReducer call is removed; the remaining `appendLedgerEntry` function call is a different identifier)
- `bun test __tests__/packages/luca-framework/src/state/` passes
- Manual: trigger a state transition, verify only ONE ledger entry appears in SpacetimeDB (not two)

---

## Task 2.4: Audit handleSetField for similar double write pattern

**File:** `packages/luca-framework/src/state/bridge.ts` line 624

Check whether `handleSetField` also has a double write. From the research:

- Line 624: `appendLedgerEntry(fieldRecord).catch(...)` — this calls the `appendLedgerEntry` function which internally calls `callReducer`
- There is NO preceding direct `callReducer("append_ledger_entry", ...)` before line 624 for the set-field path

**Expected result:** No fix needed for set-field — it uses only the canonical `appendLedgerEntry` path. Verify and confirm.

**Verification:**

- Read lines 590-630 of bridge.ts
- Confirm there is exactly ONE write path for field_set ledger entries (the `appendLedgerEntry` call at line 624)
- If a second write exists, remove it following the same pattern as Task 2.3

---

## Task 2.5: Verify ledger_entries table schema matches useLedger expectations

**File:** `packages/luca-observer/module_bindings/types.ts`

Verify that the SpacetimeDB `ledger_entries` table (or its generated TypeScript type) includes the fields used by `useLedger`: `action`, `result`, `timestamp`, `sessionId`, `sequenceNumber`, `detailsJson`.

If any field names differ (e.g., the SpacetimeDB schema uses different names), update `useLedger` mapping accordingly.

**Verification:**

- Read the LedgerEntries type from module_bindings
- Confirm all fields referenced in `useLedger` exist on the row type
- `bunx --bun tsc --noEmit` passes (type errors would reveal mismatches)

---

## Success Criteria

1. **Harness -> SpacetimeDB pipeline:** After running the harness, the `update_harness_result` reducer is called with `{ passed, totalErrors, totalWarnings, checksJson, timestamp }` in camelCase format matching SpacetimeDB module_bindings
2. **useLedger correctness:** `event_type` maps to `row.action`, `current_state` maps to `row.result`, `timestamp` converts `row.timestamp` to ISO string
3. **No double ledger write:** Each transition produces exactly ONE `append_ledger_entry` reducer call (via `appendLedgerEntry` function), not two
4. **Backward compatibility:** Local JSONL ledger backup still works (handled by `appendLedgerEntry`)
5. **Type check passes:** `bunx --bun tsc --noEmit` clean
6. **Tests pass:** `bun test __tests__/packages/luca-framework/src/state/` and `bun test __tests__/scripts/` green
7. **Best-effort resilience:** Harness completes successfully even when SpacetimeDB is unavailable

## Complexity: MODERATE

- 3-4 files modified (runner.ts, use-ledger.ts, bridge.ts, possibly module_bindings verification)
- Low-to-medium risk: removing the duplicate write is a deletion, field mapping fix is mechanical, harness wiring is additive and best-effort
- The most sensitive change is the double-write removal — requires testing to verify no data loss
