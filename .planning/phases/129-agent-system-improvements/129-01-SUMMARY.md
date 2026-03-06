# Phase 129-01 Summary: XState Guard and Timeout Fixes

## Status: COMPLETE

## Task 1: Verify #34 (shouldRunDiscussion guard)

**Result**: Already done. `shouldRunDiscussion` exists in `packages/luca-framework/src/state/guards.ts:82-93`, is wired into `machine.ts:296` as a guard on the `ROUTE_COMPLETE` transition, and has full test coverage in `__tests__/packages/luca-state/guards.test.ts:72-97`.

## Task 2: Add timeout/auto-transition to idle states (#35)

**Changes**:

- `packages/luca-framework/src/state/machine.ts`: Added `delays.idleTimeout` in `setup()` -- reads `context.workflow_config.idle_timeout_ms` with a 5-minute (300,000ms) default. Added `after.idleTimeout` blocks to `idle`, `paused`, and `suspended` states that auto-transition to `failed` on timeout.

**Design decisions**:

- Timeout targets `failed` state (not `complete`) because an idle timeout is an error condition
- Dynamic delay via XState v5 `delays` config reads from context at runtime
- All three waiting states (idle, paused, suspended) get the same timeout behavior

## Task 3: Enforce complexity gating matrix in XState guards (#44)

**Changes**:

- `packages/luca-framework/src/state/guards.ts`: Added two new guards:
  - `shouldRunCodeReview` -- checks `codeReviewAgents` array in complexity matrix. Returns false for TRIVIAL/SIMPLE (empty array), true for MODERATE+ (non-empty). Respects `workflow_config.code_review: false` override.
  - `shouldRunLearning` -- checks `learningCapture` field. Returns true only for "standard", "full", or "full+debrief" (MODERATE+). Distinct from `shouldCaptureLearnings` which returns true for any non-skip value including "brief".

**Tests added**:

- `__tests__/packages/luca-state/guards.test.ts`: 11 new tests covering both guards across all 5 complexity levels plus the workflow_config override case. All 68 tests pass.

## Verification

- `bunx --bun tsc --noEmit` -- passes clean
- `bun test __tests__/packages/luca-state/guards.test.ts` -- 68/68 pass, 100% coverage on guards.ts

## Files Changed

| File                                           | Change                                       |
| ---------------------------------------------- | -------------------------------------------- |
| `packages/luca-framework/src/state/machine.ts` | Added delays config + after blocks           |
| `packages/luca-framework/src/state/guards.ts`  | Added shouldRunCodeReview, shouldRunLearning |
| `__tests__/packages/luca-state/guards.test.ts` | Added 11 tests for new guards                |
