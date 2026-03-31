---
title: Statusline rework — skill identity, step progression, and universal status bus
area: observability
created: 2026-03-30
source: conversation
---

## Context

Investigation revealed the statusline system is architecturally sound but not being fed data during execution. It only ever shows `EXECUTING ██████████ 1/1 MODERATE` because of multiple compounding gaps in the data pipeline.

## Task

Rework the statusline to:

1. **Add skill/workflow identity prefix** — show which skill is active: `lu > EXECUTING`, `pr-address > REVIEWING`, `scout > INGESTING`, etc. Format: `[workflow/skill] > [stage/step] [progress] [#/#] [type/detail]`
2. **Fix wave/step counter** — `current_wave_count` defaults to 1 and is never set from the planner's actual wave count, so it always shows `1/1`
3. **Add frequent persistence** — call `persistActor()` after each wave/step, not just at coarse state machine boundaries
4. **Create a lightweight status bus** — a simple status file that any skill/hook can write to (not just the XState machine), so non-`/lu` skills are visible
5. **Propagate step-level granularity** — within `EXECUTING`, show sub-steps (research, discuss, plan, execute, verify, etc.) rather than a single flat state

## Root Causes Identified

| Symptom | Root Cause |
|---|---|
| Always shows `1/1` | `current_wave_count` defaults to 1; wave increments not persisted |
| Always `EXECUTING` | State only transitions at coarse boundaries; mid-step granularity missing |
| No other skills shown | Only the `/lu` XState machine feeds `state.json`; other skills invisible |
| No skill/workflow label | Renderer doesn't track or display the active skill name |
| No step progression | `persistActor()` not called after each step/wave within execution |

## Key Files

- `src/hooks/scripts/statusline.ts` — renderer (source of truth)
- `packages/luca-framework/src/state/machine.ts` — XState machine (~line 440, `total_waves` default)
- `packages/luca-framework/src/state/persistence.ts` — `persistActor()` function
- `packages/luca-framework/src/state/actors/phase-actor.ts` — wave tracking
- `.claude/statusline.sh` — generated wrapper

## Notes

- The statusline hook runs post-response (after every API response), so the rendering frequency is fine — the problem is stale data in `state.json`
- A lightweight status bus (e.g., `.planning/.statusline.json`) could be a simpler alternative to forcing all skills through the XState machine
- Design should preserve the existing visual style while adding the prefix and fixing data flow
