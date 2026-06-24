---
title: Hooks directory consolidation — eliminate impl/, adapters/, thin shims
area: hooks
created: 2026-03-14
source: conversation
---

## Context

The `src/hooks/` directory has three redundant layers: `.sh` shims in `scripts/`, `.ts` implementations in `impl/`, and generated copies in `.claude/hooks/`. The `adapters/` subdirectory also mixes schemas with runtime logic, violating domain architecture conventions.

## Task

Consolidate hooks to a single source of truth with auto-generated shell wrappers.

### Key Changes

1. **Move .ts implementations** from `impl/` to `scripts/` (15 files)
2. **Move runtime helpers** from `impl/__helpers/` to `hooks/__helpers/` (bridge.ts, vault.ts, muninn.ts, hook-io.ts)
3. **Delete all .sh shims** from `scripts/` (replaced by build-generated wrappers)
4. **Create `generate-shell-wrappers.ts`** in `__helpers/` — build-time helper that auto-generates `.sh` wrappers from the hook registry
5. **Update `scripts/build-shared.ts`** — `generateHookOutputs()` calls the new generator instead of copying .sh files
6. **Move adapter files** — schemas to `__schemas/adapter.schemas.ts`, runtime logic to `__helpers/claude-adapter.ts` and `__helpers/adapter-registry.ts`
7. **Delete `impl/` and `adapters/` directories** entirely
8. **Deduplicate CLAUDE_EVENT_MAP** (exists in both `platform-adapters.ts` and `claude.adapter.ts`)
9. **Update barrel** (`hooks/index.ts`) and all internal imports
10. **Update hook-registry.ts** — change `script` fields from `.sh` to `.ts`

### Target Structure

```
src/hooks/
├── __schemas/
│   ├── hook.schemas.ts
│   └── adapter.schemas.ts
├── __helpers/
│   ├── hook-registry.ts, config-generators.ts, portable-hook.ts, platform-adapters.ts (existing)
│   ├── bridge.ts, vault.ts, muninn.ts, hook-io.ts (moved from impl/__helpers/)
│   ├── claude-adapter.ts, adapter-registry.ts (moved from adapters/)
│   └── generate-shell-wrappers.ts (NEW)
├── scripts/
│   └── *.ts (15 hook implementations, moved from impl/)
└── index.ts
```

### Files Affected

- 15 files moved from `impl/` to `scripts/` (import path updates: `./__helpers/` → `../__helpers/`)
- 4 files moved from `impl/__helpers/` to `__helpers/`
- 3 files moved from `adapters/` to `__schemas/` and `__helpers/`
- 1 new file: `generate-shell-wrappers.ts`
- 3 files updated: `build-shared.ts`, `hook-registry.ts`, `hooks/index.ts`
- 15 `.sh` shims deleted, `impl/` and `adapters/` directories deleted

### Verification

- `bunx --bun tsc --noEmit` — all imports resolve
- `bun run build:all` (manual, outside Claude Code) — generates `.claude/hooks/*.sh`
- `bun run check:drift` — generated outputs match source
- Spot check: generated `.sh` wrappers point to `scripts/*.ts`

## Notes

- Plan file: `.claude/plans/fluttering-launching-puzzle.md`
- Dead code to clean up: `_lib/common.sh` reference in `build-shared.ts` (file doesn't exist)
- `build:all` must NOT be run inside Claude Code session (crashes the process)
