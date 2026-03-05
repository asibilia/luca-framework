---
id: "03"
title: "Add Security Annotation to queryTable and Circuit Breaker Documentation to callReducer"
phase: 116
wave: 1
depends_on: []
---

# PLAN-116-C: Add Security Annotation to queryTable and Circuit Breaker Documentation to callReducer

## Objective

Add security-focused JSDoc annotations to `queryTable()` in `spacetimedb-client.ts` documenting the raw SQL interface and injection mitigation strategy, and add circuit breaker pattern documentation to `callReducer()` in `observer-emitter.ts` explaining the retry pattern, its limitations, and when a full circuit breaker would be warranted.

Source: `.planning/v2.7.0-MILESTONE-AUDIT.md` -- MEDIUM security/documentation findings.

## Context

@file packages/luca-framework/src/state/\_\_helpers/spacetimedb-client.ts -- Contains `queryTable<T>(sql: string)` at line 39 that accepts raw SQL. The function has SSRF protection (localhost-only validation) but no documentation about SQL injection risks or the mitigation strategy used by callers.

@file packages/luca-framework/src/state/\_\_helpers/observer-emitter.ts -- Contains `callReducer()` at lines 74-117 with a simple retry pattern (1 retry after 1s delay). The pattern is undocumented regarding its limitations and when a proper circuit breaker would be warranted.

@file packages/luca-framework/src/state/ledger.ts -- Contains `validateLedgerFilters()` (lines 255-301) and `VALID_EVENT_TYPES` (lines 212-233) which are the primary SQL injection mitigation mechanisms. All SQL queries in `readLedger()` use validated filter values.

@file packages/luca-framework/src/state/bridge.ts -- All callers of `queryOne()` / `queryTable()` use either static SQL strings or values validated via `parseInt()` (e.g., `phaseId` in `handleResumePhase`).

## Tasks

### Task 1: Add security annotation to `queryTable()`

**Goal:** Enhance the existing JSDoc on `queryTable()` with a `@security` annotation documenting the raw SQL interface, injection risks, and the mitigation strategy.

**File:** `packages/luca-framework/src/state/__helpers/spacetimedb-client.ts`

**Current JSDoc (lines 22-38):**

````typescript
/**
 * Execute a SQL query against SpacetimeDB and return all matching rows.
 *
 * Posts to `${url}/database/${dbName}/sql` with the query string.
 * Validates the URL is localhost before making the request.
 *
 * @param sql - The SQL query to execute
 * @returns Array of rows matching the query
 * @throws If the query fails or SpacetimeDB is unreachable
 *
 * @example
 * ```typescript
 * const entries = await queryTable<LedgerEntry>(
 *   "SELECT * FROM ledger_entries WHERE session_id = 'abc-123'"
 * );
 * ```
 */
````

**Target JSDoc:**

