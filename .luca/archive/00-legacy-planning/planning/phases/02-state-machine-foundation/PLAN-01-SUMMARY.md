# PLAN-01 Summary: State Machine Foundation for v4 Appetite, Guards, and Cooldown

## Result: PASSED

All 5 tasks completed successfully. Type checking passes across all changes.

## Tasks Completed

| #   | Task                                                              | Commit     | Status |
| --- | ----------------------------------------------------------------- | ---------- | ------ |
| 1   | Extend WorkflowContext Schema (types.ts)                          | `2a440e8e` | Done   |
| 2   | Add Guards for Appetite, Pre-mortem, and Process Data (guards.ts) | `18a78406` | Done   |
| 3   | Add Cooldown State and Update Transitions (machine.ts)            | `d5632804` | Done   |
| 4   | Update Bridge CLI (bridge.ts)                                     | `879770ec` | Done   |
| 5   | Update STATE.md Snapshot (snapshot.ts)                            | `77acbab4` | Done   |

## Changes Summary

### types.ts

- Added `"cooldown"` to `WORKFLOW_STATES` array
- Added appetite fields: `appetite_level`, `appetite_token_ceiling`, `appetite_context_percent`, `appetite_used_tokens`
- Added `pre_mortem_result` optional object schema (risks, mitigations, confidence, timestamp)
- Added `process_data` optional object schema (tokens_used, context_percent_used, agent_invocations, wall_clock_ms, timestamp)
- Added `cooldown_reason` optional string
- Added 4 new event types: `COOLDOWN_COMPLETE`, `SKIP_COOLDOWN`, `PREMORTEM_COMPLETE`, `PROCESS_DATA_COMPLETE`

### guards.ts

- Added `appetiteWithinBudget` guard: checks context budget vs process_data usage, returns true on first wave
- Added `shouldRunPremortem` guard: gates on `context.gates.premortem`
- Added `shouldRunProcessData` guard: gates on `context.gates.process_data`

### machine.ts

- Changed `complete` from `type: "final"` to regular state with `SKIP_COOLDOWN` -> idle, `COOLDOWN_COMPLETE` -> cooldown, `RESET` -> idle
- Added `cooldown` state with `COOLDOWN_COMPLETE` -> idle (reset), `RESET` -> idle, idle timeout safety net
- Added `recordCooldownReason` action
- Added `recordPremortemResult` action (from PREMORTEM_COMPLETE event data)
- Added `recordProcessData` action (from PROCESS_DATA_COMPLETE event data)
- Wired `PREMORTEM_COMPLETE` in `discussing` state -> planning
- Wired `PROCESS_DATA_COMPLETE` in `learning` state -> committing
- Updated `resetContext` to clear: `pre_mortem_result`, `process_data`, `cooldown_reason`, `appetite_used_tokens`

### bridge.ts

- Added `appetite_level`, `appetite_token_ceiling`, `appetite_context_percent` to `handleReadStatus` output
- Added same three fields to `statusDefaults`
- Added same three fields to `SETTABLE_FIELDS` allowlist

### snapshot.ts

- Added `cooldown: "Cooldown"` to `formatState` labels map
- Added `## Appetite` section to `generateSnapshot()` rendering level, token ceiling, context budget

## Deviations

None. All tasks completed as specified in the plan.

## Verification

- `bunx --bun tsc --noEmit` passes after each task (5/5 clean)
- All new schema fields use snake_case per project conventions
- All new guards are pure boolean-returning functions per existing patterns
- No test files created (per no-tests rule)

## Files Modified

- `packages/luca-framework/src/state/types.ts`
- `packages/luca-framework/src/state/guards.ts`
- `packages/luca-framework/src/state/machine.ts`
- `packages/luca-framework/src/state/bridge.ts`
- `packages/luca-framework/src/state/snapshot.ts`
