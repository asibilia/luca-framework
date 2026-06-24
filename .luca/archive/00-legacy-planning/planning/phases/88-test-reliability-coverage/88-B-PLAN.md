# Plan 88-B: Add Context Domain Test Coverage

## Goal

Add comprehensive tests for the context domain (6 source files, 0 existing tests). Target ~90 tests.

## Context

- `src/context/__schemas/context.schemas.ts` — Tier schemas, threshold checks, max tier
- `src/context/__helpers/context-assembler.ts` — Assembly logic for sub-agents
- `src/context/__helpers/defaults.ts` — Profile mappings, tier-to-document config
- `src/context/__helpers/resolve-context-tier.ts` — Complexity-driven tier promotions
- `src/context/__helpers/result-aggregator.ts` — Multi-agent result aggregation
- `src/context/__helpers/result-envelope.ts` — Result parsing and envelope validation

## Tasks

### Wave 1: Schema & Utility Tests

- [ ] T1: Create `__tests__/src/context/context-schemas.test.ts` (~15 tests)
  - Tier schemas, isolation modes, meetsContextThreshold, maxContextTier
- [ ] T2: Create `__tests__/src/context/defaults.test.ts` (~12 tests)
  - TIER_DOCUMENTS additivity, ISOLATION_OVERRIDES, agent profiles

### Wave 2: Helper Tests

- [ ] T3: Create `__tests__/src/context/resolve-context-tier.test.ts` (~18 tests)
  - Promotions, ceiling caps, all 5 complexity levels
- [ ] T4: Create `__tests__/src/context/context-assembler.test.ts` (~20 tests)
  - Profile resolution, isolation modes, document filtering

### Wave 3: Result Tests

- [ ] T5: Create `__tests__/src/context/result-envelope.test.ts` (~16 tests)
  - Schema validation, parseResultEnvelope, fallback behavior
- [ ] T6: Create `__tests__/src/context/result-aggregator.test.ts` (~15 tests)
  - Status determination, deduplication, duration summing

## Verification

- `bun test __tests__/src/context/` — All new tests pass
- `bun test` — No regressions in full suite
- `bunx --bun tsc --noEmit` passes

## Success Criteria

- ~90+ tests covering all 6 context domain source files
- All tests pass individually and in full suite
