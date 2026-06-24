---
id: 114-01
title: "Foundation — SpacetimeDB Config Consolidation & Syntax Cleanup"
wave: 1
phase: 114
gap_closure: true
---

# Wave 1 — Foundation: Config Consolidation & Syntax Cleanup

**Ticket:** #44
**Depends on:** Phase 113 (complete)
**Complexity:** SIMPLE (2 files modified + 1 new file)

## Objective

Consolidate duplicated SpacetimeDB connection constants and fix suspicious syntax before wiring new integration points in Wave 2:

1. **Duplicated SpacetimeDB connection constants** — `observer-emitter.ts` and `spacetimedb-client.ts` each define their own `DEFAULT_URL` and `DATABASE_NAME` constants. A single source of truth is needed.
2. **`!fromSpacetimeDB!` suspicious syntax** — `bridge.ts:558` contains `if (!fromSpacetimeDB!)` which is a non-obvious double-negation using TypeScript's non-null assertion operator as a logical NOT. This should be simplified to `if (!fromSpacetimeDB)` for clarity.

These are prerequisites for Wave 2 because new reducer calls (harness pipeline) must use the same connection config, and the config consolidation removes the duplication that would otherwise be tripled.

**Note on callReducer payload format:** The SpacetimeDB module_bindings define all table schemas and reducer parameters using camelCase field names (e.g., `sessionId`, `eventType`, `totalErrors`). The callReducer payloads already use camelCase to match. This is correct — the SpacetimeDB module defines the wire format contract. The `api-snake-case` rule applies to REST API boundaries, not SpacetimeDB reducer calls where the backend schema dictates the format.

## Context

- @file `packages/luca-framework/src/state/__helpers/observer-emitter.ts` — `DEFAULT_SPACETIMEDB_URL` and `DATABASE_NAME` constants (lines 25-28)
- @file `packages/luca-framework/src/state/__helpers/spacetimedb-client.ts` — `DEFAULT_STDB_URL` and `DB_NAME` constants (lines 17-20), imports `isLocalhostUrl` from observer-emitter
- @file `packages/luca-framework/src/state/bridge.ts` — `!fromSpacetimeDB!` syntax at line 558

---

## Task 1.1: Create shared SpacetimeDB config module

**Create file:** `packages/luca-framework/src/state/__helpers/stdb-config.ts`

Extract the duplicated constants into a single source of truth:

```typescript
/**
 * Shared SpacetimeDB connection configuration.
 *
 * Single source of truth for URL and database name constants,
 * used by both observer-emitter.ts and spacetimedb-client.ts.
 */

/** Default SpacetimeDB URL (standalone server default). */
export const DEFAULT_SPACETIMEDB_URL = "http://localhost:3000";

/** Database name for the observer module (configurable via LUCA_SPACETIMEDB_DB). */
export const DATABASE_NAME = process.env.LUCA_SPACETIMEDB_DB || "luca-observer";

/**
 * Resolve the SpacetimeDB base URL from environment variables.
 *
 * Checks LUCA_SPACETIMEDB_URL, then LUCA_OBSERVER_URL, then falls back
 * to the default localhost URL.
 */
export function resolveStdbUrl(): string {
  return (
    process.env.LUCA_SPACETIMEDB_URL ||
    process.env.LUCA_OBSERVER_URL ||
    DEFAULT_SPACETIMEDB_URL
  );
}
```

Then update imports:

- `observer-emitter.ts`: Remove local `DEFAULT_SPACETIMEDB_URL` and `DATABASE_NAME` constants; import from `./stdb-config`
- `spacetimedb-client.ts`: Remove local `DEFAULT_STDB_URL` and `DB_NAME` constants; import `DATABASE_NAME`, `resolveStdbUrl` from `./stdb-config`; replace `getStdbUrl()` with `resolveStdbUrl()`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `grep -r "DEFAULT_STDB_URL\|DB_NAME" packages/luca-framework/src/state/__helpers/spacetimedb-client.ts` returns zero matches
- `grep -r "DEFAULT_SPACETIMEDB_URL.*=\|DATABASE_NAME.*=" packages/luca-framework/src/state/__helpers/observer-emitter.ts` returns zero matches (constants moved to stdb-config)

---

## Task 1.2: Fix `!fromSpacetimeDB!` syntax in bridge.ts

**File:** `packages/luca-framework/src/state/bridge.ts` line 558

**Current:** `if (!fromSpacetimeDB!) {`

This uses TypeScript's non-null assertion operator (`!`) on `fromSpacetimeDB` after the logical NOT (`!`). While technically valid TypeScript, it is confusing and non-standard. The non-null assertion is unnecessary because `fromSpacetimeDB` is a local `boolean` variable that is always defined.

**Fix:** Change to `if (!fromSpacetimeDB) {`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `grep "!fromSpacetimeDB!" packages/luca-framework/src/state/bridge.ts` returns zero matches

---

## Success Criteria

1. **Single source of truth:** SpacetimeDB URL and database name defined once in `stdb-config.ts`, imported by both `observer-emitter.ts` and `spacetimedb-client.ts`
2. **Syntax cleanup:** No `!fromSpacetimeDB!` pattern in bridge.ts
3. **Type check passes:** `bunx --bun tsc --noEmit` clean
4. **No behavioral change:** All existing reducer calls continue to work identically

## Complexity: SIMPLE

- 2 files modified (observer-emitter, spacetimedb-client) + 1 new file (stdb-config) + 1 syntax fix (bridge)
- Low risk: config consolidation is a mechanical refactor, syntax fix is cosmetic
