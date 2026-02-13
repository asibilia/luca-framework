---
id: "24-01"
status: complete
---

# Summary: Plan 24-01

## What Was Done

- Extracted `NO_MATCHER_SENTINEL` constant to `src/hooks/index.ts`, replacing all `"__no_matcher__"` magic string literals
- Extracted `COMMAND_EXCLUDED_PREFIXES` and `isCommandSkill()` to `scripts/build-shared.ts`, removing duplicate definitions from `build-all.ts`, `check-drift.ts`, and `check-drift.test.ts`
- Unified `generateHooksConfig()` (from `src/hooks/index.ts`) and `generatePluginHooksConfig()` (from `scripts/build-shared.ts`) into a single parameterized `generateClaudeHooksConfig()` function in `build-shared.ts`
- Extracted `generateMarketplaceManifest()` to `scripts/build-shared.ts`, replacing identical inline object literals in 3 files
- Updated all consumers including `scripts/build-claude.ts`, `__tests__/src/hooks/hook-registry.test.ts`, and root `index.ts` barrel export

## Key Changes

- **`src/hooks/index.ts`**: Added `NO_MATCHER_SENTINEL` export; removed `generateHooksConfig()` (moved to unified function in build-shared)
- **`scripts/build-shared.ts`**: Added `COMMAND_EXCLUDED_PREFIXES`, `isCommandSkill()`, `generateClaudeHooksConfig()`, `generateMarketplaceManifest()`; removed `generatePluginHooksConfig()`
- **`scripts/build-all.ts`**: Updated imports to use shared constants and unified functions from `build-shared.ts`
- **`scripts/check-drift.ts`**: Updated imports to use shared constants and unified functions from `build-shared.ts`
- **`scripts/check-drift.test.ts`**: Updated imports to use shared constants and unified functions from `build-shared.ts`
- **`scripts/build-claude.ts`**: Updated to import `generateClaudeHooksConfig` from `build-shared.ts`
- **`__tests__/src/hooks/hook-registry.test.ts`**: Updated to import `generateClaudeHooksConfig` from `build-shared.ts`
- **`index.ts`**: Updated barrel export to reflect `NO_MATCHER_SENTINEL` and `generateClaudeHooksConfig` replacing the removed `generateHooksConfig`

## Verification

- [x] `bun test` passes (938 pass, 0 fail, 6 skip across 70 files)
- [x] `bun run check:drift` passes (zero drift)
- [x] All generated outputs byte-identical to before
- [x] No remaining `"__no_matcher__"` literals in source (only constant definition)
- [x] No remaining local `COMMAND_EXCLUDED_PREFIXES` outside `build-shared.ts`
- [x] No remaining `generateHooksConfig` or `generatePluginHooksConfig` functions
- [x] `generateCursorHooksConfig()` unchanged in `src/hooks/index.ts`

## Issues Encountered

- The plan's file list did not include `scripts/build-claude.ts`, `__tests__/src/hooks/hook-registry.test.ts`, or root `index.ts`, which also imported the removed `generateHooksConfig`. These were discovered and fixed during full test suite verification after Task 3.
