---
id: 49-A
title: "Remove dead agents and fix stale code generator"
wave: 1
tasks:
  - id: T1
    title: "Remove duplicate agent files from general/"
    goal: "Delete dead code agent files that shadow canonical luca/ versions"
  - id: T2
    title: "Fix rule code generator to emit createRule pattern"
    goal: "Update generate-rules-from-cursor.ts to emit functional createRule() instead of class-based BaseRuleImpl"
  - id: T3
    title: "Build and verify"
    goal: "Run build:all, typecheck, and tests to confirm no regressions"
---

# Plan 49-A: Remove Dead Agents and Fix Stale Code Generator

## Objective

Eliminate dead code and fix a stale code generator that emits a deleted base class. This addresses three HIGH-priority gaps identified in the v1.7.0 audit:

1. Two duplicate agent files in `src/agents/general/` that shadow the canonical versions in `src/agents/luca/`
2. A rule code generator (`scripts/generate-rules-from-cursor.ts`) that still emits `BaseRuleImpl` class-based code, which was removed in the v1.6.0 refactor to the functional `createRule()` pattern

Cleaning these up prevents confusion, eliminates class-based anti-patterns from generated output, and ensures `bun run generate:from-cursor` produces valid code.

## Context

Read these files before execution (verify current state, do not rely on planning-time analysis):

- @src/agents/general/lu-executor.agent.ts -- Dead duplicate (uses `LuexecutorAgent extends BaseAgentImpl`)
- @src/agents/general/lu-planner.agent.ts -- Dead duplicate (uses `LuplannerAgent extends BaseAgentImpl`)
- @src/agents/luca/lu-executor.agent.ts -- Canonical version (uses `LuExecutorAgent extends BaseAgentImpl`, imported by registry)
- @src/agents/luca/lu-planner.agent.ts -- Canonical version (uses `LuPlannerAgent extends BaseAgentImpl`, imported by registry)
- @src/agents/index.ts -- Agent registry; imports from `luca/`, NOT from `general/` for these two agents
- @scripts/generate-rules-from-cursor.ts -- Code generator; `generateRuleTsContent()` function (lines 91-141) emits stale `BaseRuleImpl` class pattern
- @src/rules/base/base-rule.ts -- Current `createRule()` factory function
- @src/rules/general/file-naming.rule.ts -- Reference example of correct functional rule pattern

## Tasks

### T1: Remove duplicate agent files from general/

**Type:** auto

Delete the two dead agent files that shadow the canonical `luca/` versions:

1. Delete `src/agents/general/lu-executor.agent.ts`
2. Delete `src/agents/general/lu-planner.agent.ts`

**Pre-deletion verification (MUST confirm before deleting):**

- Verify `src/agents/index.ts` does NOT import from `general/lu-executor.agent` or `general/lu-planner.agent`
- Verify no other file in `src/` imports from these two files (search for `general/lu-executor` and `general/lu-planner`)
- Verify the canonical versions exist at `src/agents/luca/lu-executor.agent.ts` and `src/agents/luca/lu-planner.agent.ts`

**Files to delete:**

- `src/agents/general/lu-executor.agent.ts`
- `src/agents/general/lu-planner.agent.ts`

**Verification:**

- `src/agents/general/lu-executor.agent.ts` no longer exists
- `src/agents/general/lu-planner.agent.ts` no longer exists
- `src/agents/index.ts` unchanged (it already imports from `luca/`, not `general/` for these two)
- `bunx --bun tsc --noEmit` passes with 0 errors (no broken imports)

### T2: Fix rule code generator to emit createRule pattern

**Type:** auto

Update the `generateRuleTsContent()` function in `scripts/generate-rules-from-cursor.ts` (lines 91-141) to emit the functional `createRule()` pattern instead of the deleted `BaseRuleImpl` class pattern.

**Current stale output (lines 109-140):**

