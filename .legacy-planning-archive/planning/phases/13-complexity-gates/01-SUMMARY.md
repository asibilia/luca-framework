---
id: 13-01
title: Types, Defaults, and Complexity Matrix
phase: 13-complexity-gates
wave: 1
status: complete
delivers: CPLX-01, CPLX-02, CPLX-05
tasks_completed: 7
tests_added: 19
tests_total_pass: 569
tests_total_fail: 7
pre_existing_failures: 7
---

# Summary: Plan 13-01 — Types, Defaults, and Complexity Matrix

## What Was Done

Created the foundational complexity gating module for the Luca Framework. This module introduces a 5-level complexity system (TRIVIAL, SIMPLE, MODERATE, COMPLEX, CRITICAL) that controls workflow step activation, agent spawning, iteration limits, and verification depth.

### Task 1: Complexity Type Definitions
Created `src/complexity/types.ts` with all TypeScript interfaces and constants:
- `COMPLEXITY_LEVELS` constant (5 levels as const tuple)
- `COMPLEXITY_ORDER` mapping (numeric indices 0-4)
- `COMPLEXITY_TIER` mapping (3 behavioral tiers: lightweight, standard, thorough)
- Interfaces: `ComplexityClassification`, `ComplexityGate`, `ComplexityMatrix`, `ComplexityConfig`
- Type aliases: `ComplexityLevel`, `ComplexityTier`, `VerificationMode`, `StepActivation`
- Utility functions: `meetsThreshold()`, `getTier()`

### Task 2: Default Complexity Configuration
Created `src/complexity/defaults.ts` with:
- `COMPLEXITY_CLASSIFICATIONS` — classification criteria for each level (used by lu-router)
- `DEFAULT_COMPLEXITY_MATRIX` — gating configuration for all 5 levels
- `DEFAULT_COMPLEXITY_CONFIG` — top-level config with `defaultLevel: 'auto'`

### Task 3: Module Public API
Created `src/complexity/index.ts` exporting all types, constants, defaults, and utilities.
Updated root `index.ts` to export all complexity symbols (lines 63-82).

### Task 4: Project Config
Added `complexity` section to `.planning/config.json` with the full gating matrix for all 5 levels.

### Task 5: Template Config
Added identical `complexity` section to `packages/luca-framework/templates/framework/templates/config.json`.

### Task 6: STATE.md Template
Updated `packages/luca-framework/templates/framework/templates/state.md`:
- Line 31: Expanded from `[TRIVIAL / MODERATE / COMPLEX]` to `[TRIVIAL / SIMPLE / MODERATE / COMPLEX / CRITICAL]`
- Line 175: Updated section reference to include all 5 levels

### Task 7: Tests
Created 2 test files with 19 tests (100% coverage on complexity module):
- `__tests__/src/complexity/types.test.ts` — 10 tests for levels, tiers, order, meetsThreshold, getTier
- `__tests__/src/complexity/defaults.test.ts` — 9 tests for classifications, matrix, config defaults

## Files Changed

| File | Action |
|------|--------|
| `src/complexity/types.ts` | Created |
| `src/complexity/defaults.ts` | Created |
| `src/complexity/index.ts` | Created |
| `index.ts` | Updated (added complexity exports) |
| `.planning/config.json` | Updated (added complexity section) |
| `packages/luca-framework/templates/framework/templates/config.json` | Updated (added complexity section) |
| `packages/luca-framework/templates/framework/templates/state.md` | Updated (5 levels) |
| `__tests__/src/complexity/types.test.ts` | Created |
| `__tests__/src/complexity/defaults.test.ts` | Created |

## Deviations

None. All code was implemented exactly as specified in the plan.

## Verification

- All 19 new tests pass (`bun test __tests__/src/complexity/`)
- 100% function and line coverage on complexity module
- Complexity source files compile cleanly with `bunx --bun tsc --noEmit`
- Both config JSON files validated as valid JSON
- Pre-existing TypeScript error in `lu-verifier.agent.ts` (octal escape) unrelated to changes
- Full test suite: 569 pass, 7 fail (pre-existing failures; no regressions introduced)
