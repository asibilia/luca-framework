---
id: 22-04
title: "Drift detection extension for plugin output"
status: complete
---

# Summary: 22-04 Drift Detection Extension for Plugin Output

## What Was Built

Extended the drift detection system to cover all `dist/plugin/` output files. The drift checker (`check-drift.ts`), drift tests (`check-drift.test.ts`), and pre-commit hook (`pre-commit-drift-check.sh`) now detect manual edits to any plugin output file. All three consumers (build-all.ts, check-drift.ts, check-drift.test.ts) import shared constants and functions from `build-shared.ts` to guarantee byte-identical output.

## Deliverables

- `scripts/check-drift.ts` -- Extended `generateToTemp()` with plugin output entries covering agents, skills, commands, hook scripts, hooks.json, plugin.json, marketplace.json, and README.md. Added imports for PluginCompiler, generatePluginManifest, and all build-shared exports. Removed unused node:fs/node:os imports.
- `scripts/check-drift.test.ts` -- Added "Plugin Output Freshness" test suite (8 tests: agents, skills, commands, hook scripts, hooks.json, plugin.json, marketplace.json, README.md) and "Plugin No Orphan Outputs" test suite (4 tests: agents, skills, commands, scripts directories). Added PluginCompiler and build-shared imports.
- `src/hooks/scripts/pre-commit-drift-check.sh` -- Extended staged file pattern to include `dist/plugin/*` and `src/compilers/*` alongside existing `.claude/*`, `.cursor/*`, and `src/*` patterns.
- `.claude/hooks/pre-commit-drift-check.sh` -- Propagated updated hook script via build:all.
- `.cursor/hooks/pre-commit-drift-check.sh` -- Propagated updated hook script via build:all.

## Verification

- [x] `generateToTemp()` generates entries for all `dist/plugin/` files (~120 new entries)
- [x] `bun run check:drift` reports no drift after clean `bun run build:all` (exit code 0)
- [x] "Plugin Output Freshness" suite has 8 tests covering all plugin file types
- [x] "Plugin No Orphan Outputs" suite has 4 tests covering agents, skills, commands, scripts
- [x] Total test count: 30 drift tests (18 existing + 12 new), 889 total across full suite
- [x] Pre-commit hook pattern includes `dist/plugin/*` and `src/compilers/*`
- [x] Updated hook propagated to both `.claude/hooks/` and `.cursor/hooks/`
- [x] All 889 tests pass (0 failures, 6 skips)
- [x] No regressions in existing test suites
- [x] TypeScript errors are pre-existing (84 errors, net zero change from this plan)
- [x] Total drift-checked files: ~310 (existing ~192 + new ~118 plugin entries)

## Architecture Notes

- **Single source of truth**: `build-shared.ts` is imported by all three consumers -- no constant or function is duplicated
- **Determinism**: All generated content is byte-identical to `build-all.ts` output because both scripts use the same registries, compilers, and shared utilities
- **Plugin hook filtering**: `PLUGIN_EXCLUDED_HOOKS` set excludes `pre-commit-drift-check` from plugin packaging (development-only hook)
- **Command filtering**: `COMMAND_EXCLUDED_SKILLS` set excludes internal-only skills from command generation

## Files Changed

| File                                          | Change                                                     |
| --------------------------------------------- | ---------------------------------------------------------- |
| `scripts/check-drift.ts`                      | +174 lines (plugin entries in generateToTemp, new imports) |
| `scripts/check-drift.test.ts`                 | +376 lines (2 new test suites with 12 tests, new imports)  |
| `src/hooks/scripts/pre-commit-drift-check.sh` | +2 patterns in staged file match                           |
| `.claude/hooks/pre-commit-drift-check.sh`     | Propagated from source                                     |
| `.cursor/hooks/pre-commit-drift-check.sh`     | Propagated from source                                     |
