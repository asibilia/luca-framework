# 04-SUMMARY: Convert Zod .parse() to .safeParse() with error handling

## Plan

96-D — Replace all Zod `.parse()` calls with `.safeParse()` and add appropriate error handling across ~25 call sites in 7 debate/tribunal/metrics files.

## Status: COMPLETE

## Error Handling Strategy

| Context                               | Strategy                                     | Behavior                   |
| ------------------------------------- | -------------------------------------------- | -------------------------- |
| Result builders (tribunals, verdicts) | Return `null` + `console.error`              | Caller decides recovery    |
| Metrics builders                      | Return `null` + `console.error`              | Caller decides recovery    |
| Metrics `appendMetrics` write path    | `throw` with contextual message              | Prevents corrupt writes    |
| Metrics `readMetricsFile`             | Return empty `MetricsFile` + `console.error` | Graceful degradation       |
| CLI entry points (convergence.ts)     | `console.error` + `process.exit(2)`          | Fail fast on bad input     |
| Stall debate evaluator                | Return `HALT_FALLBACK` constant              | Safe halt on parse failure |

## Changes

### Task 1: verification-tribunal.ts (1 site)

- `resolveVerificationTribunal` return type: `VerificationTribunalResult` -> `VerificationTribunalResult | null`
- 1x `.parse()` -> `.safeParse()` with `[verification-tribunal]` error prefix

### Task 2: root-cause-tribunal.ts (1 site)

- `resolveRootCauseTribunal` return type: `RootCauseTribunalResult` -> `RootCauseTribunalResult | null`
- 1x `.parse()` -> `.safeParse()` with `[root-cause-tribunal]` error prefix

### Task 3: tribunal-rebuttals.ts (1 site)

- `buildTribunalResult` return type: `TribunalResult` -> `TribunalResult | null`
- 1x `.parse()` -> `.safeParse()` with `[tribunal-rebuttals]` error prefix

### Task 4: stall-debate.ts (5 sites)

- Added `HALT_FALLBACK` constant (safe default: `recommended_strategy: "halt"`, `confidence: 0.0`)
- Added `safeParseStallOutput` helper wrapping `stallDebateOutputSchema.safeParse()`
- 5x `.parse()` -> `safeParseStallOutput()` with `[stall-debate]` error prefix

### Task 5: metrics-collector.ts (11 sites)

- 4 builder functions (`buildIterationMetrics`, `buildPlanQualityMetrics`, `buildReviewMetrics`, `buildConvergenceMetrics`) now return `T | null`
- `readMetricsFile`: returns empty `MetricsFile` on corrupt data
- 4x `appendMetrics` switch cases: throw with contextual messages
- 1x final file validation: throws before write

### Task 6: pr-verdict-debate.ts (1 site)

- `buildSplitVerdictResult` return type: `SplitVerdictResult` -> `SplitVerdictResult | null`
- 1x `.parse()` -> `.safeParse()` with `[pr-verdict-debate]` error prefix

### Task 7: milestone-debate.ts (1 site)

- `buildMilestoneDebateResult` return type: `MilestoneDebateResult` -> `MilestoneDebateResult | null`
- Added null check for `buildTribunalResult` dependency (now nullable)
- 1x `.parse()` -> `.safeParse()` with `[milestone-debate]` error prefix

### Task 8: convergence.ts CLI (2 sites)

- 2x `.parse()` -> `.safeParse()` with `[convergence]` error prefix
- Exit code 2 on invalid `--current` or `--previous` JSON

### Task 9: Test file updates (6 files)

- Added `expect(result).not.toBeNull()` assertions and `result!.` non-null access
- Files: verification-tribunal.test.ts, root-cause-tribunal.test.ts, tribunal-rebuttals.test.ts, metrics-collector.test.ts, pr-verdict-debate.test.ts, milestone-debate.test.ts

## Validation

- **TypeScript**: `bunx --bun tsc --noEmit` passes with zero errors
- **Tests**: 162/162 pass across 6 test files, 0 failures, 408 expect() calls
- **Audit**: Zero Zod `.parse()` calls remain in target files (only `JSON.parse()` remains, which is correct)
- **Error handling**: Every `.safeParse()` call has an `if (!parsed.success)` guard with appropriate error handling

## Commits

1. `0460962` — verification-tribunal.ts (1 site)
2. `c4f20c7` — root-cause-tribunal.ts (1 site)
3. `eed0b18` — tribunal-rebuttals.ts (1 site)
4. `c347861` — stall-debate.ts (5 sites)
5. `070e200` — metrics-collector.ts (11 sites)
6. `41186fc` — pr-verdict-debate.ts (1 site)
7. `74d4283` — milestone-debate.ts (1 site)
8. `b9258cf` — convergence.ts CLI (2 sites)
9. `8d3771e` — test file updates (6 files)
