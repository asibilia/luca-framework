---
id: 89-B
title: "Refactor remaining impure barrel files"
phase: 89
wave: 1
complexity: SIMPLE
---

# 89-B: Refactor Remaining Impure Barrel Files

## Objective

Clean the last impure barrel `index.ts` files so that every domain's `index.ts` contains only re-export statements — no logic, no registries, no constants. This enforces the structural invariant documented in `.claude/rules/domain-architecture.md` and `.claude/rules/module-boundary.md`.

Phase 87-B cleaned 5 of 7 originally identified impure barrels. This plan addresses the remaining 2.

## Context

@file packages/luca-framework/src/index.ts (46 lines — contains CLI defineCommand logic)
@file src/harness/parsers/index.ts (25 lines — contains parserRegistry object + imports)
@file .claude/rules/domain-architecture.md (barrel invariant rule)
@file .claude/rules/module-boundary.md (barrel index invariant)

### Already-Clean Barrels (confirmed via codebase review)

These were originally on the todo list but are already pure barrels:

- `packages/luca-framework/src/adapters/index.ts` — Pure barrel, re-exports from `adapter-factory.ts`
- `packages/luca-framework/src/utils/doctor/index.ts` — Pure barrel, re-exports from `run-doctor.ts`
- `src/rules/index.ts` — Pure barrel
- `src/agents/index.ts` — Pure barrel
- `src/skills/index.ts` — Pure barrel

### Remaining Impure Barrels

1. **`packages/luca-framework/src/index.ts`** (46 lines)
   - Contains `defineCommand` CLI entry point with `citty` import
   - Contains `runMain` and `runInit` functions with lazy imports
   - Re-exports types and `LUCA_VERSION`
   - **Fix:** Extract CLI logic to `packages/luca-framework/src/cli.ts`, keep `index.ts` as pure barrel

2. **`src/harness/parsers/index.ts`** (25 lines)
   - Contains `parserRegistry` object (Record mapping parser names to factory functions)
   - Also re-exports individual parsers
   - **Fix:** Extract `parserRegistry` to `src/harness/parsers/parser-registry.ts`, keep `index.ts` as pure barrel
   - **Note:** This is a documented exception in `.claude/rules/module-boundary.md` (Rule 5) because the parser registry imports from its own `__schemas/`. The barrel still needs to be pure; only the cross-tier import exception remains.

## Tasks

### Task 1: Extract CLI logic from packages/luca-framework/src/index.ts

**Goal:** Move `defineCommand`, `runMain`, and `runInit` to a new `cli.ts` file. The barrel `index.ts` should only re-export types and `LUCA_VERSION`.
**Files:**

- `packages/luca-framework/src/index.ts` (modify — remove logic, keep re-exports)
- `packages/luca-framework/src/cli.ts` (create — receives extracted CLI logic)
- `packages/luca-framework/bin/luca.js` (update import path if it imports from `index.ts`)
- `packages/luca-framework/package.json` (check `main` and `bin` fields)

**Steps:**

1. Create `packages/luca-framework/src/cli.ts` with the `defineCommand`, `runMain`, `runInit` logic
2. Update `packages/luca-framework/src/index.ts` to be a pure barrel:
   ```typescript
   // CLI entry points
   export { runMain, runInit } from "./cli";
   // Types
   export type { ProjectContext, BrandingConfig, LucaConfig, ... } from "./types";
   // Version
   export { LUCA_VERSION } from "./utils/manifest";
   ```
3. Update any consumers that import `runMain` or `runInit` from the package
4. Verify `bin/luca.js` still works by checking its import path

**Verification:**

- [ ] `packages/luca-framework/src/index.ts` contains only `export` and `export type` statements
- [ ] `bun run packages/luca-framework/bin/luca.js --help` works
- [ ] `bunx --bun tsc --noEmit` passes

### Task 2: Extract parserRegistry from src/harness/parsers/index.ts

**Goal:** Move `parserRegistry` to a dedicated file. The barrel `index.ts` should only re-export.
**Files:**

- `src/harness/parsers/index.ts` (modify — remove registry, keep re-exports)
- `src/harness/parsers/parser-registry.ts` (create — receives extracted registry)
- `src/harness/index.ts` (check if it imports parserRegistry from parsers barrel)

**Steps:**

1. Create `src/harness/parsers/parser-registry.ts` containing:
   - The `OutputParser` type import
   - Individual parser imports
   - The `parserRegistry` Record
2. Update `src/harness/parsers/index.ts` to be a pure barrel:
   ```typescript
   export { parserRegistry } from "./parser-registry";
   export { parseTscOutput } from "./tsc";
   export { parseBunTestOutput } from "./bun-test";
   export { parseEslintOutput } from "./eslint";
   export { parseGenericOutput } from "./generic";
   ```
3. Update any consumers that import `parserRegistry` directly from `parsers/index.ts`
4. Update the documented exception in `.claude/rules/module-boundary.md` Rule 5 to reference `parser-registry.ts` instead of `parsers/index.ts`

**Verification:**

- [ ] `src/harness/parsers/index.ts` contains only `export` statements
- [ ] `bunx --bun tsc --noEmit` passes
- [ ] `bun test __tests__/src/harness/` passes

### Task 3: Verify all barrels are now pure

**Goal:** Confirm the structural invariant holds across all domain `index.ts` files
**Files:** All `index.ts` files under `src/` and `packages/luca-framework/src/`
**Steps:**

1. Run `bun test` to confirm no regressions
2. Run `bunx --bun tsc --noEmit` to confirm type safety
3. Optionally grep all `index.ts` files for non-export statements to confirm purity

**Verification:**

- [ ] All domain `index.ts` files contain only re-export statements
- [ ] `bun test` passes (no regressions from refactor)
- [ ] `bunx --bun tsc --noEmit` passes

## Success Criteria

- [ ] `packages/luca-framework/src/index.ts` is a pure barrel (re-exports only)
- [ ] `src/harness/parsers/index.ts` is a pure barrel (re-exports only)
- [ ] `bun test` passes with no new failures
- [ ] `bunx --bun tsc --noEmit` passes
- [ ] CLI still functions: `bun run packages/luca-framework/bin/luca.js --help`
