---
id: "25-01"
title: "Extract shared test helpers, fix build-utils import, fix unused variable"
wave: 1
requirements: ["TEST-01", "BUN-01", "CLEAN-01"]
---

# Plan 25-01: Extract Shared Test Helpers + Code Hygiene Fixes

## Objective

Eliminate test utility duplication by extracting `VALID_CLAUDE_CODE_EVENTS`, `extractFrontmatter()`, and `PLUGIN_ROOT` into a shared `scripts/test-helpers.ts` module and updating all 3 consumer test files. Simultaneously fix the `build-utils.ts` import path (bare `'fs/promises'` to `'node:fs/promises'`) and rename the unused `hookName` loop variable in `build-claude.ts` to `_hookName`. These are all independent, low-risk changes that form the foundation for Wave 2.

## Context

@scripts/plugin-spec-e2e.test.ts -- duplicates VALID_CLAUDE_CODE_EVENTS (lines 36-44), extractFrontmatter (lines 56-69), PLUGIN_ROOT (line 29)
@scripts/plugin-spec-hooks-format.test.ts -- duplicates VALID_CLAUDE_CODE_EVENTS (lines 28-36), extractFrontmatter (lines 48-61), PLUGIN_ROOT (line 21)
@scripts/plugin-spec-structure.test.ts -- duplicates PLUGIN_ROOT (line 24)
@scripts/build-utils.ts -- uses bare `'fs/promises'` import (line 9)
@scripts/build-claude.ts -- has unused `hookName` variable (line 177)

## Tasks

### Task 1: Create scripts/test-helpers.ts

**Goal:** Create a new shared module containing the 3 duplicated test utilities.

**Files:** `scripts/test-helpers.ts` (NEW)

**Steps:**

1. Create `scripts/test-helpers.ts` with the following content:

   ````typescript
   #!/usr/bin/env bun

   /**
    * test-helpers.ts -- Shared test utilities for plugin spec-conformance
    * and drift detection test suites.
    *
    * Extracted from plugin-spec-e2e.test.ts and plugin-spec-hooks-format.test.ts
    * to eliminate duplication (Phase 25, TEST-01).
    */
   import path from "path";

   /**
    * Complete set of valid Claude Code hook event types.
    *
    * Used by plugin spec tests to validate that hooks.json only contains
    * recognized event types.
    *
    * @see https://docs.anthropic.com/en/docs/claude-code/hooks
    */
   export const VALID_CLAUDE_CODE_EVENTS: ReadonlySet<string> = new Set([
     "PreToolUse",
     "PostToolUse",
     "Notification",
     "Stop",
     "SubagentTool",
     "SessionStart",
     "SessionEnd",
   ]);

   /**
    * Root path for the dist/plugin/ output directory.
    *
    * Resolved relative to this file's location in scripts/.
    */
   export const PLUGIN_ROOT = path.resolve(
     import.meta.dir,
     "..",
     "dist",
     "plugin",
   );

   /**
    * Extracts simple YAML frontmatter key-value pairs from markdown content.
    *
    * Handles the `---` delimited frontmatter block at the start of a file.
    * Only parses single-line `key: value` pairs (sufficient for SKILL.md
    * description fields).
    *
    * @param content - Raw markdown file content
    * @returns Parsed key-value pairs, or null if no frontmatter found
    *
    * @example
    * ```typescript
    * const fm = extractFrontmatter("---\ndescription: My skill\n---\n# Content");
    * // fm = { description: "My skill" }
    * ```
    */
   export function extractFrontmatter(
     content: string,
   ): Record<string, string> | null {
     const match = content.match(/^---\n([\s\S]*?)\n---/);
     if (!match) return null;
     const fields: Record<string, string> = {};
     for (const line of match[1]!.split("\n")) {
       const colonIndex = line.indexOf(":");
       if (colonIndex > 0) {
         const key = line.slice(0, colonIndex).trim();
         const value = line.slice(colonIndex + 1).trim();
         fields[key] = value;
       }
     }
     return fields;
   }
   ````

