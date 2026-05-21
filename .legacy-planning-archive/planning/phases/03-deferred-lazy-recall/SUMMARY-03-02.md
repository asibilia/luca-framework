# SUMMARY: PLAN-03-02 — Deferred Recall Consumers

**Status:** COMPLETE
**Phase:** 3
**Wave:** 2
**Started:** 2026-03-09T20:02:34Z
**Completed:** 2026-03-09T20:08:00Z
**Duration:** ~5 minutes

## Objective

Update the three consumer files that reference memory loading: lu-cognition's prompt (make selective recall conditional on `eager_recall`), phase-execute's memory loading step (reference deferred API), and phase-plan's cognitive context step (reference deferred API).

## Tasks Completed

### Task 1: Update lu-cognition prompt for deferred default

**Commit:** `b28ec9c6`

Changes to `src/agents/general/lu-cognition.agent.ts`:

- Added `eager_recall: true` to lu-cognition's own frontmatter cognition config (lu-cognition is always eager)
- Added deferred recall gate at the top of `selective_recall` step -- checks `eager_recall !== true` before proceeding
- Added note about `z.boolean().optional()` implementation (check via `!eager_recall`, not `=== false`)
- Gated `load_global_memory` step by `eager_recall` flag
- Added "Deferred Recall Report" variant to `generate_report` step for agents with deferred recall
- Updated "Cognition Profile section" heading to indicate it's the `eager_recall=true` path

### Task 2: Update phase-execute memory loading to deferred API

**Commit:** `08496e7e`

Changes to `src/skills/general/phase-execute.skill.ts`:

- **Location A (Step 4):** Replaced direct `mcp__muninn__muninn_recall()` + `buildMemoryContextBlock()` with deferred cache pattern: `hasRecallCache()` -> `setCachedRecall()` -> `requestMemoryContext()`
- **Location B (Learning capture):** Replaced dual `mcp__muninn__muninn_recall()` calls with cache-aware pattern that reuses Step 4's cached recall results
- Both locations now use `requestMemoryContext()` as the preferred API
- Added notes that `buildMemoryContextBlock()` remains available for custom formatting

### Task 3: Update phase-plan cognitive context to deferred API

**Commit:** `a26e3301`

Changes to `src/skills/general/phase-plan.skill.ts`:

- **Step 0 substep 2:** Replaced direct `mcp__muninn__muninn_recall()` with `hasRecallCache()` / `setCachedRecall()` deferred cache pattern
- **Step 8:** Replaced `buildMemoryContextBlock()` with `requestMemoryContext()` for sub-agent memory formatting
- Brain tree recall (substep 1) unchanged -- always loaded eagerly
- Procedure recall (substep 2.5) unchanged -- separate concern from cached recall
- `--skip-memory` flag still gates the entire Step 0 (unchanged behavior)

## Verification

- `bunx --bun tsc --noEmit` passes after all three tasks
- All three files reference the deferred recall API (`requestMemoryContext`, `hasRecallCache`, `setCachedRecall`)
- lu-cognition frontmatter has `eager_recall: true`
- Default path (eager_recall: false/undefined) skips recall and logs "DEFERRED"
- Eager path (eager_recall: true) preserves existing behavior exactly
- No deviation from plan required

## Deviations

None. All three tasks executed as planned.

## Files Modified

| File                                        | Changes                                                                                                         |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `src/agents/general/lu-cognition.agent.ts`  | Added `eager_recall: true` to frontmatter, deferred gate in selective_recall/load_global_memory/generate_report |
| `src/skills/general/phase-execute.skill.ts` | Step 4 + learning capture use deferred cache pattern with `requestMemoryContext()`                              |
| `src/skills/general/phase-plan.skill.ts`    | Step 0 substep 2 uses deferred cache, Step 8 uses `requestMemoryContext()`                                      |

## Success Criteria

- [x] lu-cognition frontmatter has `eager_recall: true`
- [x] `selective_recall` step checks `eager_recall` before proceeding
- [x] `load_global_memory` step is gated by `eager_recall`
- [x] `generate_report` step handles deferred case
- [x] Default path skips recall and logs "DEFERRED"
- [x] Eager path preserves existing behavior exactly
- [x] phase-execute Step 4 references deferred API
- [x] phase-execute learning capture uses cached recall
- [x] phase-plan Step 0 substep 2 uses deferred cache pattern
- [x] phase-plan sub-agent formatting uses `requestMemoryContext()`
- [x] Brain tree recall unchanged
- [x] Procedure recall unchanged
- [x] `--skip-memory` flag unchanged
- [x] `bunx --bun tsc --noEmit` passes
