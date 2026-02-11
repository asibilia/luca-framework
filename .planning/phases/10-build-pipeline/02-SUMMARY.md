# Summary: Plan 10-02 — Update Build Scripts, Clean Stale Files, and Add Tests

## Status: COMPLETE

## What Was Accomplished

1. **Created `scripts/build-utils.ts`** — Shared cleanup utilities: `cleanDirectory()`, `cleanSkillsDirectory()`, `ensureDir()`. Handles symlinks, subdirectories, and stale files.
2. **Rewrote `scripts/build-cursor.ts`** — Iterates `agentRegistry` (23 general) + `ruleRegistry` (20 general) alongside existing `skillRegistry`. Cleans output dirs before writing. Generates 25 agents, 36 skills, 21 rules.
3. **Rewrote `scripts/build-claude.ts`** — Same pattern as build-cursor but targets `.claude/` with `.md` rule extension. Generates 25 agents, 36 skills, 21 rules.
4. **Rewrote `scripts/build-all.ts`** — Unified build for both formats. Uses `Promise.all()` for parallel directory cleanup. Generates files to both `.cursor/` and `.claude/` in a single pass.
5. **Created `__tests__/src/agents/agent-registry.test.ts`** — 4 tests: registry covers all source files, no extras, 23 entries, all instantiable.
6. **Created `__tests__/src/rules/rule-registry.test.ts`** — 4 tests: registry covers all source files, no extras, 20 entries, all instantiable.
7. **Created `__tests__/scripts/build-output.test.ts`** — 21 tests: file counts, no symlinks, no subdirectories, every output file maps to a registry entry or luca entity.

## Special Cases Handled

- `.cursor/rules/use-bun-instead-of-node-vite-npm-pnpm.mdc` was a symlink to `../../CLAUDE.md` — now replaced with properly compiled output
- `.cursor/rules/taskmaster/` subdirectory — removed; rules `taskmaster-dev_workflow` and `taskmaster-taskmaster` are flat top-level files
- `lu-workflow` rule exists in both `ruleRegistry` (general) and as luca-specific entity — luca version overwrites registry version, resulting in 20 unique rule files (not 21)

## Decisions Made

- Clean-before-build strategy: all output directories are wiped before writing
- `cleanDirectory()` handles symlinks, subdirectories, and files with matching extensions
- Luca-specific entities remain individually hardcoded (not part of registries, by design)
- Tests rely on `bun run build:all` having been run beforehand (integration tests, not unit tests)

## Files Created/Modified

- `scripts/build-utils.ts` (created)
- `scripts/build-cursor.ts` (rewritten)
- `scripts/build-claude.ts` (rewritten)
- `scripts/build-all.ts` (rewritten)
- `__tests__/src/agents/agent-registry.test.ts` (created)
- `__tests__/src/rules/rule-registry.test.ts` (created)
- `__tests__/scripts/build-output.test.ts` (created)

## Verification

- `bun run build:all` completes without errors
- `.cursor/`: 25 agents, 36 skills, 20 rules (lu-workflow overwritten by luca version)
- `.claude/`: 25 agents, 36 skills, 20 rules
- No symlinks in `.cursor/rules/`
- No subdirectories in `.cursor/rules/`
- 29 new tests passing (4 + 4 + 21)

## Commits

- `a3bf90e` — feat(10-02): add build utilities for stale file cleanup
- `8eac628` — feat(10-02): update build scripts to use registries
- `8dc9b30` — test(10-02): add registry completeness and build output tests
