# Phase 215 Plan 01 Summary: Fix Home Page Field Mismatches

## Result: COMPLETE

All 3 tasks executed successfully with atomic commits.

## Tasks Completed

### Task 1: Fix event field name and add state machine event types

- **Commit:** `89426d6a`
- Changed `get(entry, "event", "unknown")` to `get(entry, "event_type", "unknown")` in `use-home-data.ts` line 83
- Added 12 state machine event types to `constants.ts` EVENT_TYPES: START, RESET, PREFLIGHT_COMPLETE, PHASE_STARTED, PHASE_COMPLETE, VERIFY_PASS, field_set, ROUTE_COMPLETE, DISCUSS_COMPLETE, PLAN_COMPLETE, COMMIT_COMPLETE, LEARN_COMPLETE

### Task 2: Synthesize summary from event_data fields

- **Commit:** `d0d6900b`
- Added `synthesizeSummary()` helper to `use-home-data.ts` with 5-level priority:
  1. Existing summary field
  2. field_set: "Set {field} to {value}"
  3. Transitions: "{previous_state} -> {current_state}"
  4. actions_executed: joined action names
  5. Fallback: empty string
- Simplified `recent-activity.tsx` to consume pre-synthesized summary from hook (removed lodash/get import)

### Task 3: Fix status card field names

- **Commit:** `2af59d03`
- Changed `current_phase_id` to `current_phase` in status-card.tsx
- Changed `milestone_label` to `current_milestone` in status-card.tsx

## Files Modified

- `packages/luca-studio/hooks/use-home-data.ts` — Fixed event field name, added synthesizeSummary helper
- `packages/luca-studio/lib/constants.ts` — Added 12 state machine event types
- `packages/luca-studio/components/home/recent-activity.tsx` — Simplified summary consumption
- `packages/luca-studio/components/home/status-card.tsx` — Fixed field names

## Verification

- TypeScript check passed for all modified files (pre-existing errors in unrelated files: git/history/route.ts, git/revert/route.ts, harness-tab.tsx, raw-config-editor.tsx, file-watcher.ts)

## Deviations

None.
