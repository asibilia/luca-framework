# Plan 81-A Summary — Distribution Blockers: Version Sync & Harness-Aware Update

**Plan:** 81-A
**Phase:** 81 (Distribution Blockers)
**Wave:** 1
**Branch:** `36--v2.5.0-operational-intelligence`
**GitHub Issue:** #36
**Status:** COMPLETE
**Date:** 2026-03-01

## Accomplishments

All 7 tasks completed successfully. Both distribution blockers resolved:

1. **LUCA_VERSION sync (CRITICAL)** — Version is now injected at build time via unbuild's `rollup.replace` plugin, with a runtime fallback for dev mode. The stale `"0.0.1"` sentinel is eliminated.

2. **Harness-aware update (HIGH)** — The update command now detects harness additions/removals, tracks per-harness file sources in the manifest, applies `chmod +x` to hook scripts, and propagates the current version on update.

## Task Completion

| Task | Title                                               | Commit              | Status |
| ---- | --------------------------------------------------- | ------------------- | ------ |
| T1   | Fix LUCA_VERSION sync with package.json             | `b5910f6`           | Done   |
| T2   | Add prepublishOnly and validate-package scripts     | `49930a7`           | Done   |
| T3   | Add harness source tracking to manifest             | `c2d4293`           | Done   |
| T4   | Detect harness additions/removals during update     | `f3d1a49`           | Done   |
| T5   | Apply chmod +x to hook scripts during update        | `72584b9`           | Done   |
| T6   | Update manifest version on update                   | (included in T3/T4) | Done   |
| T7   | Add tests for version sync and harness-aware update | `ab99685`           | Done   |

Additional fix commit: `1e3cc7b` — Updated pre-existing `manifest.test.ts` to expect `LUCA_VERSION` instead of stale `"0.0.1"`.

## Files Modified

### Source files

- `packages/luca-framework/build.config.ts` — Added `rollup.replace` config with `__LUCA_VERSION__` injection
- `packages/luca-framework/src/utils/manifest.ts` — Replaced hardcoded version with build-time sentinel + dev fallback; added `inferFileSource()` and `sourceMap` param to `createManifest()`
- `packages/luca-framework/src/types.ts` — Added `FileSource` type (`"framework" | "user" | \`harness:${HarnessId}\``)
- `packages/luca-framework/src/index.ts` — Updated to use `LUCA_VERSION` for CLI version; added `FileSource` and `LUCA_VERSION` exports
- `packages/luca-framework/src/commands/update.ts` — Added harness diff detection, `collectHarnessFiles()`, `cleanRemovedHarnessFiles()`, `isHookScript()`, `makeExecutable()`, version propagation in `updateManifestAfterUpdate()`
- `packages/luca-framework/package.json` — Added `prepublishOnly` and `validate` scripts

### New files

- `packages/luca-framework/scripts/validate-package.ts` — Package validation script (6 checks)
- `__tests__/packages/luca-framework/version-sync.test.ts` — 10 tests for T1-T2
- `__tests__/packages/luca-framework/harness-update.test.ts` — 23 tests for T3-T6

### Test files updated

- `__tests__/packages/luca-framework/src/utils/manifest.test.ts` — Updated to import `LUCA_VERSION` and expect dynamic version instead of stale `"0.0.1"`

## Test Results

```
402 pass
0 fail
872 expect() calls
Ran 402 tests across 31 files. [1.90s]
```

TypeScript type checking: clean (`bunx --bun tsc --noEmit` exits 0).

## Deviations from Plan

1. **T6 merged into T3/T4:** The manifest version propagation was naturally implemented as part of the `updateManifestAfterUpdate()` refactoring in T3-T4. No separate commit was needed since the changes were already in place.

2. **Pre-existing test fix:** The old `manifest.test.ts` had a test asserting `manifest.version === "0.0.1"` which was validating the broken behavior. This required an additional fix commit (`1e3cc7b`) to update the assertion to use `LUCA_VERSION`.

## Issues Encountered

1. **Pre-commit hook silently blocking commits:** The first attempt at the T7 commit appeared to be blocked by the pre-commit hook running tests/typecheck. The `git add` and `git commit` commands needed to be run separately to work around the hook's interaction with combined commands.

## Success Criteria Verification

- [x] `LUCA_VERSION` in built output matches `package.json` version (R1.1, R1.2)
- [x] `"0.0.1"` no longer appears anywhere in source as version (R1.1)
- [x] `prepublishOnly` script runs build + test (R1.3)
- [x] `validate-package.ts` verifies package correctness (R1.3)
- [x] CLI version report uses dynamic LUCA_VERSION (R1.4)
- [x] Update command reads `manifest.harnesses` (R2.1)
- [x] Per-harness file diffing works via source tracking (R2.2)
- [x] New harness files scaffolded when harness added post-init (R2.3)
- [x] Removed harness files cleaned up when harness removed (R2.4)
- [x] Hook scripts have executable permission after update (R2.2)
- [x] All existing tests pass, new tests cover all scenarios (R1, R2)
- [x] `bunx --bun tsc --noEmit` clean
