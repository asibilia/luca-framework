# Phase 236 Verification — Statusline HUD Workflow Display

**Verified against:** `src/hooks/scripts/statusline.ts`
**Mode:** Quick (SIMPLE complexity)
**Date:** 2026-03-30

---

## Goal

> Add a two-line HUD to the statusline showing workflow state (phase, state, wave progress, complexity, milestone) above the existing system line. Gracefully collapse to idle indicator when no workflow is active.

---

## Requirements Check

### a. Two-line HUD — PASS

When `hudState` is non-null (workflow active), the code emits:

```typescript
process.stdout.write(hudLine + "\n" + systemLine);
```

Two lines: HUD line first, then the system line. Correct.

### b. Workflow state display — PASS

`readWorkflowState()` reads `.planning/state.json` and maps the `value` field through `stateMap` to a `DisplayStateEnum` value (`EXECUTING`, `PLANNING`, `VERIFYING`, `PAUSED`, `FAILED`). The `renderHudLine()` function includes `stateColor(state.displayState)` in the HUD segments. State is shown and color-coded.

### c. Phase number — PASS

Extracted from `children.phase.snapshot.context.phase_id` and formatted as `P${phaseId}` in `phaseLabel`. Rendered via `colors.cyan(state.phaseLabel)` when present.

### d. Wave progress (progress bar with current/total) — PASS

`renderProgressBar()` renders a Unicode block progress bar using filled (`█`) and empty (`░`) characters. When `hasWaveData` is true, the bar and fraction `${current}/${total}` are added to segments. `hasWaveData` is set when `totalWaves > 0`.

### e. Complexity with color coding — PASS

Extracted from `context.complexity`. `complexityColorMap` maps all five levels (TRIVIAL, SIMPLE → green; MODERATE → yellow; COMPLEX → boldYellow; CRITICAL → red). The correct color function is applied to the complexity label in segments.

### f. Milestone version — PASS

Extracted from `context.current_milestone`, truncated to first word (`rawMilestone.split(" ")[0]`). Rendered in gray when present.

### g. HUD line above system line — PASS

Output order in the active-workflow branch:

```typescript
process.stdout.write(hudLine + "\n" + systemLine);
```

HUD is written first (above), system line second (below). Correct ordering.

### h. Graceful collapse to idle indicator — PASS

When `displayState === "idle"` (mapped from unknown/unrecognized state values), `renderHudLine()` returns `colors.gray(` ${state.icon} idle`)` — a compact single-segment idle indicator rather than a full HUD.

### i. Graceful collapse to single line when state.json missing — PASS

`readWorkflowState()` returns `null` on any failure path: file not found (`stateFile.exists()` returns false), JSON parse error, Zod parse failure, or any thrown exception (all caught and return null). The main function handles null cleanly:

```typescript
if (hudState) {
  // two-line output
} else {
  process.stdout.write(systemLine); // single line, no HUD
}
```

Single-line fallback is correct and clean.

---

## Summary

| #   | Requirement                                  | Status |
| --- | -------------------------------------------- | ------ |
| a   | Two-line output (HUD + system)               | PASS   |
| b   | Workflow state (EXECUTING, PLANNING, etc.)   | PASS   |
| c   | Phase label (P236, etc.)                     | PASS   |
| d   | Wave progress bar + fraction                 | PASS   |
| e   | Complexity with color coding                 | PASS   |
| f   | Milestone version                            | PASS   |
| g   | HUD above system line                        | PASS   |
| h   | Idle collapse when workflow idle             | PASS   |
| i   | Single-line fallback when state.json missing | PASS   |

---

```
GOAL_MET: true
REQUIREMENTS_CHECKED: 9
REQUIREMENTS_PASSED: 9
GAPS: none
```
