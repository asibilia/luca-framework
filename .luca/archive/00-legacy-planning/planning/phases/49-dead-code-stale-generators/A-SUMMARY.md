---
id: 49-A
status: complete
tasks_completed: [T1, T2, T3]
files_changed:
  - src/agents/general/lu-executor.agent.ts (deleted)
  - src/agents/general/lu-planner.agent.ts (deleted)
  - scripts/generate-rules-from-cursor.ts (modified)
---

# Summary: Plan 49-A -- Remove Dead Agents and Fix Stale Code Generator

## Outcome

Removed two dead duplicate agent files from `src/agents/general/` that shadowed canonical versions in `src/agents/luca/`, and fixed the rule code generator to emit the functional `createRule()` pattern instead of the deprecated class-based `BaseRuleImpl` pattern. All builds, typechecks, and tests pass with zero regressions.

## Tasks Completed

### T1: Remove duplicate agent files

- **Pre-deletion verification**: Confirmed `src/agents/index.ts` imports only from `luca/` (lines 35-36), not `general/`. Searched entire `src/` directory -- zero references to `general/lu-executor` or `general/lu-planner`.
- **Canonical versions confirmed**: `src/agents/luca/lu-executor.agent.ts` and `src/agents/luca/lu-planner.agent.ts` exist and are properly imported.
- **Deleted**: `src/agents/general/lu-executor.agent.ts` (373 lines) and `src/agents/general/lu-planner.agent.ts` (252 lines) -- total 625 lines of dead code removed.
- **Commit**: `683c51a`

### T2: Fix rule code generator

- **Problem**: `generateRuleTsContent()` in `scripts/generate-rules-from-cursor.ts` emitted `import { BaseRuleImpl } from '../base/base-rule'` and `export class XRule extends BaseRuleImpl { constructor() { super(config); } }` -- a class-based pattern that violates the project's no-classes convention.
- **Fix**: Updated the template to emit `import { createRule } from '../base/base-rule'` and `export const xRule = createRule(config)` -- the functional factory pattern matching all existing rule files (e.g., `file-naming.rule.ts`).
- **Export naming**: Derives camelCase + "Rule" suffix from kebab-case rule name (e.g., "file-naming" becomes `fileNamingRule`).
- **Verified**: No remaining references to `BaseRuleImpl` in any source code (only appears in a historical comment in `base-rule.ts`).
- **Commit**: `4e1ccc7`

### T3: Build and verify

- **build:all**: PASS -- 327 files built (28 agents x2, 45 skills x2, 19 rules x2, 9 hooks x2, plugin dist). Cleaned 323 stale files including compiled outputs from deleted agents.
- **tsc --noEmit**: PASS -- zero type errors.
- **bun test**: PASS -- 1763 tests passed, 0 failed, 6 skipped across 106 test files (5305 expect() calls).

## Deviations

None.

## Files Changed

- `src/agents/general/lu-executor.agent.ts` -- deleted (dead duplicate)
- `src/agents/general/lu-planner.agent.ts` -- deleted (dead duplicate)
- `scripts/generate-rules-from-cursor.ts` -- fixed `generateRuleTsContent()` to emit `createRule` pattern