```typescript
// STALE: Emits class-based pattern with deleted BaseRuleImpl
import { BaseRuleImpl } from '../base/base-rule';
import type { RuleConfig } from '../types/rule.types';

const ${configName}: RuleConfig = { ... };

export class ${className} extends BaseRuleImpl {
  constructor() {
    super(${configName});
  }
}
```

**Required output (matches current functional pattern):**

```typescript
// CORRECT: Functional createRule() pattern
import { createRule } from '../base/base-rule';
import type { RuleConfig } from '../types/rule.types';

const ${configName}: RuleConfig = { ... };

export const ${exportName} = createRule(${configName});
```

**Specific changes to `generateRuleTsContent()` function:**

1. Change import from `BaseRuleImpl` to `createRule`:
   - Old: `import { BaseRuleImpl } from '../base/base-rule';`
   - New: `import { createRule } from '../base/base-rule';`

2. Replace class export with functional export:
   - Old: `export class ${className} extends BaseRuleImpl { constructor() { super(${configName}); } }`
   - New: `export const ${exportName} = createRule(${configName});`

3. Derive `exportName` using camelCase convention matching existing rules (e.g., `fileNamingRule`, `apiSnakeCaseRule`). The naming pattern is: camelCase version of the kebab-case rule name + `Rule` suffix.

**Reference pattern** (from `src/rules/general/file-naming.rule.ts`):

```typescript
import { createRule } from "../base/base-rule";
import type { RuleConfig } from "../types/rule.types";

const fileNamingConfig: RuleConfig = {
  frontmatter: { ... },
  sections: [ ... ]
};

export const fileNamingRule = createRule(fileNamingConfig);
```

**Files to edit:**

- `scripts/generate-rules-from-cursor.ts`

**Verification:**

- `generateRuleTsContent()` no longer references `BaseRuleImpl`
- `generateRuleTsContent()` emits `import { createRule }` instead
- `generateRuleTsContent()` emits `export const ${name}Rule = createRule(${config})` instead of class definition
- No `class` keyword appears in the generated output template
- `bunx --bun tsc --noEmit` passes with 0 errors

### T3: Build and verify

**Type:** auto

Run full verification to confirm no regressions from the changes.

**Steps (execute in order):**

```bash
# 1. Build all (propagates agent deletions to compiled outputs)
bun run build:all

# 2. TypeScript check
bunx --bun tsc --noEmit

# 3. Run tests
bun test
```

**Verification:**

- `bun run build:all` exits 0 (clean build, deleted agents no longer appear in compiled output)
- `bunx --bun tsc --noEmit` reports 0 errors
- `bun test` shows 0 failures (all tests pass)
- Compiled output directories (`.claude/`, `.cursor/`) do NOT contain stale references to the deleted general agent files

## Verification

After all tasks complete:

1. `src/agents/general/lu-executor.agent.ts` does not exist
2. `src/agents/general/lu-planner.agent.ts` does not exist
3. `src/agents/index.ts` is unchanged (no edits needed)
4. `scripts/generate-rules-from-cursor.ts` emits `createRule()` pattern, not `BaseRuleImpl` class
5. `grep -r "BaseRuleImpl" scripts/` returns no matches
6. `bun run build:all` succeeds
7. `bunx --bun tsc --noEmit` reports 0 errors
8. `bun test` reports 0 failures

## Success Criteria

- [ ] No duplicate agent files in `src/agents/general/` for lu-executor and lu-planner
- [ ] Code generator emits functional `createRule()` pattern (no `BaseRuleImpl` references)
- [ ] TypeScript: 0 errors
- [ ] Tests: all pass (baseline: 1763 pass, 6 skip, 0 fail)
- [ ] Build: clean (`bun run build:all` exits 0, no drift in compiled outputs)

## Output Specification

- Deleted: `src/agents/general/lu-executor.agent.ts`
- Deleted: `src/agents/general/lu-planner.agent.ts`
- Modified: `scripts/generate-rules-from-cursor.ts` (updated `generateRuleTsContent()`)