````typescript
/**
 * Execute a SQL query against SpacetimeDB and return all matching rows.
 *
 * Posts to `${url}/database/${dbName}/sql` with the query string.
 * Validates the URL is localhost before making the request.
 *
 * @security **Raw SQL Interface** -- This function passes the `sql` parameter
 * directly to SpacetimeDB's SQL HTTP API without parameterization. SpacetimeDB
 * does not currently support prepared statements via its HTTP API.
 *
 * **Injection Mitigation Strategy (defense-in-depth):**
 * 1. **Static SQL**: Most callers use static SQL strings with no interpolation
 *    (e.g., `"SELECT * FROM workflow_state WHERE id = 1"`).
 * 2. **Validated integers**: Callers that interpolate values use `parseInt()`
 *    with `Number.isFinite()` validation before interpolation (e.g.,
 *    `phaseId` in bridge.ts and suspend-checkpoint.ts).
 * 3. **Allowlist validation**: Dynamic string values (session_id, event_type)
 *    are validated via `validateLedgerFilters()` in ledger.ts, which uses
 *    regex allowlists and enum checks before any SQL interpolation.
 * 4. **Belt-and-suspenders escaping**: Even after validation, string values
 *    are escaped with `.replace(/'/g, "''")` as a secondary safety layer.
 * 5. **Localhost-only**: SSRF guard ensures queries only target localhost,
 *    limiting blast radius even if injection occurs.
 *
 * **Safe caller patterns:**
 * - `bridge.ts`: All read handlers use static SQL or validated integers
 * - `ledger.ts`: Uses `validateLedgerFilters()` before building WHERE clauses
 * - `suspend-checkpoint.ts`: Uses `parseInt()`-validated `phaseId`
 *
 * **Do NOT** pass unsanitized user input to this function. All callers must
 * validate/sanitize interpolated values before constructing the SQL string.
 *
 * @param sql - The SQL query to execute. Must use only static strings or
 *   pre-validated values. Never interpolate raw user input.
 * @returns Array of rows matching the query
 * @throws If the query fails or SpacetimeDB is unreachable
 *
 * @example
 * ```typescript
 * // Safe: static SQL
 * const state = await queryTable<WorkflowState>(
 *   "SELECT * FROM workflow_state WHERE id = 1"
 * );
 *
 * // Safe: parseInt-validated integer
 * const phaseId = parseInt(rawPhaseId, 10);
 * if (!Number.isFinite(phaseId)) throw new Error("Invalid phase");
 * const checkpoint = await queryTable<Checkpoint>(
 *   `SELECT * FROM suspend_checkpoints WHERE phaseId = ${phaseId}`
 * );
 *
 * // UNSAFE: raw string interpolation
 * // const bad = await queryTable(`SELECT * FROM t WHERE name = '${userInput}'`);
 * ```
 */
````

**Verification:** `grep -c "@security" packages/luca-framework/src/state/__helpers/spacetimedb-client.ts` returns 1.

### Task 2: Add circuit breaker documentation to `callReducer()`

**Goal:** Enhance the existing JSDoc on `callReducer()` with documentation explaining the retry pattern, its limitations, and when a proper circuit breaker would be warranted.

**File:** `packages/luca-framework/src/state/__helpers/observer-emitter.ts`

**Current JSDoc (lines 65-72):**

```typescript
/**
 * Call a SpacetimeDB reducer via HTTP API (fire-and-forget).
 *
 * This is the low-level function used by all higher-level emitters.
 * Silently catches all errors to avoid disrupting the caller.
 *
 * @param reducerName - The reducer function name
 * @param args - The arguments to pass to the reducer
 */
```

**Target JSDoc:**

```typescript
/**
 * Call a SpacetimeDB reducer via HTTP API (fire-and-forget).
 *
 * This is the low-level function used by all higher-level emitters.
 * Silently catches all errors to avoid disrupting the caller.
 *
 * ## Retry Pattern
 *
 * Uses a simple single-retry strategy:
 * 1. Attempt the HTTP POST with a 2s timeout
 * 2. On failure, wait 1s and retry once with a fresh 2s timeout
 * 3. If the retry also fails, log the error and give up
 *
 * First-attempt failures are only logged when `LUCA_DEBUG` is set,
 * since a retry follows. Retry failures are always logged because
 * they represent actual data loss.
 *
 * ## Limitations
 *
 * - **No circuit breaker**: If SpacetimeDB is down, every call attempt
 *   will fail and retry, adding ~3s of latency per call (2s timeout +
 *   1s delay + 2s retry timeout). With multiple concurrent emitters
 *   (state transitions, ledger entries, observer events), this can
 *   accumulate. However, since all calls are fire-and-forget (never
 *   awaited by the caller), this latency is absorbed by background
 *   promises and does not block the workflow.
 *
 * - **No backoff**: The retry uses a fixed 1s delay. For transient
 *   network issues this is usually sufficient; for sustained outages
 *   it does not help but also does not cause harm (fire-and-forget).
 *
 * - **No state tracking**: Each call is independent. There is no
 *   shared "SpacetimeDB is down" flag to avoid unnecessary attempts.
 *
 * ## When to Add a Full Circuit Breaker
 *
 * A circuit breaker (with open/half-open/closed states) would be
 * warranted if:
 * 1. Callers start awaiting reducer results (not fire-and-forget)
 * 2. The retry timeout accumulation causes observable workflow delays
 * 3. SpacetimeDB outages become frequent enough to waste resources
 * 4. Rate limiting or backpressure signals need to be respected
 *
 * Until any of these conditions arise, the current single-retry
 * pattern is the correct trade-off: simple, no external dependencies,
 * and no workflow disruption.
 *
 * @param reducerName - The reducer function name (e.g., "ingest_event")
 * @param args - The arguments to pass to the reducer (JSON-serializable)
 */
```

