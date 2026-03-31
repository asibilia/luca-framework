# Phase 236 — Discussion Context: Statusline HUD Workflow Display

**Date:** 2026-03-30
**Complexity:** SIMPLE
**Source spec:** `.planning/todos/pending/statusline-hud-workflow-display.md`

---

## Implementation Status: COMPLETE

The full implementation is present in `src/hooks/scripts/statusline.ts` (402 lines).
Every step described in the spec has been executed.

---

## Spec vs. Implementation Comparison

### Step 1 — Imports

**Spec:** Add `zod` and `lodash/get` imports.
**Implementation:** Both are present at lines 15–16.
**Status:** Done.

### Step 2 — WorkflowHudState schema + readWorkflowState

**Spec:** Add `DisplayStateEnum`, `WorkflowHudStateSchema`, `WorkflowHudState` type, and
`readWorkflowState()` before `main`.
**Implementation:** All present at lines 22–123. State mapping table matches spec exactly
(executing/preflight/routing/discussing/planning/verifying/learning/committing/paused/suspended/failed).
All data source paths match spec (`context.complexity`, `context.current_milestone`,
`children.phase.snapshot.context.*`). Uses `safeParse()` and returns `null` on failure.
**Status:** Done.

### Step 3 — renderProgressBar

**Spec:** Pure function, `total === 0` guard, filled/empty segments with `\u2588`/`\u2591`.
**Implementation:** Identical to spec's code block at lines 135–150.
**Status:** Done.

### Step 4 — renderHudLine

**Spec:** Idle path returns `gray(" ◇ idle")`. Active path builds segments: icon, phase label
(cyan), display state, progress bar + fraction, complexity (color-coded), milestone (gray).
Join with double-space.
**Implementation:** Lines 159–231. Logic matches spec exactly, including all color mappings
(green=TRIVIAL/SIMPLE, yellow=MODERATE, boldYellow=COMPLEX, red=CRITICAL) and the
`hasWaveData` guard around the progress bar.
**Status:** Done.

### Step 5 — boldYellow helper

**Spec:** Add `const boldYellow = (t: string) => c("1;33", t)` inside `main`.
**Implementation:** Present at line 257.
**Status:** Done.

### Step 6 — Call readWorkflowState in main

**Spec:** `const hudState = await readWorkflowState(pd)` before git branch resolution.
**Implementation:** Line 328, placed correctly after context-metrics write and before git
branch block.
**Status:** Done.

### Step 7 — Two-line output

**Spec:** `systemLine` variable, `if (hudState)` branch with `hudLine + "\n" + systemLine`,
else single-line fallback. Color helpers passed: `green, yellow, blue, red, gray, boldYellow`.
**Implementation:** Lines 383–397.
**Minor divergence:** The implementation passes `cyan` as an additional color helper in the
call to `renderHudLine` (line 391). The spec's Step 7 snippet did not list `cyan` in the
helpers object, but `renderHudLine`'s signature (defined in Steps 4/current impl) does
accept `cyan` and uses it for the phase label. This is a **beneficial addition** — the
spec's Step 7 code snippet was incomplete (it listed only the delta changes), but the
function signature always required `cyan`. Omitting it would have caused a TypeScript error.
**Status:** Done (implementation is more complete than the spec snippet suggested).

---

## Gaps Found: 0

No functional gaps. The `cyan` addition in the Step 7 call is not a gap — it is required
by the `renderHudLine` signature and was implied by the function design in Step 4.

---

## Risks and Edge Cases

All four verification edge cases from the spec are addressed by the implementation:

| Edge Case                 | How Handled                                                                |
| ------------------------- | -------------------------------------------------------------------------- |
| `state.json` missing      | `Bun.file().exists()` check at line 57 returns `null` → single-line output |
| `value: "idle"`           | stateMap miss → `{ displayState: "idle", icon: "◇" }` → idle HUD line      |
| `total_waves: 0`          | `hasWaveData: false` → progress bar segment skipped                        |
| Empty `current_milestone` | `milestone: ""` → milestone segment skipped                                |

**Remaining verification concern:** The build artifact (`.claude/statusline.sh`) has not
been regenerated since the source change — `bun run build:all` was intentionally deferred
(per MEMORY.md: running `build:all` during a Claude Code session crashes the process).
The user must run `bun run build:all` manually outside the session to deploy the change.

**TypeScript check:** `bunx --bun tsc --noEmit` passes with no errors (verified during this
discussion pass).

---

## Recommendation: verify-existing

The implementation is complete, correct, and type-clean. No re-implementation or gap-fixing
is needed.

**Next step for the executor:** Skip straight to verification.

1. User runs `bun run build:all` outside the session to regenerate `.claude/statusline.sh`.
2. Start a new Claude Code session; confirm two-line HUD appears.
3. Confirm graceful fallback when `state.json` is absent.
4. Mark todo complete and close phase.
