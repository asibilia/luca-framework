# Phase 167 Summary: Hooks Directory Consolidation

## Result: COMPLETE

**Duration:** ~8 minutes (22:42 - 22:50 UTC)
**Commits:** 3 (one per wave)

## What Changed

Eliminated the layered `impl/` and `adapters/` subdirectories from `src/hooks/`, consolidating to the standard domain architecture pattern (`__schemas/`, `__helpers/`, `scripts/`, `index.ts`). The three redundant layers (`.sh` shims in `scripts/`, `.ts` implementations in `impl/`, and generated copies in `.claude/hooks/`) collapsed into a single source of truth where `.ts` files in `scripts/` are the hook implementations and a build-time generator produces `.sh` wrappers automatically.

## Commits

| Wave | Commit | Description |
|------|--------|-------------|
| 1 | `bd5d45a7` | Move 4 helpers from `impl/__helpers/` to `__helpers/`, update 15 import paths |
| 2 | `ac352589` | Redistribute adapter files to `__schemas/` and `__helpers/`, deduplicate `CLAUDE_EVENT_MAP` |
| 3 | `fa92a27a` | Move 15 implementations to `scripts/`, delete `.sh` shims, create wrapper generator, update build pipeline and barrel |

## Files Affected

### Created (1)
- `src/hooks/__helpers/generate-shell-wrappers.ts` — Build-time shell wrapper generator

### Moved (22)
- `src/hooks/impl/__helpers/bridge.ts` -> `src/hooks/__helpers/bridge.ts`
- `src/hooks/impl/__helpers/vault.ts` -> `src/hooks/__helpers/vault.ts`
- `src/hooks/impl/__helpers/muninn.ts` -> `src/hooks/__helpers/muninn.ts`
- `src/hooks/impl/__helpers/hook-io.ts` -> `src/hooks/__helpers/hook-io.ts`
- `src/hooks/adapters/adapter.schemas.ts` -> `src/hooks/__schemas/adapter.schemas.ts`
- `src/hooks/adapters/claude.adapter.ts` -> `src/hooks/__helpers/claude-adapter.ts`
- `src/hooks/adapters/adapter-registry.ts` -> `src/hooks/__helpers/adapter-registry.ts`
- 15 hook implementations: `src/hooks/impl/*.ts` -> `src/hooks/scripts/*.ts`

### Deleted (17)
- 15 `.sh` shim files from `src/hooks/scripts/`
- `src/hooks/adapters/index.ts` (sub-barrel)
- `src/hooks/impl/` directory
- `src/hooks/adapters/` directory

### Modified (5)
- `src/hooks/__helpers/hook-registry.ts` — Script fields `.sh` -> `.ts`
- `src/hooks/__helpers/platform-adapters.ts` — Exported `CLAUDE_EVENT_MAP`
- `src/hooks/__helpers/portable-hook.ts` — Fixed adapter-registry import path
- `src/hooks/index.ts` — Updated adapter exports to use `__schemas/` and `__helpers/`
- `scripts/build-shared.ts` — Uses `generateAllShellWrappers()` instead of reading `.sh` files

## Deviations

- **[Rule 3 - Blocking]** `portable-hook.ts` imported from `../adapters/adapter-registry` which broke after the adapters directory move. Fixed inline by updating to `./adapter-registry` (same directory after consolidation).
- **[Rule 3 - Blocking]** `adapters/index.ts` referenced `./adapter.schemas` which broke after schema moved. Fixed inline with `../__schemas/adapter.schemas` path (needed for typecheck until deletion in Wave 3).
- **[Rule 3 - Blocking]** `adapter.schemas.ts` self-referenced `../__schemas/hook.schemas` which became `./hook.schemas` after moving into `__schemas/`. Fixed inline.

## Verification

All verification criteria met:

1. `bunx --bun tsc --noEmit` exits 0
2. `src/hooks/impl/` does not exist
3. `src/hooks/adapters/` does not exist
4. `src/hooks/scripts/` contains exactly 15 `.ts` files and zero `.sh` files
5. `src/hooks/__helpers/` contains 11 files
6. `src/hooks/__schemas/` contains 2 files
7. `CLAUDE_EVENT_MAP` has exactly one definition (in `platform-adapters.ts`)
8. No `.sh` references in `canonicalHookRegistry` script fields
9. No `./adapters` references in `src/hooks/index.ts`
10. No `_lib/common.sh` dead code in `build-shared.ts`

## Post-Phase Action Required

User must run `bun run build:all` outside Claude Code to regenerate `.claude/hooks/*.sh` wrappers using the new generator. Then run `bun run check:drift` to verify generated outputs match.

## Final Structure

```
src/hooks/
├── __schemas/
│   ├── hook.schemas.ts
│   └── adapter.schemas.ts
├── __helpers/
│   ├── hook-registry.ts
│   ├── config-generators.ts
│   ├── portable-hook.ts
│   ├── platform-adapters.ts
│   ├── bridge.ts
│   ├── vault.ts
│   ├── muninn.ts
│   ├── hook-io.ts
│   ├── claude-adapter.ts
│   ├── adapter-registry.ts
│   └── generate-shell-wrappers.ts
├── scripts/
│   └── *.ts (15 hook implementations)
└── index.ts
```
