# Phase 222 Plan 4: Event-Sourced Gap Detection -- Summary

## Status: COMPLETE

## Tasks Completed

| Task | Description                                                   | Commit                                          |
| ---- | ------------------------------------------------------------- | ----------------------------------------------- |
| 1    | Create gap-detector.ts with three-tier tolerance model        | `1c966b79`                                      |
| 2    | Add audit-gaps subcommand to bridge.ts (inline gap detection) | `cc1129cb`                                      |
| 3    | Export gap detector from workflow barrel                      | `1319cbfe` (merged with parallel Wave 2 commit) |
| 4    | Add JSDoc documentation for gap detection module              | Included in Tasks 1 and 2                       |

## What Was Built

### gap-detector.ts (`src/workflow/__helpers/gap-detector.ts`)

Post-execution gap detector implementing the three-tier tolerance model:

- **Tier 1 (Strict):** Required step with no ledger entry -> FAIL
- **Tier 2 (Tolerant):** Step skipped via guard-false or flag-skip -> PASS (no gap)
- **Tier 3 (Advisory):** Optional step absent -> WARNING; Guard exception -> WARNING

Exports:

- `detectGaps(dag, checkpoint)` -- Core audit function
- `GapSeveritySchema` / `GapSeverity` -- "fail" | "warning" | "info"
- `ExecutionGapSchema` / `ExecutionGap` -- Individual gap entry
- `GapAuditResultSchema` / `GapAuditResult` -- Full audit result with summary

### bridge.ts audit-gaps subcommand

Added `audit-gaps` as the 16th bridge subcommand with inline gap detection (no `~/workflow` import -- the bridge is in `packages/luca-framework/` which cannot access the `~` alias). Same three-tier tolerance logic implemented self-contained.

- Exit code 0: clean (no gaps)
- Exit code 1: gaps found with FAIL severity
- Output: Structured JSON with `status`, `gaps[]`, `summary`

### Workflow barrel exports

All gap detector symbols exported from `src/workflow/index.ts` for non-bridge consumers (lu-verifier, phase-execute, etc.).

## Deviations

- **Task 3 commit merged with parallel Wave 2:** The barrel export changes to `src/workflow/index.ts` were committed as part of `1319cbfe` (a parallel Wave 2 commit that also modified the same file). The gap detector exports are correctly present in HEAD.
- **Task 4 already satisfied:** All JSDoc documentation was written during Tasks 1 and 2, meeting the plan's documentation requirements without needing additional edits.

## Verification Results

- `bunx --bun tsc --noEmit` passes with zero errors
- `src/workflow/__helpers/gap-detector.ts` exists with `detectGaps` function
- `packages/luca-framework/src/state/bridge.ts` has `audit-gaps` subcommand
- Gap detector consumes structured `SkippedStepEntry` format (not bare string IDs)
- Three-tier tolerance model correctly classifies all step states
- Bridge `audit-gaps` outputs structured JSON
- All symbols exported from `src/workflow/index.ts`

## Files Changed

- **Created:** `src/workflow/__helpers/gap-detector.ts`
- **Modified:** `packages/luca-framework/src/state/bridge.ts`
- **Modified:** `src/workflow/index.ts`
