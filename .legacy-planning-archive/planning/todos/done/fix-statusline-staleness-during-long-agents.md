---
title: Fix statusline showing idle during long-running executor agents
area: hooks
created: 2026-04-01
source: conversation
---

## Context

The statusline HUD shows "idle" when lu-executor runs for more than 5 minutes. The `agent-status-sync` hook writes to the status bus only on Agent tool calls, but long-running agents make Read/Edit/Bash calls, so the bus timestamp freezes. The `readStatusBus()` default TTL of 5 minutes causes it to return null, and the statusline falls back to state.json which shows "idle".

## Task

Two-part fix:

1. **Increase read TTL** in `src/shared/__helpers/status-bus.ts`: change `readStatusBus` default `maxAgeMs` from `300_000` (5 min) to `1_800_000` (30 min). Extract both TTL values as named constants (`WRITE_MERGE_TTL_MS`, `READ_STALENESS_TTL_MS`). Fix stale JSDoc on line 65 that says `(default: 60000)`.

2. **Add explicit bus clearing on session end** in `src/hooks/scripts/session-persist.ts`: import and call `clearStatusBus()` before exit to prevent stale data bleeding into the next session.

3. **Update comment** in `src/hooks/scripts/skill-status-exit.ts` line 11: change "5-minute" to "30-minute".

## Notes

- `writeStatusBus` merge guard stays at 5 min (different concern)
- `agent-status-sync.ts:142` uses `Number.MAX_SAFE_INTEGER` — untouched
- `clearStatusBus()` already exists but is never called anywhere
- Full plan at `.claude/plans/goofy-bubbling-twilight.md`