**Verification:** `grep -c "circuit breaker" packages/luca-framework/src/state/__helpers/observer-emitter.ts` returns at least 2.

### Task 3: Add inline security comments to SQL interpolation sites

**Goal:** Add brief inline comments at the two SQL interpolation sites in `suspend-checkpoint.ts` and `bridge.ts` that use `parseInt`-validated `phaseId`, documenting why the interpolation is safe.

**File:** `packages/luca-framework/src/state/suspend-checkpoint.ts`

**Current (line 99):**

```typescript
const row = await queryOne<{ checkpointJson: string }>(
  `SELECT checkpointJson FROM suspend_checkpoints WHERE phaseId = ${phaseId}`,
);
```

**Target:**

```typescript
// phaseId is parseInt-validated and Number.isFinite-checked — safe for interpolation.
const row = await queryOne<{ checkpointJson: string }>(
  `SELECT checkpointJson FROM suspend_checkpoints WHERE phaseId = ${phaseId}`,
);
```

**File:** `packages/luca-framework/src/state/bridge.ts`

**Current (lines 1033-1034 in handleResumePhase):**

```typescript
const row = await queryOne<{ checkpointJson: string }>(
  `SELECT checkpointJson FROM suspend_checkpoints WHERE phaseId = ${phaseId}`,
);
```

Note: This site already has a comment at line 1031-1032:

```typescript
// phaseId is parsed via parseInt(phaseStr, 10) and validated as a finite
// non-negative integer above — safe to interpolate directly into SQL.
```

So bridge.ts is already annotated. Only `suspend-checkpoint.ts` needs the comment.

**Verification:** `grep -B1 "WHERE phaseId" packages/luca-framework/src/state/suspend-checkpoint.ts` shows the safety comment above the query.

## Success Criteria

- [ ] `queryTable()` JSDoc includes `@security` annotation with injection mitigation strategy
- [ ] `callReducer()` JSDoc includes circuit breaker pattern documentation with limitations and upgrade criteria
- [ ] SQL interpolation in `suspend-checkpoint.ts` has inline safety comment
- [ ] `bunx --bun tsc --noEmit` passes (JSDoc changes are type-safe)
- [ ] `bun test` passes (no behavioral changes)

## Verification

```bash
# Verify security annotation
grep -c "@security" packages/luca-framework/src/state/__helpers/spacetimedb-client.ts | xargs -I{} test {} -ge 1 && echo "PASS: security annotation" || echo "FAIL"

# Verify circuit breaker documentation
grep -c "circuit breaker" packages/luca-framework/src/state/__helpers/observer-emitter.ts | xargs -I{} test {} -ge 2 && echo "PASS: circuit breaker docs" || echo "FAIL"

# Verify SQL safety comment
grep -B1 "WHERE phaseId" packages/luca-framework/src/state/suspend-checkpoint.ts | grep -q "safe" && echo "PASS: SQL safety comment" || echo "FAIL"

# No regressions (documentation-only changes)
bunx --bun tsc --noEmit
bun test
```
