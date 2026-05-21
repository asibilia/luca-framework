# SUMMARY — Phase 145 Plan 1

## Result: COMPLETE

**Plan:** PLAN-145-1 — Extend Memory Metrics Schema and Helper with Historical Data
**Phase:** 145 | **Wave:** 1
**Duration:** ~5 minutes
**Branch:** `145--memory-feedback-historical-metrics`

## Tasks Completed

| #   | Task                                                           | Commit     | Status |
| --- | -------------------------------------------------------------- | ---------- | ------ |
| 1   | Add HistoricalPhaseDataSchema and export from barrel           | `650b0345` | Done   |
| 2   | Extend ComputeMetricsConfigSchema with optional historicalData | `1081d8f0` | Done   |
| 3   | Implement stale_engram_pct computation                         | `1a85b96c` | Done   |
| 4   | Implement confidence_calibration computation                   | `c71cdeb0` | Done   |

## Changes Summary

### New Schemas (`src/shared/__schemas/memory-metrics.schemas.ts`)

- **EngramFeedbackHistoryEntrySchema** — per-engram feedback history (engram_id, total_recalls, positive_recalls, milestones_with_no_positive, confidence)
- **ConfidenceActualEntrySchema** — confidence-vs-actual data point (confidence level, actually_useful boolean)
- **HistoricalPhaseDataSchema** — container with engram_feedback_history and confidence_actuals arrays (both default to [])

### Extended Config (`src/shared/__helpers/memory-feedback.ts`)

- Added optional `historicalData` field to `ComputeMetricsConfigSchema` (camelCase, matching existing convention)

### New Helper Functions (`src/shared/__helpers/memory-feedback.ts`)

- **`computeStaleEngramPct()`** — dual-threshold stale detection: `total_recalls >= 5 && positive_recalls === 0 && milestones_with_no_positive >= 3`. Returns ratio of stale to total engrams, clamped [0, 1].
- **`computeConfidenceCalibration()`** — compares expected usefulness rates (low=0.33, medium=0.66, high=0.90) against actual rates. Returns `1 - avg(|expected - actual|)`, clamped [0, 1]. Requires 10+ samples (MIN_CALIBRATION_SAMPLES guard per research Pitfall 5).

### Updated Barrel (`src/shared/index.ts`)

- Re-exports all 3 new schemas and 3 new types from `~/shared`

## Verification

- `bunx --bun tsc --noEmit` passes with no errors
- Without `historicalData`: stale_engram_pct=0, confidence_calibration=0 (backward compatible)
- With `historicalData`: both metrics compute real values
- All new schemas exported from `~/shared`
- All fields use snake_case (schemas) / camelCase (config) consistently

## Deviations

- **[Rule 1 — Bug]** TypeScript error TS18048 on `EXPECTED_USEFULNESS[level]` — the `Record<string, number>` type allowed `undefined` values. Fixed by using `as const` assertion to provide exact key types.

## Files Modified

- `src/shared/__schemas/memory-metrics.schemas.ts` — 3 new schemas + types
- `src/shared/__helpers/memory-feedback.ts` — extended config, 2 new helpers, updated JSDoc
- `src/shared/index.ts` — 6 new re-exports (3 schemas + 3 types)
