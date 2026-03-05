# Phase 107 — SpacetimeDB Integration: E2E Verification

## Goal

Verify the complete SpacetimeDB integration works end-to-end: typecheck passes, test suite passes, and no regressions were introduced by the migration.

## Context

Phase 107 had 13 plans, 12 are complete. This final plan verifies the integration is solid. The SpacetimeDB migration rewrote read/write paths across framework, observer, and memory systems.

### Current State

- **Typecheck:** `bunx --bun tsc --noEmit` passes clean (verified)
- **Tests:** Need verification — run `bun test` and fix any failures specific to SpacetimeDB integration
- **Known issue:** ~29 tests in `packages/luca-framework` fail when run in full suite due to pre-existing module resolution; they pass individually

### Key Test Files

- `__tests__/packages/luca-framework/src/state/ledger-spacetimedb.test.ts`
- `__tests__/packages/luca-framework/src/state/persistence-spacetimedb.test.ts`
- `__tests__/packages/luca-framework/src/state/suspend-checkpoint-spacetimedb.test.ts`
- `__tests__/packages/luca-framework/src/state/__helpers/spacetimedb-client.test.ts`
- `__tests__/packages/luca-framework/src/state/ledger-sql-safety.test.ts`
- `__tests__/packages/luca-framework/src/state/bridge-ledger.test.ts`

## Plan

### Wave 1 — Verification

#### Task 1.1: Run Typecheck

Run `bunx --bun tsc --noEmit` and confirm it passes. If errors exist, fix them.

**Verification:** Exit code 0.

#### Task 1.2: Run SpacetimeDB-specific Tests

Run tests individually to avoid full-suite module resolution issues:

```bash
bun test __tests__/packages/luca-framework/src/state/ledger-spacetimedb.test.ts
bun test __tests__/packages/luca-framework/src/state/persistence-spacetimedb.test.ts
bun test __tests__/packages/luca-framework/src/state/suspend-checkpoint-spacetimedb.test.ts
bun test __tests__/packages/luca-framework/src/state/__helpers/spacetimedb-client.test.ts
bun test __tests__/packages/luca-framework/src/state/ledger-sql-safety.test.ts
```

Fix any failures.

**Verification:** All SpacetimeDB test files pass individually.

#### Task 1.3: Run Full Test Suite

Run `bun test` and triage failures:
- Pre-existing module resolution failures (known, acceptable)
- New failures introduced by SpacetimeDB migration (must fix)

**Verification:** No new test failures compared to baseline.

## Complexity

**SIMPLE** — Verification-only, fixing whatever breaks.

## Success Criteria

1. `bunx --bun tsc --noEmit` exits 0
2. All SpacetimeDB-specific test files pass
3. No new regressions in the full test suite
