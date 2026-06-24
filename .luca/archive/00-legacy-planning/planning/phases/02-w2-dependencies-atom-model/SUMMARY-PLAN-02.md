# Phase 2 Plan 2 Summary: Three-Layer Jotai Atom Model

## Outcome

**Status:** Complete

All three store files created and typecheck passes cleanly.

## Tasks Completed

### Task 1: Server State + Config Draft Atoms

Created `packages/luca-studio/stores/config-atoms.ts` with:

- **Layer 1 (Server State):** `configAtom`, `agentRegistryAtom`, `routingTableAtom`, `stateAtom` -- all `atom<T | null>(null)` pattern
- **Layer 2 (Config Draft):** `configDraftAtom`, `routingDraftAtom` -- writable copies derived from server state atoms

### Task 2: Entity Draft Atoms with atomFamily

Created `packages/luca-studio/stores/entity-atoms.ts` with:

- **Draft atoms:** `agentDraftAtom(name)`, `skillDraftAtom(name)`, `ruleDraftAtom(name)` via `atomFamily` from `jotai/utils`
- **History atoms:** `agentHistoryAtom(name)`, `skillHistoryAtom(name)`, `ruleHistoryAtom(name)` via `withHistory` from `jotai-history` (50-entry limit)

### Task 3: Dirty Tracking Atoms

Created `packages/luca-studio/stores/dirty-tracking.ts` with:

- **Core state:** `dirtySetAtom` (Set<string>), `validationErrorsAtom` (Map<string, string[]>)
- **Derived:** `canSaveAtom` -- true when dirty + no validation errors on dirty keys
- **Helpers:** `markDirtyAtom`, `markCleanAtom`, `setValidationErrorsAtom` -- write atoms for centralized mutation

## Deviations

- **[Rule 3 - Blocking]** `new Set()` without explicit type parameter caused TS2769 error due to `noUncheckedIndexedAccess` + strict mode inferring `Set<unknown>`. Fixed by using `new Set<string>()`.

## Verification

- All three files exist in `packages/luca-studio/stores/`
- `bunx --bun tsc --noEmit` passes with zero errors
- Draft atoms derive initial values from server state atoms
- `atomFamily` produces independent atom instances per entity name
- `dirtySetAtom` + `canSaveAtom` interaction logic covers all three cases (empty, dirty+valid, dirty+errors)
- History atoms wrap drafts with 50-entry limit via `withHistory`

## Files Created

- `packages/luca-studio/stores/config-atoms.ts`
- `packages/luca-studio/stores/entity-atoms.ts`
- `packages/luca-studio/stores/dirty-tracking.ts`