2. Verify the file was created correctly by reading it back.

**Verification:**

- [ ] `scripts/test-helpers.ts` exists and exports all 3 symbols
- [ ] `PLUGIN_ROOT` resolves to the same path as the originals (all files are in `scripts/`, so `import.meta.dir` resolves identically)

---

### Task 2: Update plugin-spec-e2e.test.ts to use test-helpers

**Goal:** Remove the 3 duplicated definitions and import from `./test-helpers`.

**Files:** `scripts/plugin-spec-e2e.test.ts`

**Steps:**

1. Read `scripts/plugin-spec-e2e.test.ts` to verify current state before editing.

2. Add import statement after the existing imports (after the `import path from "path"` line and the import from `"../src/compilers/plugin.types"`):

   ```typescript
   import {
     VALID_CLAUDE_CODE_EVENTS,
     PLUGIN_ROOT,
     extractFrontmatter,
   } from "./test-helpers";
   ```

3. Remove the local `PLUGIN_ROOT` declaration (line 29):

   ```typescript
   const PLUGIN_ROOT = path.resolve(import.meta.dir, "..", "dist", "plugin");
   ```

4. Remove the local `VALID_CLAUDE_CODE_EVENTS` declaration (lines 36-44, including the JSDoc comment from lines 31-35):

   ```typescript
   /**
    * Complete set of valid Claude Code hook event types.
    * ...
    */
   const VALID_CLAUDE_CODE_EVENTS = new Set([...]);
   ```

5. Remove the local `extractFrontmatter` function (lines 47-69, including the JSDoc comment from lines 46-55):

   ```typescript
   /**
    * Extracts simple YAML frontmatter key-value pairs from markdown content.
    * ...
    */
   function extractFrontmatter(content: string): Record<string, string> | null {
     ...
   }
   ```

6. Remove the `path` import if it is no longer used directly in the file. Check whether `path` is still referenced anywhere in the file body (it is -- `path.join`, `path.resolve` are used extensively). Keep the `path` import.

**Verification:**

- [ ] `bun test scripts/plugin-spec-e2e.test.ts` passes
- [ ] No local definitions of `VALID_CLAUDE_CODE_EVENTS`, `PLUGIN_ROOT`, or `extractFrontmatter` remain
- [ ] The import from `./test-helpers` is present

---

### Task 3: Update plugin-spec-hooks-format.test.ts to use test-helpers

**Goal:** Remove the 3 duplicated definitions and import from `./test-helpers`.

**Files:** `scripts/plugin-spec-hooks-format.test.ts`

**Steps:**

1. Read `scripts/plugin-spec-hooks-format.test.ts` to verify current state before editing.

2. Add import statement after the existing imports:

   ```typescript
   import {
     VALID_CLAUDE_CODE_EVENTS,
     PLUGIN_ROOT,
     extractFrontmatter,
   } from "./test-helpers";
   ```

3. Remove the local `PLUGIN_ROOT` declaration (line 21):

   ```typescript
   const PLUGIN_ROOT = path.resolve(import.meta.dir, "..", "dist", "plugin");
   ```

4. Remove the local `VALID_CLAUDE_CODE_EVENTS` declaration (lines 23-36, including the JSDoc comment):

   ```typescript
   /**
    * Complete set of valid Claude Code hook event types.
    * ...
    */
   const VALID_CLAUDE_CODE_EVENTS = new Set([...]);
   ```

5. Remove the local `extractFrontmatter` function (lines 38-61, including the JSDoc comment):

   ```typescript
   /**
    * Extracts simple YAML frontmatter key-value pairs from markdown content.
    * ...
    */
   function extractFrontmatter(content: string): Record<string, string> | null {
     ...
   }
   ```

6. The `path` import is still needed (used in `path.join` calls throughout). Keep it.

