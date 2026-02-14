---
id: "26-02"
title: "Migrate consumers to functional API and delete old class files"
wave: 2
requirements: ["ARCH-01", "CLEAN-02"]
---

# Plan 26-02: Migrate Consumers to Functional API and Delete Old Class Files

## Objective

Migrate all 3 consumer build scripts (`build-shared.ts`, `build-claude.ts`, `build-cursor.ts`) and the public API entry point (`index.ts`) from importing class-based compilers to importing the functional compiler API. Then delete the 4 old class files. Finally, verify end-to-end correctness with the full test suite and drift check.

## Context

@src/compilers/compile.ts -- new functional module created in Wave 1
@scripts/build-shared.ts -- primary consumer, imports all 3 compilers (lines 32-34), uses in generateAllOutputs() (lines 462-682)
@scripts/build-claude.ts -- imports ClaudeCompiler (line 34), uses `compiler.compileAgent()` pattern
@scripts/build-cursor.ts -- imports CursorCompiler (line 33), uses `compiler.compileAgent()` pattern
@index.ts -- public API exports BaseCompiler, CursorCompiler, ClaudeCompiler (lines 39-42)
@src/compilers/base.compiler.ts -- TO DELETE after migration
@src/compilers/claude.compiler.ts -- TO DELETE after migration
@src/compilers/cursor.compiler.ts -- TO DELETE after migration
@src/compilers/plugin.compiler.ts -- TO DELETE after migration

## Tasks

### Task 1: Migrate `scripts/build-shared.ts`

**Goal:** Replace the 3 compiler class instantiations and all `compiler.compileX()` method calls with direct function imports from `compile.ts`. This is the highest-impact change as `build-shared.ts` is the single source of truth for all build output via `generateAllOutputs()`.

**Files:** `scripts/build-shared.ts`

**Steps:**

1. Read `scripts/build-shared.ts` to verify current state.

2. Replace the 3 compiler class imports (lines 32-34):

   ```typescript
   // REMOVE these 3 lines:
   import { CursorCompiler } from "../src/compilers/cursor.compiler";
   import { ClaudeCompiler } from "../src/compilers/claude.compiler";
   import { PluginCompiler } from "../src/compilers/plugin.compiler";
   ```

   with a single import from the new module:

   ```typescript
   import {
     compileAgent,
     compileSkill,
     compileRule,
   } from "../src/compilers/compile";
   ```

3. Inside `generateAllOutputs()`, remove the 3 compiler instantiation lines (lines 463-465):

   ```typescript
   // REMOVE these 3 lines:
   const cursorCompiler = new CursorCompiler();
   const claudeCompiler = new ClaudeCompiler();
   const pluginCompiler = new PluginCompiler();
   ```

