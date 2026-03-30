---
title: "Unify state architecture: computed pipeline position from XState value"
area: state
created: 2026-03-30
source: conversation
---

## Context

The statusline HUD is stuck on "idle" during workflow execution because two state systems (`/tmp/lu-context.json` and `.planning/state.json`) must stay in sync via a fragile one-way bridge (`syncBridgeState`). The bridge only fires when `context-cli write lu` is called, and the crash-recovery resume path skips those writes. Three rounds of architecture review produced a unified plan.

## Task

Eliminate the dual-state architecture by making `pipeline_position` a computed property derived from XState `value` at read time, rather than a stored field. Delete `syncBridgeState()` and the `LU_STATE_TO_BRIDGE_EVENTS` mapping table. Clean up ~700 lines of dead code.

**Full plan:** `~/.claude/plans/lucky-chasing-quiche.md`

### Waves

1. **Wave 1:** Add `computePipelinePosition()` pure function with exhaustive switch, wire into luca-bridge as virtual `read-field`, ensure lu skill fires XState transitions directly at each step boundary, update crash recovery
2. **Wave 2:** Migrate enforcement hooks + edit gate + session-end-audit to read computed position from state.json instead of lu-context.json
3. **Wave 3:** Delete `syncBridgeState()`, `LU_STATE_TO_BRIDGE_EVENTS`, `current_state`/`completed_states` from lu schema, dead CLI file (`cli.ts`), 5 dead bridge commands, dead `reset` command, update session-start stale detection

Each wave requires `bun run build:all` checkpoint between them.

## Notes

- `pipeline_position` is NEVER stored — derived from XState `value` via pure function
- Sub-agent output (lu_route, lu_configure, etc.) stays in `/tmp/lu-context.json` via context-cli
- Other 4 context files (phase-execute, verify, milestone-complete, pr-address) unchanged
- Exhaustive switch in the mapping function gives compile-time safety against state drift
- ~15 files modified, 1 deleted, 1 new file created
