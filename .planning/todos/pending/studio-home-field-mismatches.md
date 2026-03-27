---
title: "P1: Fix home page field mismatches — activity, summaries, status card (S-01/S-02/S-03)"
area: ui
created: 2026-03-27
source: docs/review/studio/01-home.md
priority: P1
estimated_size: S
---

## Context

The home dashboard has three field-name mismatches where the frontend reads fields that don't exist in the API responses. All traced back to `TransitionRecord` schema in `packages/luca-framework/src/state/types.ts`.

## Task

1. **S-01: Fix "Unknown" activity items** — `hooks/use-home-data.ts:83`
   - Change `get(entry, "event", "unknown")` to `get(entry, "event_type", "unknown")`
   - Add actual state machine event types to `lib/constants.ts` EVENT_TYPES:
     `START`, `RESET`, `PREFLIGHT_COMPLETE`, `PHASE_STARTED`, `PHASE_COMPLETE`, `VERIFY_PASS`, `field_set`

2. **S-02: Fix blank summaries** — `components/home/recent-activity.tsx:68-71`
   - Synthesize summary from `event_data`, `previous_state → current_state`, or `actions_executed`

3. **S-03: Fix status card "--"** — `components/home/status-card.tsx:57-59`
   - `current_phase_id` → `current_phase`
   - `milestone_label` → `current_milestone`
   - `complexity` path is correct but verify it reads from context root

## Notes

- All three are simple field renames / additions
- Source of truth: `packages/luca-framework/src/state/types.ts:145-251, 531-541`
- See review: `docs/review/studio/01-home.md`
