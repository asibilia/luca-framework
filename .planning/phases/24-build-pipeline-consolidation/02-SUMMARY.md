---
id: "24-02"
status: complete
---

# Summary: Plan 24-02

## What Was Done

- Extracted `generateAllOutputs()` into `scripts/build-shared.ts` as the single compilation pipeline
- Migrated `scripts/check-drift.ts` from 16 imports + `generateToTemp()` to 1 import from `build-shared`
- Migrated `scripts/check-drift.test.ts` from 16 imports + `generateExpected()` + 3 compiler instantiations to 7 imports from `build-shared`
- Migrated `scripts/build-all.ts` from 16 imports + inline compilation to 3 imports (build-shared, build-utils, path)
- Eliminated ~290 lines of triplicated compilation logic across the three consumers
- Resolved DEDUP-01 (compilation pipeline deduplication), DEDUP-03 (unused `tempDir` parameter), and CLEAN-03 (error handling consolidation to fail-fast)

## Key Changes

- `scripts/build-shared.ts` (+260 lines): Added `generateAllOutputs()`, re-exported registries and `generateCursorHooksConfig`
- `scripts/check-drift.ts` (-268 lines): Removed `generateToTemp()` and all `src/` imports
- `scripts/check-drift.test.ts` (-228 net lines): Removed `generateExpected()`, compiler instantiations, and all `src/` type/entity imports
- `scripts/build-all.ts` (-449 net lines): Removed all compilation logic, kept only filesystem concerns (directory management, file writing, chmod, settings.json merge, progress logging)

## Import Graph After

```
build-shared.ts  <-- imports from 16+ src/ modules (single hub)
  |
  +-- check-drift.ts      (1 import: build-shared)
  +-- check-drift.test.ts (4 imports: bun:test, node:fs, path, build-shared)
  +-- build-all.ts        (3 imports: build-shared, build-utils, path)
```

## Verification

- [x] `bun test` passes (938 pass, 0 fail)
- [x] `bun run check:drift` passes (zero drift)
- [x] `bun run build:all` completes successfully (309 files)
- [x] All outputs byte-identical to before this plan
- [x] Hook scripts have executable permissions after build
- [x] `.claude/settings.json` hooks section correctly merged

## Issues Encountered

- None. The migration was straightforward because `generateAllOutputs()` follows the exact same compilation logic that was duplicated across all three consumers.
