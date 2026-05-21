---
phase: 215
plan: 01
type: bug
autonomous: true
wave: 1
depends_on: []
---

# Phase 215 Plan 01: Fix Home Page Field Mismatches

## Objective

Fix the home page data flow so activity items display correct event types, summaries are synthesized from ledger data, and the status card reads the correct state machine field names.

> Appetite: Small (50000 tokens remaining of 50000 ceiling)

## Context

@packages/luca-studio/hooks/use-home-data.ts
@packages/luca-studio/components/home/recent-activity.tsx
@packages/luca-studio/components/home/status-card.tsx
@packages/luca-studio/lib/constants.ts
@.planning/session-ledger.jsonl (data shape reference)
@.planning/state.json (field name reference)

## Tasks

### 1. Fix event field name and add state machine event types

**Type:** auto
**TDD:** false
**Depends on:** none

Fix `use-home-data.ts` line 83: the ledger entries use `event_type` (not `event`), so `get(entry, "event", "unknown")` returns "unknown" for every entry. Change to `get(entry, "event_type", "unknown")`.

Also update the `LedgerEntry` type to use `event_type` instead of `event` as the primary field, since that matches the actual JSONL data shape.

Add state machine event types to `constants.ts` EVENT_TYPES so they get display labels and colors instead of rendering as raw strings:

- `START` -> "Start" (event-session)
- `RESET` -> "Reset" (event-session)
- `PREFLIGHT_COMPLETE` -> "Pre-Flight Done" (event-state)
- `PHASE_STARTED` -> "Phase Started" (event-state)
- `PHASE_COMPLETE` -> "Phase Complete" (event-state)
- `VERIFY_PASS` -> "Verify Pass" (event-state)
- `field_set` -> "Field Set" (event-state)
- `ROUTE_COMPLETE` -> "Route Complete" (event-state)
- `DISCUSS_COMPLETE` -> "Discuss Complete" (event-state)
- `PLAN_COMPLETE` -> "Plan Complete" (event-state)
- `COMMIT_COMPLETE` -> "Commit Complete" (event-commit)
- `LEARN_COMPLETE` -> "Learn Complete" (event-memory)

**Files to create/edit:**

- `packages/luca-studio/hooks/use-home-data.ts`
- `packages/luca-studio/lib/constants.ts`

**Verification:**

- `LedgerEntry` type uses `event_type` field
- `get(entry, "event_type", "unknown")` in use-home-data.ts
- All 12 state machine events added to EVENT_TYPES constant
- `recent-activity.tsx` reads `entry.event` which is now populated from `event_type`

### 2. Synthesize summary from event_data fields

**Type:** auto
**TDD:** false
**Depends on:** 1

Update `use-home-data.ts` to synthesize a meaningful summary from ledger entry data when no explicit `summary` field exists. The ledger entries contain `event_data`, `previous_state`, and `current_state` fields that can produce readable summaries.

Synthesis strategy (in priority order):

1. Use existing `summary` field if present
2. For `field_set` events: format as `"Set {field} to {value}"` from `event_data.field` and `event_data.value`
3. For transition events: format as `"{previous_state} -> {current_state}"` when both exist
4. For events with `actions_executed` array: join action names
5. Fallback: empty string (same as current behavior)

Also update `recent-activity.tsx` to use the synthesized summary from the hook instead of its own fallback chain via `get(entry, "message", "")`.

**Files to create/edit:**

- `packages/luca-studio/hooks/use-home-data.ts`
- `packages/luca-studio/components/home/recent-activity.tsx`

**Verification:**

- `field_set` events show "Set complexity to COMPLEX" style summaries
- State transitions show "idle -> preflight" style summaries
- Explicit summaries are preserved when present
- Empty summary gracefully falls back to empty string

### 3. Fix status card field names

**Type:** auto
**TDD:** false
**Depends on:** none

Fix `status-card.tsx` lines 57-59 where field names do not match the state machine context:

- `current_phase_id` -> `current_phase` (state machine uses `current_phase`)
- `milestone_label` -> `current_milestone` (state machine uses `current_milestone`)

The `complexity` field (line 58) is already correct.

**Files to create/edit:**

- `packages/luca-studio/components/home/status-card.tsx`

**Verification:**

- Phase number renders when state machine has `current_phase` set
- Milestone label renders when `current_milestone` is set
- No TypeScript errors from `bunx --bun tsc --noEmit`

## Verification

1. Run `bunx --bun tsc --noEmit` from repo root -- no type errors
2. Confirm `use-home-data.ts` reads `event_type` from ledger entries
3. Confirm `constants.ts` EVENT_TYPES includes all 12 state machine events
4. Confirm `status-card.tsx` reads `current_phase` and `current_milestone`
5. Confirm summary synthesis produces readable strings for field_set and transition events

## Success Criteria

- Activity feed items show recognized event type badges (not "unknown")
- Summaries synthesized from ledger data (transitions, field sets) instead of blank
- Status card displays correct phase number and milestone from state machine
- Zero TypeScript errors

## Output Specification

- Modified: `packages/luca-studio/hooks/use-home-data.ts`
- Modified: `packages/luca-studio/lib/constants.ts`
- Modified: `packages/luca-studio/components/home/recent-activity.tsx`
- Modified: `packages/luca-studio/components/home/status-card.tsx`
