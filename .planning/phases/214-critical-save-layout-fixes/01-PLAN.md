---
phase: 214
plan: 1
type: bug
autonomous: true
wave: 1
depends_on: []
---

# Phase 214 Plan 1: Fix Jotai Save Callback Crash

## Objective

Fix the P0 Jotai save callback bug that crashes 5 pages (Agents, Skills, Rules, Config, Pipeline) on mount. The root cause is `set(_saveCallbackAtom, callback)` in `stores/layout.ts:130` where Jotai's primitive atom `set` treats function values as updaters, invoking the callback immediately instead of storing it. Add defense-in-depth guards to prevent similar issues.

## Context

@packages/luca-studio/stores/layout.ts
@packages/luca-studio/hooks/use-entity-save.ts
@packages/luca-studio/hooks/use-config-save.ts
@packages/luca-studio/hooks/use-keyboard-shortcuts.ts
@packages/luca-studio/stores/dirty-tracking.ts

## Tasks

### 1. Fix save callback atom setter

**Type:** auto
**TDD:** false
**Depends on:** none

Wrap the callback value in `set(_saveCallbackAtom, () => callback)` so Jotai stores the function reference instead of invoking it as an updater. When `callback` is `null` (unmount cleanup), pass `null` directly since Jotai does not treat `null` as an updater.

**Files to edit:**

- `packages/luca-studio/stores/layout.ts` (line 130)

**Verification:**

- The `setGlobalSaveCallbackAtom` write atom wraps the callback in a thunk before passing to `set()`
- `null` values pass through without wrapping
- TypeScript compiles without errors: `bunx --bun tsc --noEmit -p packages/luca-studio/tsconfig.json`

### 2. Add ETag null guard in entity save hook

**Type:** auto
**TDD:** false
**Depends on:** none

Change the ETag-missing case in `use-entity-save.ts` from throwing an error to returning early with a `console.warn`. This prevents a crash if save is accidentally triggered before entity data loads (defense-in-depth for the callback bug and any future race conditions).

**Files to edit:**

- `packages/luca-studio/hooks/use-entity-save.ts` (line 62-65)

**Verification:**

- When `etag` is null/undefined, the `save` function returns early with a console.warn instead of throwing
- The warn message includes the entity name for debuggability
- TypeScript compiles without errors

### 3. Add dirty guard in config save hook

**Type:** auto
**TDD:** false
**Depends on:** none

Add a dirty-set check at the top of `useConfigSave`'s `save` function. Read `dirtySetAtom` and return early if `"config"` is not in the dirty set. This prevents unnecessary config saves when the callback fires before any edits.

**Files to edit:**

- `packages/luca-studio/hooks/use-config-save.ts`

**Verification:**

- The `save` function reads the dirty set and returns early if `"config"` is not dirty
- Existing save behavior is preserved when config IS dirty
- TypeScript compiles without errors

### 4. Add try/catch around save callback in keyboard shortcuts

**Type:** auto
**TDD:** false
**Depends on:** none

Wrap the `void saveCallback()` call in `use-keyboard-shortcuts.ts` with a `.catch()` handler so save failures from Cmd+S do not become unhandled promise rejections. Log the error to console for debuggability.

**Files to edit:**

- `packages/luca-studio/hooks/use-keyboard-shortcuts.ts` (line 123-125)

**Verification:**

- The `saveCallback()` invocation is guarded with `.catch()` that logs the error
- Cmd+S still triggers save when a callback is registered
- TypeScript compiles without errors

## Verification

1. Run TypeScript compilation: `bunx --bun tsc --noEmit -p packages/luca-studio/tsconfig.json`
2. Confirm `stores/layout.ts` wraps callback in thunk: the `set()` call uses `() => callback` pattern
3. Confirm `use-entity-save.ts` returns early on null ETag with console.warn
4. Confirm `use-config-save.ts` checks dirty set before saving
5. Confirm `use-keyboard-shortcuts.ts` catches save errors

## Success Criteria

- No save fires on page mount for any of the 5 affected pages
- Save callback is stored correctly in the Jotai atom (not invoked as updater)
- ETag-missing scenario produces a warning, not a crash
- Config save is gated on dirty state
- Cmd+S save errors are caught and logged

## Output Specification

- Modified: `packages/luca-studio/stores/layout.ts`
- Modified: `packages/luca-studio/hooks/use-entity-save.ts`
- Modified: `packages/luca-studio/hooks/use-config-save.ts`
- Modified: `packages/luca-studio/hooks/use-keyboard-shortcuts.ts`