4. Replace all `claudeCompiler.compileAgent(instance, "CLAUDE")` calls with `compileAgent(instance, "CLAUDE")`. Do the same for cursor and plugin calls. The replacements are:
   - `claudeCompiler.compileAgent(instance, "CLAUDE")` --> `compileAgent(instance, "CLAUDE")`
   - `cursorCompiler.compileAgent(instance, "CURSOR")` --> `compileAgent(instance, "CURSOR")`
   - `pluginCompiler.compileAgent(instance, "CLAUDE")` --> `compileAgent(instance, "PLUGIN")`
   - `claudeCompiler.compileSkill(instance, "CLAUDE")` --> `compileSkill(instance, "CLAUDE")`
   - `cursorCompiler.compileSkill(instance, "CURSOR")` --> `compileSkill(instance, "CURSOR")`
   - `pluginCompiler.compileSkill(instance, "CLAUDE")` --> `compileSkill(instance, "PLUGIN")`
   - `claudeCompiler.compileRule(instance, "CLAUDE")` --> `compileRule(instance, "CLAUDE")`
   - `cursorCompiler.compileRule(instance, "CURSOR")` --> `compileRule(instance, "CURSOR")`

   **IMPORTANT semantic change:** The old code called `pluginCompiler.compileAgent(instance, "CLAUDE")` — passing format `"CLAUDE"` to the plugin compiler. The new code uses `compileAgent(instance, "PLUGIN")` — the dispatch function routes to `compileAgentPlugin()` which internally calls `compileAgentClaude()`, producing identical output. Same for skills: old code was `pluginCompiler.compileSkill(instance, "CLAUDE")`, new code is `compileSkill(instance, "PLUGIN")`.

   The specific call sites to update (verify line numbers by reading the file first):

   **Agents section (registry loop):**
   - `claudeCompiler.compileAgent(instance, "CLAUDE")` (line ~473)
   - `cursorCompiler.compileAgent(instance, "CURSOR")` (line ~477)
   - `pluginCompiler.compileAgent(instance, "CLAUDE")` (line ~481)

   **Agents section (lu-executor):**
   - `claudeCompiler.compileAgent(luExecutor, "CLAUDE")` (line ~489)
   - `cursorCompiler.compileAgent(luExecutor, "CURSOR")` (line ~493)
   - `pluginCompiler.compileAgent(luExecutor, "CLAUDE")` (line ~497)

   **Agents section (lu-planner):**
   - `claudeCompiler.compileAgent(luPlanner, "CLAUDE")` (line ~503)
   - `cursorCompiler.compileAgent(luPlanner, "CURSOR")` (line ~507)
   - `pluginCompiler.compileAgent(luPlanner, "CLAUDE")` (line ~511)

   **Skills section (registry loop):**
   - `claudeCompiler.compileSkill(instance, "CLAUDE")` (line ~519)
   - `cursorCompiler.compileSkill(instance, "CURSOR")` (line ~523)
   - `pluginCompiler.compileSkill(instance, "CLAUDE")` (line ~527)

   **Skills section (lu-skill):**
   - `claudeCompiler.compileSkill(luSkill, "CLAUDE")` (line ~535)
   - `cursorCompiler.compileSkill(luSkill, "CURSOR")` (line ~539)
   - `pluginCompiler.compileSkill(luSkill, "CLAUDE")` (line ~543)

   **Rules section (registry loop):**
   - `claudeCompiler.compileRule(instance, "CLAUDE")` (line ~550)
   - `cursorCompiler.compileRule(instance, "CURSOR")` (line ~555)

   **Rules section (lu-workflow):**
   - `claudeCompiler.compileRule(luWorkflowRule, "CLAUDE")` (line ~563)
   - `cursorCompiler.compileRule(luWorkflowRule, "CURSOR")` (line ~567)

**Verification:**

- [ ] No imports from `cursor.compiler`, `claude.compiler`, or `plugin.compiler` remain
- [ ] No `new CursorCompiler()`, `new ClaudeCompiler()`, or `new PluginCompiler()` remain
- [ ] All `pluginCompiler.compile*(entity, "CLAUDE")` calls replaced with `compile*(entity, "PLUGIN")`
- [ ] `bun test scripts/check-drift.test.ts` passes (end-to-end build output validation)

---

### Task 2: Migrate `scripts/build-claude.ts`

**Goal:** Replace `ClaudeCompiler` class import and instantiation with function imports.

**Files:** `scripts/build-claude.ts`

**Steps:**

1. Read `scripts/build-claude.ts` to verify current state.

2. Replace the ClaudeCompiler import (line 34):

   ```typescript
   // REMOVE:
   import { ClaudeCompiler } from "../src/compilers/claude.compiler";
   ```

   with:

   ```typescript
   import {
     compileAgent,
     compileSkill,
     compileRule,
   } from "../src/compilers/compile";
   ```

3. Remove the compiler instantiation in `main()` (line 39):

   ```typescript
   // REMOVE:
   const compiler = new ClaudeCompiler();
   ```

4. Replace all `compiler.compileAgent(instance, "CLAUDE")` calls with `compileAgent(instance, "CLAUDE")`. Same for skills and rules:
   - `compiler.compileAgent(instance, "CLAUDE")` --> `compileAgent(instance, "CLAUDE")`
   - `compiler.compileSkill(instance, "CLAUDE")` --> `compileSkill(instance, "CLAUDE")`
   - `compiler.compileRule(instance, "CLAUDE")` --> `compileRule(instance, "CLAUDE")`
   - `compiler.compileAgent(luExecutor, "CLAUDE")` --> `compileAgent(luExecutor, "CLAUDE")`
   - `compiler.compileAgent(luPlanner, "CLAUDE")` --> `compileAgent(luPlanner, "CLAUDE")`
   - `compiler.compileSkill(luSkill, "CLAUDE")` --> `compileSkill(luSkill, "CLAUDE")`
   - `compiler.compileRule(luWorkflowRule, "CLAUDE")` --> `compileRule(luWorkflowRule, "CLAUDE")`

