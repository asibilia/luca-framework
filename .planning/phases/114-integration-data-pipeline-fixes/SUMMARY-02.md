# Wave 2 Summary — Integration Wiring: Harness Pipeline, useLedger Fix, Double Write Removal

**Phase:** 114
**Wave:** 2
**Ticket:** #44
**Branch:** `44--v2.7.0-observability-verification`

## Changes Made

### 1. Harness -> SpacetimeDB Pipeline (Task 2.1)

**File:** `src/harness/__helpers/runner.ts`

Added fire-and-forget fetch call to the `update_harness_result` reducer after the harness writes `harness-result.json`. The call uses camelCase field names matching the SpacetimeDB module_bindings schema (`passed`, `totalErrors`, `totalWarnings`, `checksJson`, `timestamp`). The call is wrapped in try/catch with a 2-second timeout and `.catch()` on fetch, ensuring the harness never fails due to SpacetimeDB being unavailable.

Uses `fetch()` directly rather than importing `callReducer` from `packages/luca-framework/`, since the harness lives in `src/harness/` (a different domain) and importing from `packages/` would violate module boundary rules.

### 2. useLedger Inverted Field Mapping Fix (Task 2.2)

**File:** `packages/luca-observer/hooks/use-ledger.ts`

Fixed the inverted field mapping:

- `current_state` now correctly maps to `row.result` (was incorrectly mapped to `row.action`)
- `event_type` now correctly maps to `row.action` (was incorrectly mapped to `row.result`)
- `timestamp` now converts `row.timestamp` (SpacetimeDB `u64`) to ISO 8601 string via `new Date(Number(row.timestamp)).toISOString()` (was hardcoded to `""`)

### 3. Double Ledger Write Removal (Task 2.3)

**File:** `packages/luca-framework/src/state/bridge.ts`

Removed the direct `callReducer("append_ledger_entry", ...)` block in `handleTransition` (was lines 712-725). This was causing a double write because `appendLedgerEntry(record)` (called at line 738) internally also calls `callReducer("append_ledger_entry", ...)` with a properly structured payload including sequence numbers. Each transition now produces exactly one ledger entry via the canonical `appendLedgerEntry` function which handles:

- Sequence number generation
- Zod schema validation
- SpacetimeDB reducer call
- Local JSONL file backup

### 4. handleSetField Audit (Task 2.4)

**Finding:** No fix needed. `handleSetField` uses only the canonical `appendLedgerEntry(fieldRecord)` path. The `callReducer("update_workflow_state", ...)` call is for workflow state updates, not ledger writes.

### 5. Schema Verification (Task 2.5)

**Finding:** All fields referenced in `useLedger` exist on the SpacetimeDB `LedgerEntries` type: `action` (string), `result` (string), `timestamp` (u64), `sessionId` (string), `sequenceNumber` (u64), `detailsJson` (string).

## Verification Results

| Check                                                   | Result                  |
| ------------------------------------------------------- | ----------------------- |
| `bunx --bun tsc --noEmit`                               | PASS (clean, no errors) |
| `bun test __tests__/packages/luca-framework/src/state/` | 157 pass, 0 fail        |
| `bun test __tests__/scripts/`                           | 114 pass, 0 fail        |

## Success Criteria Status

| Criterion                             | Status                                |
| ------------------------------------- | ------------------------------------- |
| Harness -> SpacetimeDB pipeline wired | DONE                                  |
| useLedger correctness fixed           | DONE                                  |
| No double ledger write                | DONE                                  |
| Local JSONL backup still works        | DONE (appendLedgerEntry handles both) |
| Type check passes                     | DONE                                  |
| Tests pass                            | DONE                                  |
| Best-effort resilience                | DONE                                  |

## Commits

1. `124e145` — feat(harness): #44 wire harness runner to SpacetimeDB via update_harness_result reducer
2. `76d4dfc` — fix(observer): #44 correct inverted field mapping in useLedger hook
3. `a80c54c` — fix(state): #44 remove double ledger write in handleTransition
