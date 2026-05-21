# Plan 57-D: Update All Bridge References and Full Validation

## Objective

Update every reference to the old luca-state bridge path across the entire codebase, then run full validation.

## Tasks

### 1. Update bridge path references

Replace all instances of:

- `packages/luca-state/src/bridge.ts` → `packages/luca-framework/src/state/bridge.ts`

This affects:

- `.claude/hooks/` shell scripts
- `.claude/rules/` rule files
- `.cursor/` mirror files
- `src/skills/` skill definitions (prompt content)
- `src/agents/` agent definitions (prompt content)
- `.planning/` documentation
- `scripts/` build scripts

### 2. Update luca-state bin references

Replace any references to the `luca-state` binary with the new path.

### 3. Update test imports

Update test files that import from `packages/luca-state/` paths.

### 4. Run full validation

- `bun test` — all 1791+ tests pass
- `bunx --bun tsc --noEmit` — type check clean
- `bun run build:all` — build succeeds
- `bun run check:drift` — no drift

## Verification

- No remaining references to old paths
- All tests pass
- Type check clean
- Build clean
- No drift
