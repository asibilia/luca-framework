# Phase 10 Plan 1 Summary: Runtime Compatibility and Dead Code Closure

## Result: PASS

All 7 audit findings resolved. `bunx --bun tsc --noEmit` passes with zero errors.

## Tasks Completed

### 1. CRIT-1: Replace Bun-only APIs with node:fs/node:crypto equivalents

- **lib/etag.ts**: Replaced `Bun.CryptoHasher` with `createHash` from `node:crypto`
- **lib/entity-route-helpers.ts**: Replaced `Glob` from `"bun"` with `readdir` + manual filtering; replaced all `Bun.file()` calls with `readFile`/`access` from `node:fs/promises`
- **lib/config-section-handler.ts**: Replaced `Bun.file()` with `access` + `readFile` from `node:fs/promises`
- **lib/ts-round-trip.ts**: Replaced `Bun.file().text()` with `readFile`, `Bun.write()` with `writeFile` from `node:fs/promises`
- **app/api/state/route.ts**: Replaced `Bun.file()` with `access` + `readFile`
- **app/api/ledger/route.ts**: Replaced `Bun.file()` with `access` + `readFile`

### 2. CRIT-2: Delete dead shared-constant-registry

- Deleted `lib/shared-constant-registry.ts` (broken imports to non-existent `~/agents/__helpers/` paths, zero consumers)

### 3. CRIT-3: Fix sidecar barrel import violation

- Updated `sidecar/compiler.ts` to import from `../../../src/compilers/index.ts` instead of `../../../src/compilers/__helpers/compile.ts`

### 4. HIGH-5: Deduplicate ETag computation in config route

- Removed inline `computeETag()` function from `app/api/config/route.ts`
- Removed unused `import { createHash } from "node:crypto"`
- Added `import { computeETag } from "~/lib/etag"` (shared utility)
- Also replaced remaining `Bun.file()` calls in this route with `node:fs/promises`

### 5. HIGH-6: Fix dynamic import in ts-round-trip writeEntityFile

- Consolidated with Task 1: removed `const { rename } = await import("node:fs/promises")`
- Added `rename` to top-level static `import { readFile, rename, writeFile } from "node:fs/promises"`

### 6. MED-3: Remove unnecessary "use client" directive

- Removed `"use client"` from `stores/pipeline-atoms.ts` (Jotai atoms are plain JS objects)

### 7. MED-5: Document camelCase exception in HarnessSectionSchema

- Added JSDoc note to `HarnessSectionSchema` in `lib/config-section-schemas.ts` explaining that `maxFixIterations` and `failFast` intentionally use camelCase to match the canonical `src/harness/__schemas/` shape

## Deviations

- Updated JSDoc `@example` in `ts-round-trip.ts` `extractConfigFromSource()` to use `readFile()` instead of `Bun.file().text()` for consistency with the actual API change (not in plan, but necessary for documentation accuracy)

## Verification Results

1. `bunx --bun tsc --noEmit` -- PASS (zero errors)
2. `from "bun"` in `packages/luca-studio/` -- zero matches
3. `Bun.file|Bun.write|Bun.CryptoHasher` in `packages/luca-studio/` -- only `sidecar/compiler.ts` (intentional, runs under Bun)
4. `shared-constant-registry` imports in source code -- zero matches
5. `__helpers/compile` in `sidecar/compiler.ts` -- zero matches
6. `function computeETag` in `app/api/config/route.ts` -- zero matches
7. `await import(` in `ts-round-trip.ts` -- zero matches
8. `"use client"` in `stores/pipeline-atoms.ts` -- zero matches

## Files Modified

- `packages/luca-studio/lib/etag.ts`
- `packages/luca-studio/lib/entity-route-helpers.ts`
- `packages/luca-studio/lib/config-section-handler.ts`
- `packages/luca-studio/lib/ts-round-trip.ts`
- `packages/luca-studio/app/api/state/route.ts`
- `packages/luca-studio/app/api/ledger/route.ts`
- `packages/luca-studio/app/api/config/route.ts`
- `packages/luca-studio/sidecar/compiler.ts`
- `packages/luca-studio/stores/pipeline-atoms.ts`
- `packages/luca-studio/lib/config-section-schemas.ts`

## Files Deleted

- `packages/luca-studio/lib/shared-constant-registry.ts`
