# Plan 60-A: Integration Tests

## Objective

End-to-end validation of the unified package, state bridge, and model routing.

## Tasks

### 1. State bridge integration test

Verify bridge commands work through the unified package path:

- `bun run packages/luca-framework/src/state/bridge.ts read-status`
- `bun run packages/luca-framework/src/state/bridge.ts read-complexity`
- `bun run packages/luca-framework/src/state/bridge.ts ensure-init`

### 2. Model routing integration test

Verify resolveModel works with real agent configs and DEFAULT_COMPLEXITY_MATRIX.

### 3. Run repo-audit self-validation

Run the check scripts that the new repo-audit skill delegates to:

- `bun run scripts/check-domain-boundaries.ts`
- `bun run check:drift`

### 4. Full test suite

- `bun test` — all tests pass
- `bunx --bun tsc --noEmit` — type check clean

## Verification

- All integration checks pass
- No regressions
