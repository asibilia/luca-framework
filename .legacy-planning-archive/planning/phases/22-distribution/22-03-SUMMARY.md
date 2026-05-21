---
id: 22-03
title: "build:all integration -- add plugin target to unified build"
status: complete
---

# Summary: 22-03 Build Pipeline Consolidation

## What Was Built

Consolidated all plugin generation logic from `scripts/build-plugin.ts` into `scripts/build-all.ts`, creating a single unified build script that generates all three targets (.claude/, .cursor/, dist/plugin/) in one pass. Extracted shared constants and functions into `scripts/build-shared.ts` for reuse by Plan 22-04's drift checking infrastructure.

## Deliverables

- `scripts/build-shared.ts` -- New shared module exporting 8 items: `COMMAND_EXCLUDED_SKILLS`, `PLUGIN_EXCLUDED_HOOKS`, `SKILL_CATEGORIES`, `AGENT_CATEGORIES`, `generatePluginHooksConfig()`, `generateCommandMarkdown()`, `readVersion()`, `generateReadme()`
- `scripts/build-all.ts` -- Updated to include inline plugin generation (agents, skills, commands, hooks, hooks.json, plugin.json, marketplace.json, README.md) with unified three-target summary
- `scripts/build-plugin.ts` -- Deleted
- `package.json` -- Removed `build:plugin` script

## Verification

- [x] build-shared.ts exports 8 shared items
- [x] build-all.ts generates all 3 targets in one pass
- [x] build-plugin.ts deleted
- [x] build:plugin removed from package.json
- [x] Plugin output identical before/after (SHA-256 checksums match across all 118 files)
- [x] TypeScript compiles (84 pre-existing errors, net zero change)
- [x] All 877 tests pass (0 failures, 6 skips)
- [x] `bun run build:plugin` fails with "Script not found" (expected)

## Deviations

None
