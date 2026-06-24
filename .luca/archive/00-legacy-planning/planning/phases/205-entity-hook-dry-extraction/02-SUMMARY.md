# Phase 205 Plan 2 Summary: Schema-First Metadata + Dead Undo Cleanup

## Objective

Fix schema-first violations in entity save hook configs by adding Zod validation for FieldKeyMap and metadata extraction. Remove dead canUndo/canRedo destructuring from all three entity page components.

## Tasks Completed

### Task 1: Add Zod schemas for FieldKeyMap and entity save metadata

**Commit:** `c922b051`

- Added `FieldKeyMapSchema` (`z.record(z.string(), z.array(z.string()))`) to validate field key maps
- Added `EntitySaveStaticConfigSchema` for validating the static subset of entity save configs
- Created `validateFieldKeyMap()` helper that uses `safeParse` with development warning on failure and raw-value fallback
- Updated `AGENT_SAVE_CONFIG`, `SKILL_SAVE_CONFIG`, and `RULE_SAVE_CONFIG` to validate their `fieldKeyMap` through `validateFieldKeyMap()`

### Task 2: Remove dead canUndo/canRedo destructuring from entity pages

**Commit:** `8eaff26a`

- Removed unused `canUndo` and `canRedo` from `useUndo` destructuring in:
  - `packages/luca-studio/app/agents/page.tsx`
  - `packages/luca-studio/app/skills/page.tsx`
  - `packages/luca-studio/app/rules/page.tsx`
- The `useUndo` hook itself is unchanged -- it still returns `canUndo`/`canRedo` for internal keyboard shortcut gating

## Verification

- `bunx --bun tsc --noEmit` passes with zero errors
- `grep -rn "canUndo|canRedo" packages/luca-studio/app/` returns zero matches
- All three entity save configs validated via Zod `safeParse`
- No behavioral changes

## Deviations

None.

## Files Modified

- `packages/luca-studio/hooks/schemas/entity-hook-config.ts` -- Added Zod import, schemas, validation helper, wrapped fieldKeyMap values
- `packages/luca-studio/app/agents/page.tsx` -- Removed canUndo/canRedo from destructuring
- `packages/luca-studio/app/skills/page.tsx` -- Removed canUndo/canRedo from destructuring
- `packages/luca-studio/app/rules/page.tsx` -- Removed canUndo/canRedo from destructuring
