# Phase 113 — Framework Data Safety Hardening

**Ticket:** #44
**Todos:** #31 (silent reducer data loss), #33 (SQL injection risk)
**Depends on:** Phase 111 (complete)
**Complexity:** MODERATE (3-5 files, feature-scoped)

## Goal

Eliminate two P0 data-safety risks identified by audit:

1. **Silent data loss** — SpacetimeDB reducer calls and bridge reads silently swallow errors, losing observability data with zero operator visibility.
2. **SQL injection surface** — Ledger query builder uses string interpolation with only single-quote escaping. Strict input validation already exists (`validateLedgerFilters`) but needs to be fully enforced and the residual `.replace(/'/g, "''")` escaping made defense-in-depth rather than primary defense.

## Goal-Backward Analysis

**End state:** Every SpacetimeDB call site either logs failures (always) and retries (for reducers), or provides `LUCA_DEBUG` verbose output for read fallbacks. SQL queries only accept pre-validated, format-constrained inputs.

**What blocks the end state?**

- `callReducer` in observer-emitter.ts already has retry + LUCA_DEBUG logging (added previously). Verify completeness.
- bridge.ts has 6+ `catch` blocks on SpacetimeDB reads that already log under `LUCA_DEBUG`. Verify all are covered.
- ledger.ts already calls `validateLedgerFilters()` before building SQL. The `.replace(/'/g, "''")` on lines 335-346 is now defense-in-depth. Verify test coverage.
- Existing test file `ledger-sql-safety.test.ts` covers the validation layer. May need expansion for edge cases.

## Context References

- `packages/luca-framework/src/state/__helpers/observer-emitter.ts` — fire-and-forget reducer calls
- `packages/luca-framework/src/state/bridge.ts` — SpacetimeDB read fallback catch blocks
- `packages/luca-framework/src/state/ledger.ts` — SQL query builder with `validateLedgerFilters()`
- `__tests__/packages/luca-framework/src/state/ledger-sql-safety.test.ts` — existing SQL safety tests
- `__tests__/packages/luca-framework/src/state/ledger-spacetimedb.test.ts` — existing SpacetimeDB path tests
- `src/memory/__helpers/bridge.ts` — memory bridge (may have similar patterns)

---

## Wave 1 — Error Logging + Retry Audit (#31)

### Task 1.1: Audit and harden observer-emitter.ts error handling

**File:** `packages/luca-framework/src/state/__helpers/observer-emitter.ts`

**Current state:** `callReducer()` (lines 103-123) already has:

- LUCA_DEBUG logging on first failure (line 104-109)
- Single retry after 1s delay (line 111-112)
- LUCA_DEBUG logging on retry failure (line 116-121)

**Work needed:**

- Add unconditional `console.error` for retry failures (not just LUCA_DEBUG-gated). When the retry also fails, this represents actual data loss — operators must always see it.
- The first failure can remain LUCA_DEBUG-only since it triggers a retry.
- Verify the `signal: AbortSignal.timeout(2000)` is applied to both attempts (it is).

**Verification:**

- `bun test __tests__/packages/luca-framework/src/state/__helpers/` passes
- TypeScript compiles: `bunx --bun tsc --noEmit`
- Manual review: retry failure always logs, first failure logs under LUCA_DEBUG

### Task 1.2: Audit bridge.ts SpacetimeDB read fallback logging

**File:** `packages/luca-framework/src/state/bridge.ts`

**Current state:** All read handlers (handleReadComplexity, handleReadOversight, handleReadPhase, handleReadStatus, handleReadField) already have:

- `catch (err)` blocks that check `process.env.LUCA_DEBUG`
- `console.error("[bridge] SpacetimeDB unavailable for <cmd>, falling back to JSON:", err.message)`

**Work needed:**

- Verify ALL SpacetimeDB read paths have LUCA_DEBUG logging (lines 162-168, 212-218, 269-275, 376-382, 450-456, 548-554).
- Check `handleSetField` read path (line 548) and `handleResumePhase` read path (line 1052).
- If any catch blocks are bare/empty, add the LUCA_DEBUG pattern.
- The `handleResumePhase` catch block at line 1052-1058 already has LUCA_DEBUG logging.

**Verification:**

- Grep: every `catch` in bridge.ts that follows a SpacetimeDB query includes LUCA_DEBUG logging
- `bunx --bun tsc --noEmit` passes
- No behavioral change for non-debug mode

