# Phase 272: Home Page Fixes (S-01, S-02, S-03)

**Goal:** Fix Home page data display — activity feed event labels, session card summaries, and status card metrics.
**Complexity:** MODERATE
**Wave:** 1

## Context

The Studio Home page has 3 data display bugs stemming from field mapping mismatches between the data sources (session-ledger.jsonl, state.json) and the React components.

### Root Cause Analysis

**S-01 — "Unknown" activity items:**
10 event types in the ledger are NOT mapped in `EVENT_TYPES` constant at `packages/luca-studio/lib/constants.ts`. Missing entries: `PHASE_START`, `HARNESS_COMPLETE`, `REVIEW_COMPLETE`, `SKIP`, `SKIP_COOLDOWN`, `PREMORTEM_COMPLETE`, `PROCESS_DATA_COMPLETE`, `EXECUTION_COMPLETE`, `PHASE_VERIFY_PASSED`, `PHASE_LEARN_COMPLETE`. Note: `PHASE_STARTED` exists in the constant but the ledger emits `PHASE_START`.

**S-02 — Blank summaries:**
`synthesizeSummary()` in `use-home-data.ts` checks `entry.summary`, then `event_data` for field_set, then `previous_state -> current_state`, then `actions_executed`. But it misses:

- `event_data.summary` (some transitions include a summary in event_data)
- `event_data.detail` or `event_data.phase_id` (useful context for phase events)
- For events like PHASE_START, PHASE_COMPLETE: the phase_id from event_data would make a better summary

**S-03 — Status cards show "--":**
StatusCard reads `get(state, "context.current_phase")`, `get(state, "context.complexity")`, `get(state, "context.current_milestone")`. But the raw `state.json` context object has different field names. Actual context keys include `complexity` (matches), but NOT `current_phase` or `current_milestone`. The /api/state route returns raw state.json. Fix: update the API route to include derived fields, or fix the StatusCard to read from `luca-bridge read-status` format.

## Tasks

### Task 1: fix-event-types — Add missing event types to EVENT_TYPES constant

**File:** `packages/luca-studio/lib/constants.ts`
**file_count_estimate:** 1
**scope:** single-component

Add the 10 missing event types to `EVENT_TYPES`:

```
PHASE_START -> "Phase Start"
HARNESS_COMPLETE -> "Harness Complete"
REVIEW_COMPLETE -> "Review Complete"
SKIP -> "Skipped"
SKIP_COOLDOWN -> "Skip Cooldown"
PREMORTEM_COMPLETE -> "Premortem Complete"
PROCESS_DATA_COMPLETE -> "Process Data"
EXECUTION_COMPLETE -> "Execution Complete"
PHASE_VERIFY_PASSED -> "Phase Verified"
PHASE_LEARN_COMPLETE -> "Phase Learned"
```

Also rename `PHASE_STARTED` to `PHASE_START` (the ledger uses PHASE_START, not PHASE_STARTED).

**Verification:** All event types from `session-ledger.jsonl` should have a mapping in EVENT_TYPES.

### Task 2: fix-synthesize-summary — Improve summary extraction for richer event data

**File:** `packages/luca-studio/hooks/use-home-data.ts`
**file_count_estimate:** 1
**scope:** single-component

Update `synthesizeSummary()` to extract more useful summaries:

1. After checking root `summary`, check `event_data.summary` (some transitions embed summary in event_data)
2. For phase events (PHASE_START, PHASE_COMPLETE): extract `event_data.phase_id` and show "Phase {N}"
3. For HARNESS_COMPLETE: extract `event_data.status` and `event_data.total_errors`
4. For ROUTE_COMPLETE: extract `event_data.complexity`
5. Keep existing fallbacks as last resort

**Verification:** Recent ledger entries should produce meaningful summary text, not blank strings.

### Task 3: fix-status-card-paths — Fix field paths in StatusCard to match actual state.json structure

**Files:** `packages/luca-studio/components/home/status-card.tsx`, `packages/luca-studio/app/api/state/route.ts`
**file_count_estimate:** 2
**scope:** related-components

The `/api/state` route returns raw `state.json` which has the structure `{status, value, historyValue, context, children}`. The context object has `complexity` but NOT `current_phase` or `current_milestone`.

Fix approach: Enrich the `/api/state` response to include derived fields from `luca-bridge read-status`. Read from bridge output and merge into the response. The bridge returns `current_phase`, `current_milestone`, `complexity` at the top level.

Alternative simpler fix: Read `current_phase` from `state.context.current_plan_ids` or from ROADMAP.md, but the bridge approach is cleaner.

Actually simplest fix: the bridge read-status output already has all the fields StatusCard needs. Change the API route to return the bridge-formatted output instead of raw state.json, OR update StatusCard to read from the correct paths in raw state.json.

**Verification:** StatusCard should show actual complexity, phase number, and milestone instead of "--".

## Success Criteria

- [ ] All ledger event types have human-readable labels (no "Unknown" or raw event names for common events)
- [ ] Activity feed entries show meaningful summary text
- [ ] Status card displays correct complexity, phase, and milestone values
- [ ] `bunx --bun tsc --noEmit` passes