**Verification:**

- [ ] `bun test scripts/plugin-spec-hooks-format.test.ts` passes
- [ ] No local definitions of `VALID_CLAUDE_CODE_EVENTS`, `PLUGIN_ROOT`, or `extractFrontmatter` remain

---

### Task 4: Update plugin-spec-structure.test.ts to use test-helpers

**Goal:** Remove the duplicated `PLUGIN_ROOT` definition and import from `./test-helpers`.

**Files:** `scripts/plugin-spec-structure.test.ts`

**Steps:**

1. Read `scripts/plugin-spec-structure.test.ts` to verify current state before editing.

2. Add import statement after the existing imports:

   ```typescript
   import { PLUGIN_ROOT } from "./test-helpers";
   ```

3. Remove the local `PLUGIN_ROOT` declaration (line 24):

   ```typescript
   const PLUGIN_ROOT = path.resolve(import.meta.dir, "..", "dist", "plugin");
   ```

4. The `path` import is still needed (used in `path.join` calls throughout). Keep it.

**Verification:**

- [ ] `bun test scripts/plugin-spec-structure.test.ts` passes
- [ ] No local definition of `PLUGIN_ROOT` remains

---

### Task 5: Fix build-utils.ts import path (BUN-01)

**Goal:** Update the bare `'fs/promises'` import to the explicit `'node:fs/promises'` prefix for consistency with modern Node.js/Bun conventions.

**Files:** `scripts/build-utils.ts`

**Steps:**

1. Read `scripts/build-utils.ts` to verify current state before editing.

2. Change line 9 from:

   ```typescript
   import { readdir, unlink, rm, lstat, mkdir } from "fs/promises";
   ```

   to:

   ```typescript
   import { readdir, unlink, rm, lstat, mkdir } from "node:fs/promises";
   ```

**Verification:**

- [ ] `bun test` passes (build-utils is used by build scripts which are exercised by drift tests)
- [ ] Import uses explicit `node:` prefix

---

### Task 6: Fix unused loop variable in build-claude.ts (CLEAN-01)

**Goal:** Rename `hookName` to `_hookName` in the hook copy loop to follow the project convention for intentionally unused destructured variables.

**Files:** `scripts/build-claude.ts`

**Steps:**

1. Read `scripts/build-claude.ts` to verify current state before editing.

2. On line 177, change:

   ```typescript
   for (const [hookName, hookDef] of Object.entries(hookRegistry)) {
   ```

   to:

   ```typescript
   for (const [_hookName, hookDef] of Object.entries(hookRegistry)) {
   ```

3. Verify that `hookName` is NOT used anywhere in the loop body (lines 178-206). It is not -- only `hookDef.script` is used.

**Verification:**

- [ ] `bun test` passes
- [ ] No linter warnings about unused variables in this loop

---

## Success Criteria

- [ ] `scripts/test-helpers.ts` exists and exports `VALID_CLAUDE_CODE_EVENTS`, `PLUGIN_ROOT`, and `extractFrontmatter`
- [ ] No local definitions of these 3 symbols remain in any of the 3 consumer test files
- [ ] `scripts/build-utils.ts` imports from `'node:fs/promises'` (not bare `'fs/promises'`)
- [ ] `scripts/build-claude.ts` uses `_hookName` (not `hookName`) in the hook copy loop
- [ ] `bun test` passes (full test suite)
- [ ] `bun run build:all` succeeds

## Execution Rules

1. **Read before edit:** Always read each file before modifying it to verify current line numbers and content match expectations.
2. **Test after each task:** Run the relevant test file after each task, then run the full suite after all tasks complete.
3. **No logic changes:** This wave is pure extraction and renaming. No behavioral changes should occur.
4. **Preserve JSDoc:** The extracted utilities in `test-helpers.ts` must retain their JSDoc documentation.
5. **Import order:** Follow the project import standards -- external libraries first, then internal imports, then relative imports.
