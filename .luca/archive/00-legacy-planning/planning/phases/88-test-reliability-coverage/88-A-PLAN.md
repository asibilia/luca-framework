# Plan 88-A: Fix validateBranding Module Resolution / Test Isolation

## Goal

Fix the ~35 test failures that occur in the full `bun test` suite but pass individually. Root cause is a module resolution ordering issue with `validateBranding`.

## Context

- Tests in `__tests__/packages/luca-framework/` fail when run in the full suite
- Error: `validateBranding` export not found during full suite run
- Tests pass individually: `bun test __tests__/packages/luca-framework/`
- Likely caused by: circular dependency, barrel re-export ordering, or Bun module cache behavior
- Phase 87-B refactored barrels — may have changed the import chain

## Tasks

### Wave 1: Diagnose

- [ ] T1: Run full test suite and capture exact error messages for failing tests
- [ ] T2: Trace the import chain for validateBranding — where defined, where re-exported, where imported
- [ ] T3: Check for circular dependencies in the import graph
- [ ] T4: Check if barrel refactoring (Phase 87-B) affected the resolution

### Wave 2: Fix

- [ ] T5: Apply fix (likely: break circular dependency, adjust import ordering, or add explicit re-export)
- [ ] T6: Verify all tests pass in full suite: `bun test`
- [ ] T7: Verify no regressions

## Verification

- `bun test` — ALL tests pass (0 failures)
- `bunx --bun tsc --noEmit` passes

## Success Criteria

- 0 test failures in full `bun test` run
- Root cause documented in commit message