### Task 1.3: Add LUCA_DEBUG logging to memory bridge catch blocks

**File:** `src/memory/__helpers/bridge.ts`

**Work needed:**

- Scan for empty catch blocks on SpacetimeDB read paths
- Apply the same `if (process.env.LUCA_DEBUG)` pattern from state bridge
- Keep fire-and-forget semantics (never block the caller)

**Verification:**

- Grep: no bare `catch {}` or `catch () => {}` in memory bridge SpacetimeDB paths
- `bunx --bun tsc --noEmit` passes

---

## Wave 2 — SQL Validation Hardening + Tests (#33)

### Task 2.1: Verify ledger.ts SQL safety is complete

**File:** `packages/luca-framework/src/state/ledger.ts`

**Current state:**

- `validateLedgerFilters()` (lines 254-297) validates all filter inputs:
  - `session_id`: regex `^[a-zA-Z0-9_-]+$` — rejects SQL metacharacters
  - `event_type`: allowlist of known types — no injection possible
  - `since`: ISO8601 regex — rejects arbitrary strings
  - `limit`/`tail`: integer range validation 1-1000
- `readLedger()` calls `validateLedgerFilters()` BEFORE building SQL (line 328)
- `.replace(/'/g, "''")` on lines 335, 340, 345 is now defense-in-depth (belt-and-suspenders)

**Work needed:**

- Confirm that `readLedger()` ALWAYS calls `validateLedgerFilters()` before SQL construction (it does, line 328).
- Add a code comment clarifying the `.replace()` is defense-in-depth, not primary defense.
- Consider: should `handleResumePhase` (bridge.ts line 1047) which interpolates `phaseId` into SQL also validate? `phaseId` is parsed as `parseInt(phaseStr, 10)` (line 1035-1038) — integer-only, safe. Add a comment noting this.

**Verification:**

- Code review: every SQL string interpolation is preceded by validation
- `bunx --bun tsc --noEmit` passes

### Task 2.2: Expand SQL safety test coverage

**File:** `__tests__/packages/luca-framework/src/state/ledger-sql-safety.test.ts`

**Current state:** 22 tests covering session_id, event_type, since, limit, tail, and combined filters.

**Work needed:**

- Add tests for edge cases not yet covered:
  - Unicode injection attempts in session_id
  - Double-encoding attacks (`%27` in session_id)
  - Null byte injection (`session_id: "abc\x00def"`)
  - Extremely long session_id strings (> 256 chars)
  - event_type with casing variations (e.g., "start" vs "START")
- Add integration-style test: call `readLedger()` with malicious filters and verify it throws before making any fetch call

**Verification:**

- `bun test __tests__/packages/luca-framework/src/state/ledger-sql-safety.test.ts` — all tests pass
- New tests cover the documented edge cases

### Task 2.3: Add readLedger integration test for SQL injection prevention

**File:** `__tests__/packages/luca-framework/src/state/ledger-spacetimedb.test.ts` (extend existing)

**Work needed:**

- Add a test that verifies `readLedger({ session_id: "'; DROP TABLE --" })` throws from `validateLedgerFilters` BEFORE any fetch call is made
- Add a test that verifies `readLedger({ event_type: "malicious_event" })` throws before fetch

**Verification:**

- `bun test __tests__/packages/luca-framework/src/state/ledger-spacetimedb.test.ts` — all tests pass
- Verify fetch mock was NOT called for rejected inputs

---

## Success Criteria

1. **No silent data loss:** `callReducer` retry failure always logs to stderr (not gated by LUCA_DEBUG)
2. **Full LUCA_DEBUG coverage:** Every SpacetimeDB catch block in bridge.ts and memory bridge has LUCA_DEBUG logging
3. **SQL injection defense-in-depth:** `validateLedgerFilters()` is the primary defense; `.replace()` is explicitly documented as secondary
4. **Test coverage:** SQL safety test file covers Unicode, null bytes, double-encoding, and length edge cases
5. **Integration test:** `readLedger()` with malicious input throws before reaching fetch
6. **All tests pass:** `bun test __tests__/packages/luca-framework/src/state/` green
7. **Type check passes:** `bunx --bun tsc --noEmit` clean

## Complexity: MODERATE

- 3-5 files touched (observer-emitter.ts, bridge.ts, ledger.ts, 2 test files)
- No architectural changes — tightening existing patterns
- Low risk: additive logging + additive tests + documentation comments
