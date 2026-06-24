# Phase 95-C Summary: Extract isDebateComplexity Helper

**Plan:** 95-C
**Phase:** 95
**Wave:** 2
**Status:** Complete

## What Was Done

Extracted the duplicated complexity gating check ("COMPLEX or CRITICAL") from 3 tribunal
files into a single `isDebateComplexity(complexity: string): boolean` helper in the
complexity domain (T0 Foundation tier).

### Files Created

| File                                               | Purpose                                                                 |
| -------------------------------------------------- | ----------------------------------------------------------------------- |
| `src/complexity/__helpers/complexity-gate.ts`      | `isDebateComplexity` helper + `DEBATE_QUALIFYING_COMPLEXITIES` constant |
| `__tests__/src/complexity/complexity-gate.test.ts` | 18 tests: all 5 levels, case insensitivity, edge cases                  |

### Files Modified

| File                                            | Change                                                                            |
| ----------------------------------------------- | --------------------------------------------------------------------------------- |
| `src/complexity/index.ts`                       | Added barrel export for `isDebateComplexity` and `DEBATE_QUALIFYING_COMPLEXITIES` |
| `src/shared/__helpers/tribunal-detector.ts`     | Replaced inline `qualifyingComplexities` array with `isDebateComplexity()` call   |
| `src/agents/__helpers/verification-tribunal.ts` | Replaced inline `qualifyingComplexities` array with `isDebateComplexity()` call   |
| `src/agents/__helpers/root-cause-tribunal.ts`   | Replaced inline `qualifyingComplexities` array with `isDebateComplexity()` call   |

### Duplication Eliminated

**Before:** 3 separate inline arrays `["COMPLEX", "CRITICAL"]` with `.includes(complexity.toUpperCase())`
**After:** Single `isDebateComplexity()` function in T0 tier, imported by all 3 consumers

### Tier Compliance

- `complexity-gate.ts` is in T0 (Foundation) — imports nothing from `src/`
- `shared/__helpers/tribunal-detector.ts` is in T0 — imports T0 (complexity) only
- `agents/__helpers/*.ts` are in T2 (Entity) — import T0 (complexity) only

## Verification

- `bunx --bun tsc --noEmit` — clean (0 errors)
- `bun test` — 3127 pass, 0 fail
- No inline `qualifyingComplexities` arrays remain in tribunal files
- `isDebateComplexity` tests: 18/18 pass with 100% coverage
