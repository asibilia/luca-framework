# Phase 28 Plan 01 — Deprecate Per-Platform Build Scripts & Move Hook Config

**Phase:** 28 — Build Script Cleanup
**Requirements:** BUILD-01 (deprecate scripts), BUILD-02 (move hook config)
**Complexity:** MODERATE

## Objective

Remove the redundant per-platform build scripts (`build-claude.ts`, `build-cursor.ts`) that duplicate logic already consolidated in `generateAllOutputs()`, and co-locate `generateClaudeHooksConfig()` with the rest of the hooks module in `src/hooks/index.ts`.

## Context

- `build-all.ts` calls `generateAllOutputs()` from `build-shared.ts` — the single source of truth
- `build-claude.ts` (263 lines) and `build-cursor.ts` (256 lines) duplicate ~90% of that logic
- `generateClaudeHooksConfig()` lives in `scripts/build-shared.ts` but belongs in `src/hooks/` alongside `generateCursorHooksConfig()`
- `index.ts` line 74 re-exports `generateClaudeHooksConfig` from `scripts/build-shared` — a boundary violation (scripts/ -> src/ dependency inversion)

## Tasks

### Wave 1

1. **Move `generateClaudeHooksConfig()` to `src/hooks/index.ts`**
   - Cut function from `scripts/build-shared.ts`
   - Paste into `src/hooks/index.ts` (next to `generateCursorHooksConfig()`)
   - Update all imports:
     - `scripts/build-shared.ts`: import from `../src/hooks/index`
     - `scripts/build-claude.ts`: import from `../src/hooks/index` (before deletion)
     - `index.ts`: re-export from `./src/hooks/index` instead of `./scripts/build-shared`
     - `__tests__/src/hooks/hook-registry.test.ts`: verify imports

2. **Delete `build-claude.ts` and `build-cursor.ts`**
   - Remove `scripts/build-claude.ts`
   - Remove `scripts/build-cursor.ts`
   - Remove `build:claude` and `build:cursor` scripts from `package.json`

3. **Update stale error messages in `build-all.ts`**
   - Line 284: Remove reference to "CursorCompiler and ClaudeCompiler"
   - Update to reference functional compile module

## Verification

- `bun test` — all 992+ tests pass
- `bun run build:all` — generates all outputs successfully
- `bun run check:drift` — zero drift
- No references to deleted files remain in imports

## Success Criteria

- [ ] BUILD-01: `build-claude.ts` and `build-cursor.ts` deleted
- [ ] BUILD-02: `generateClaudeHooksConfig()` lives in `src/hooks/index.ts`
- [ ] `index.ts` exports from `./src/hooks/index` (no scripts/ dependency)
- [ ] `package.json` no longer has `build:claude` or `build:cursor` scripts
- [ ] All tests pass, zero drift
