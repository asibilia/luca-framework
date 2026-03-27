# Phase 213 -- DRY & Convention Cleanup -- Summary

**Phase:** 213
**Type:** Refactor (mechanical cleanup)
**Complexity:** SIMPLE
**Status:** Complete

## Objective

Eliminate duplicated constants, align type conventions, migrate to Bun APIs, and remove dead code across luca-studio.

## Tasks Completed

### Task 1: Extract STUDIO_PATH_PREFIXES + SIDECAR constants

**Commit:** `e5ef1d9f`

Added `STUDIO_PATH_PREFIXES`, `SIDECAR_URL`, and `SIDECAR_TIMEOUT_MS` to `~/lib/constants.ts`. Updated three consumer files to import from the shared module instead of defining locally:

- `app/api/git/publish/route.ts` -- removed local `STUDIO_PATH_PREFIXES`
- `app/api/compile/route.ts` -- removed local `SIDECAR_URL` and `SIDECAR_TIMEOUT_MS`
- `app/api/compile/status/route.ts` -- removed local `SIDECAR_URL` (kept `HEALTH_TIMEOUT_MS` local since it differs from the compile timeout)

### Task 2: Migrate node:fs/promises to Bun.file()

**Commit:** `addff744`

In `lib/entity-route-helpers.ts`:

- Replaced 3x `readFile(filePath, "utf-8")` with `Bun.file(filePath).text()`
- Replaced 2x `access(path).then(...)` with `Bun.file(path).exists()`
- Removed `readFile` and `access` from `node:fs/promises` import (kept `readdir`)

### Task 3: Align interface/type convention

**Commit:** `0b1c88fe`

Converted internal-only `interface` declarations to `type` aliases:

- `hooks/use-sse.ts` -- 7 payload types + 1 helper type (8 total)
- `lib/compile-events.ts` -- `CompileEventState`
- `lib/entity-route-helpers.ts` -- `EntitySummary`, `EntityDetail`

### Task 4: Extract entityType-to-domainPlural mapping

**Commit:** `63bfb7ab`

Added `ENTITY_DOMAIN` lookup constant to `entity-tab-container.tsx`. Replaced 4 ternary chains:

- 2x plural domain mapping (`"agents"/"skills"/"rules"`) replaced with `ENTITY_DOMAIN[entityType]`
- 1x capitalized label replaced with `entityType.charAt(0).toUpperCase() + entityType.slice(1)`
- 1x `entityLabel` replaced with `entityType` (was a no-op identity ternary)

### Task 5: Remove dead code

**Commit:** `66d6b139`

- Removed unused `_payload` parse in `state:transition` handler (kept re-fetch logic)
- Replaced `console.log` in `ledger:entry` handler with a placeholder comment
- Removed unused `StateTransitionPayload` and `LedgerEntryPayload` type aliases
- Added missing barrel exports to `stores/index.ts`: `compileStatusAtom`, `conflictAtom`, `configEtagAtom`, and their associated types

## Deviations

- **[Rule 2 -- Missing Critical]** Added `configEtagAtom` to the barrel export alongside `compileStatusAtom` and `conflictAtom`. It was also missing from the barrel and is actively consumed by `use-sse.ts`.
- **[Rule 1 -- Bug]** Removed `StateTransitionPayload` and `LedgerEntryPayload` type aliases that became dead code after removing their only usage sites in Task 5.

## Files Modified

| File                                                              | Tasks |
| ----------------------------------------------------------------- | ----- |
| `packages/luca-studio/lib/constants.ts`                           | 1     |
| `packages/luca-studio/app/api/git/publish/route.ts`               | 1     |
| `packages/luca-studio/app/api/compile/route.ts`                   | 1     |
| `packages/luca-studio/app/api/compile/status/route.ts`            | 1     |
| `packages/luca-studio/lib/entity-route-helpers.ts`                | 2, 3  |
| `packages/luca-studio/hooks/use-sse.ts`                           | 3, 5  |
| `packages/luca-studio/lib/compile-events.ts`                      | 3     |
| `packages/luca-studio/components/shared/entity-tab-container.tsx` | 4     |
| `packages/luca-studio/stores/index.ts`                            | 5     |

## Verification

All tasks verified via `bunx --bun tsc --noEmit` after each commit. No new type errors introduced (pre-existing errors in unrelated files remain unchanged).