5. Update the troubleshooting error message at the bottom (line ~252-253) to reference the new module:

   ```typescript
   // CHANGE:
   "  2. Check that ClaudeCompiler exists in src/compilers/claude.compiler.ts",
   // TO:
   "  2. Check that compile functions exist in src/compilers/compile.ts",
   ```

**Verification:**

- [ ] No imports from `claude.compiler.ts` remain
- [ ] No `new ClaudeCompiler()` calls remain
- [ ] `bun run build:claude` succeeds (if this script is directly runnable)

---

### Task 3: Migrate `scripts/build-cursor.ts`

**Goal:** Replace `CursorCompiler` class import and instantiation with function imports.

**Files:** `scripts/build-cursor.ts`

**Steps:**

1. Read `scripts/build-cursor.ts` to verify current state.

2. Replace the CursorCompiler import (line 33):

   ```typescript
   // REMOVE:
   import { CursorCompiler } from "../src/compilers/cursor.compiler";
   ```

   with:

   ```typescript
   import {
     compileAgent,
     compileSkill,
     compileRule,
   } from "../src/compilers/compile";
   ```

3. Remove the compiler instantiation in `main()` (line 38):

   ```typescript
   // REMOVE:
   const compiler = new CursorCompiler();
   ```

4. Replace all `compiler.compileAgent(instance, 'CURSOR')` calls with `compileAgent(instance, "CURSOR")`. Same for skills and rules:
   - `compiler.compileAgent(instance, 'CURSOR')` --> `compileAgent(instance, "CURSOR")`
   - `compiler.compileSkill(instance, 'CURSOR')` --> `compileSkill(instance, "CURSOR")`
   - `compiler.compileRule(instance, 'CURSOR')` --> `compileRule(instance, "CURSOR")`
   - `compiler.compileAgent(luExecutor, 'CURSOR')` --> `compileAgent(luExecutor, "CURSOR")`
   - `compiler.compileAgent(luPlanner, 'CURSOR')` --> `compileAgent(luPlanner, "CURSOR")`
   - `compiler.compileSkill(luSkill, 'CURSOR')` --> `compileSkill(luSkill, "CURSOR")`
   - `compiler.compileRule(luWorkflowRule, 'CURSOR')` --> `compileRule(luWorkflowRule, "CURSOR")`

5. Update the troubleshooting error message at the bottom (line ~209-210) to reference the new module:

   ```typescript
   // CHANGE:
   '  2. Check that CursorCompiler exists in src/compilers/cursor.compiler.ts',
   // TO:
   "  2. Check that compile functions exist in src/compilers/compile.ts",
   ```

**Verification:**

- [ ] No imports from `cursor.compiler.ts` remain
- [ ] No `new CursorCompiler()` calls remain
- [ ] `bun run build:cursor` succeeds (if this script is directly runnable)

---

### Task 4: Update `index.ts` public API

**Goal:** Replace the class-based compiler exports with the functional API exports. This is a breaking change to the public API surface but is acceptable at pre-1.0 semver.

**Files:** `index.ts`

**Steps:**

1. Read `index.ts` to verify current state.

2. Replace the compiler exports block (lines 38-42):

   ```typescript
   // REMOVE:
   // Compilers
   export { BaseCompiler } from "./src/compilers/base.compiler";
   export type { SupportedFormat } from "./src/compilers/base.compiler";
   export { CursorCompiler } from "./src/compilers/cursor.compiler";
   export { ClaudeCompiler } from "./src/compilers/claude.compiler";
   ```

   with:

   ```typescript
   // Compilers (functional API)
   export {
     compileAgent,
     compileSkill,
     compileRule,
     compileAgentClaude,
     compileAgentCursor,
     compileAgentPlugin,
     compileSkillClaude,
     compileSkillCursor,
     compileSkillPlugin,
     compileRuleClaude,
     compileRuleCursor,
     compileRulePlugin,
     validateFormat,
   } from "./src/compilers/compile";
   export type { SupportedFormat } from "./src/compilers/compile";
   ```

**Verification:**

- [ ] No imports from `base.compiler.ts`, `claude.compiler.ts`, or `cursor.compiler.ts` in `index.ts`
- [ ] All 13 functional exports + `SupportedFormat` type are exported
- [ ] `bunx --bun tsc --noEmit index.ts` passes

---

### Task 5: Delete old compiler class files

**Goal:** Remove the 4 class-based compiler files that have been fully replaced by `compile.ts`.

**Files:**

- `src/compilers/base.compiler.ts` (DELETE)
- `src/compilers/claude.compiler.ts` (DELETE)
- `src/compilers/cursor.compiler.ts` (DELETE)
- `src/compilers/plugin.compiler.ts` (DELETE)

**Steps:**

1. Before deleting, verify that NO files import from the old modules. Search the entire codebase:

   ```bash
   # These searches should return zero results after Tasks 1-4
   grep -r "from.*base\.compiler" --include="*.ts" --exclude-dir=node_modules .
   grep -r "from.*claude\.compiler" --include="*.ts" --exclude-dir=node_modules .
   grep -r "from.*cursor\.compiler" --include="*.ts" --exclude-dir=node_modules .
   grep -r "from.*plugin\.compiler\"" --include="*.ts" --exclude-dir=node_modules .
   ```

   **Expected:** Zero results for all 4 searches. If any results remain, fix them before deleting.

2. Delete the 4 files:

   ```bash
   rm src/compilers/base.compiler.ts
   rm src/compilers/claude.compiler.ts
   rm src/compilers/cursor.compiler.ts
   rm src/compilers/plugin.compiler.ts
   ```

3. Verify the `src/compilers/` directory now contains only:
   - `compile.ts` (new functional module)
   - `plugin.compiler.test.ts` (rewritten in Wave 1 to import from `compile.ts`)
   - `plugin.types.ts` (unrelated to compiler classes, no changes needed)
   - `plugin.types.test.ts` (unrelated to compiler classes, no changes needed)

**Verification:**

- [ ] 4 old class files no longer exist on disk
- [ ] No dangling imports reference the deleted files
- [ ] `src/compilers/` contains only `compile.ts`, `plugin.compiler.test.ts`, `plugin.types.ts`, `plugin.types.test.ts`

---

### Task 6: Run full verification suite

**Goal:** Verify end-to-end correctness: all tests pass, build output is byte-identical to before, drift check passes.

**Steps:**

1. Run `bun test` to verify the full test suite passes.

2. Run `bun run build:all` to rebuild all output files and verify the build pipeline works end-to-end.

3. Run `bun test scripts/check-drift.test.ts` to verify that build output matches committed files byte-for-byte. This is the ultimate correctness check: if drift detection passes, the functional compiler produces identical output to the old class-based compilers.

4. Run `bunx --bun tsc --noEmit` to verify no type errors across the entire codebase.

**Verification:**

- [ ] `bun test` passes (all tests, no regressions)
- [ ] `bun run build:all` succeeds
- [ ] `bun test scripts/check-drift.test.ts` passes (no drift)
- [ ] `bunx --bun tsc --noEmit` passes (no type errors)

---

## Success Criteria

- [ ] Zero class-based compiler imports remain in the entire codebase
- [ ] Zero `new *Compiler()` instantiations remain in the entire codebase
- [ ] 4 old class files deleted: `base.compiler.ts`, `claude.compiler.ts`, `cursor.compiler.ts`, `plugin.compiler.ts`
- [ ] `index.ts` exports functional API: `compileAgent`, `compileSkill`, `compileRule`, 9 per-format functions, `validateFormat`, `SupportedFormat`
- [ ] Build output is byte-identical (drift check passes)
- [ ] Full test suite passes
- [ ] No type errors
- [ ] ARCH-01 complete: class hierarchy replaced with factory-function pattern
- [ ] CLEAN-02 complete: unused `format` parameter eliminated from per-format functions

## Execution Rules

1. **Read before edit:** Always read each file before modifying it to verify current content matches expectations.
2. **Test after each task:** Run relevant tests after each migration, then the full suite after Task 6.
3. **Behavioral equivalence:** The migration MUST NOT change any build output. The drift check is the definitive test.
4. **Delete last:** Only delete old class files AFTER all consumers have been migrated and verified.
5. **Search before delete:** Always search the entire codebase for imports of the old modules before deleting them.
6. **Plugin format semantics:** When migrating `pluginCompiler.compile*(entity, "CLAUDE")`, use format `"PLUGIN"` (not `"CLAUDE"`) with the new dispatch functions. The `"PLUGIN"` format routes to `compileAgentPlugin()` which internally delegates to `compileAgentClaude()`, producing identical output.
