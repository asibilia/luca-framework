# Phase 25 Research: Test & API Cleanup

**Researcher:** lu-phase-researcher
**Date:** 2026-02-13
**Phase:** 25 — Test & API Cleanup
**Goal:** Extract shared test utilities, migrate to Bun APIs, fix code hygiene in test/build files
**Depends on:** Phase 24 (build pipeline consolidated -- generateAllOutputs() now in build-shared.ts)

---

## 1. Current State Analysis

### Files Under Scope

| File                                       | Lines | Purpose                                                                               |
| ------------------------------------------ | ----- | ------------------------------------------------------------------------------------- |
| `scripts/build-utils.ts`                   | 86    | Shared build utilities: cleanDirectory, cleanSkillsDirectory, ensureDir               |
| `scripts/check-drift.test.ts`              | 517   | Drift detection test suite: output freshness, registry completeness, orphan detection |
| `scripts/plugin-spec-e2e.test.ts`          | 557   | End-to-end plugin spec-conformance tests                                              |
| `scripts/plugin-spec-hooks-format.test.ts` | 320   | Hook spec conformance and SKILL.md/agent format validation                            |
| `scripts/plugin-spec-structure.test.ts`    | 269   | Plugin directory structure and manifest validation                                    |
| `scripts/build-all.ts`                     | 293   | Unified build script                                                                  |
| `scripts/build-shared.ts`                  | 683   | Shared build constants, registries, generateAllOutputs()                              |
| `scripts/build-claude.ts`                  | 261   | Claude-specific build script                                                          |
| `scripts/build-cursor.ts`                  | 215   | Cursor-specific build script                                                          |

---

## 2. Requirement-by-Requirement Analysis

### TEST-01: Extract Shared Test Utilities

**Duplicated utilities found:**

#### `VALID_CLAUDE_CODE_EVENTS` Set

Identical in both files:

```typescript
const VALID_CLAUDE_CODE_EVENTS = new Set([
  "PreToolUse",
  "PostToolUse",
  "Notification",
  "Stop",
  "SubagentTool",
  "SessionStart",
  "SessionEnd",
]);
```

**Locations:**

- `scripts/plugin-spec-e2e.test.ts` lines 36-44
- `scripts/plugin-spec-hooks-format.test.ts` lines 28-36

#### `extractFrontmatter()` Function

Identical implementation in both files:

```typescript
function extractFrontmatter(content: string): Record<string, string> | null {
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
```

**Locations:**

- `scripts/plugin-spec-e2e.test.ts` lines 56-69
- `scripts/plugin-spec-hooks-format.test.ts` lines 48-61

#### `PLUGIN_ROOT` Constant

Same value in three files:

```typescript
const PLUGIN_ROOT = path.resolve(import.meta.dir, "..", "dist", "plugin");
```

**Locations:**

- `scripts/plugin-spec-e2e.test.ts` line 29
- `scripts/plugin-spec-hooks-format.test.ts` line 21
- `scripts/plugin-spec-structure.test.ts` line 24

#### Proposed Helper Module Location

**Recommended: `scripts/test-helpers.ts`**

Rationale:

- All consuming test files live in `scripts/`
- Existing `__tests__/` directory is for different test categories (infrastructure, packages, src, utils)
- Keeps test helpers co-located with the test files that use them
- Follows existing pattern: `scripts/build-utils.ts` (shared build utilities), `scripts/build-shared.ts` (shared build constants)
- File name follows kebab-case convention per project rules

**Contents for the shared module:**

```typescript
// scripts/test-helpers.ts

/**
 * Complete set of valid Claude Code hook event types.
 * @see https://docs.anthropic.com/en/docs/claude-code/hooks
 */
export const VALID_CLAUDE_CODE_EVENTS: ReadonlySet<string> = new Set([...]);

/**
 * Root path for the dist/plugin/ output directory.
 */
export const PLUGIN_ROOT = path.resolve(import.meta.dir, "..", "dist", "plugin");

/**
 * Extracts simple YAML frontmatter key-value pairs from markdown content.
 */
export function extractFrontmatter(content: string): Record<string, string> | null { ... }
```

**NOTE on `PLUGIN_ROOT`:** Because `PLUGIN_ROOT` uses `import.meta.dir`, it resolves to the directory of the file containing the expression. If extracted to `scripts/test-helpers.ts`, the value will still resolve correctly since all files are in `scripts/`. No path adjustment needed.

---

### TEST-02: Remove Unused Test Variables, Replace `require('fs')` Calls

#### `require('fs').readFileSync` in check-drift.test.ts

There are **14 occurrences** of `require("fs").readFileSync(...)` in `scripts/check-drift.test.ts`:

| Line | Context                  |
| ---- | ------------------------ |
| 46   | agent output freshness   |
| 65   | skill output freshness   |
| 84   | rule output freshness    |
| 105  | hook script freshness    |
| 121  | settings.json hooks      |
| 133  | .cursor/hooks.json       |
| 327  | plugin agent freshness   |
| 346  | plugin skill freshness   |
| 365  | plugin command freshness |
| 384  | plugin script freshness  |
| 406  | plugin hooks.json        |
| 424  | plugin plugin.json       |
| 442  | plugin marketplace.json  |
| 452  | plugin README.md         |

**These should all be migrated to `Bun.file(path).text()`**, which aligns with the project CLAUDE.md directive: "Prefer Bun.file over node:fs's readFile/writeFile".

**NOTE:** This migration changes the read from synchronous to asynchronous. Each test that uses `require("fs").readFileSync` will need the following pattern change:

```typescript
// Before (sync):
const actual = require("fs").readFileSync(absPath, "utf8");

// After (async with Bun.file):
const actual = await Bun.file(absPath).text();
```

**Impact:** The test callbacks must become `async` (which they likely already are since bun:test supports async tests).

#### `readdirSync` in check-drift.test.ts

The file imports `readdirSync` and `existsSync` from `"node:fs"` (line 12). There are **16 calls** to `readdirSync` across the file, used in Registry Completeness (section 2) and No Orphan Outputs (sections 3 and 5).

**Migration strategy:** Use `readdir` from `"node:fs/promises"` (async) instead. Bun does NOT provide a native `readdir` equivalent -- `Bun.Glob` is the closest but is designed for pattern matching, not plain directory listing. Using `node:fs/promises` for `readdir` is the recommended approach per Bun's own documentation (Bun implements `node:fs` fully).

The CLAUDE.md directive says "Prefer Bun.file over node:fs's readFile/writeFile" -- it specifically targets file read/write, not directory listing. There is no Bun-native replacement for `readdir`.

#### `existsSync` in check-drift.test.ts

Only used once (line 498): `if (!existsSync(dir)) return;`

**Migration:** Replace with `await Bun.file(dir).exists()` -- but this only works for files, not directories. For directories, use `try { await readdir(dir) } catch { return }` or keep `existsSync` from `node:fs`.

**Better approach:** Since `existsSync` is used to check if a directory exists, use `import { access } from "node:fs/promises"` with a try-catch, or simply catch the error from `readdir`.

#### Unused Test Variables

No explicitly unused test variables were found in the test files. The `require('fs')` pattern itself is the main hygiene issue.

---

### BUN-01: Migrate build-utils.ts from node:fs to Bun-Native APIs

**Current imports (line 9):**

```typescript
import { readdir, unlink, rm, lstat, mkdir } from "fs/promises";
```

**API Migration Table:**

| node:fs/promises Function | Usage                        | Bun Equivalent                              | Notes                                                                                           |
| ------------------------- | ---------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `readdir(dir)`            | List directory contents      | **No Bun-native equivalent**                | `Bun.Glob` is pattern-based, not a readdir replacement. Keep `readdir` from `node:fs/promises`. |
| `unlink(path)`            | Remove file                  | `import { unlink } from "node:fs/promises"` | No Bun-native equivalent. Keep as-is.                                                           |
| `rm(path, opts)`          | Remove directory recursively | `import { rm } from "node:fs/promises"`     | No Bun-native equivalent. Keep as-is.                                                           |
| `lstat(path)`             | Get file/symlink stats       | `import { lstat } from "node:fs/promises"`  | No Bun-native equivalent. Keep as-is.                                                           |
| `mkdir(dir, opts)`        | Create directory             | `import { mkdir } from "node:fs/promises"`  | No Bun-native equivalent. Keep as-is.                                                           |

**Key finding: build-utils.ts requires MINIMAL migration.**

The CLAUDE.md preference states: "Prefer `Bun.file` over `node:fs`'s readFile/writeFile". The functions used in `build-utils.ts` are directory management operations (`readdir`, `unlink`, `rm`, `lstat`, `mkdir`) -- none of which have Bun-native equivalents. Bun does not provide:

- `Bun.readdir()` -- no native directory listing
- `Bun.rm()` / `Bun.unlink()` -- no native file/directory deletion
- `Bun.lstat()` -- no native stat operation
- `Bun.mkdir()` -- no native directory creation

**The only valid migration is the import path change:** `from 'fs/promises'` should become `from 'node:fs/promises'` to use the explicit `node:` prefix (modern convention and clearer intent). This is a cosmetic but meaningful change for consistency with how the test files import from `"node:fs"`.

**Verdict:** BUN-01 scope should be narrowed to:

1. Update import from `'fs/promises'` to `'node:fs/promises'` (explicit node: prefix)
2. No functional API changes needed -- these operations have no Bun-native alternatives

---

### BUN-02: Migrate check-drift.test.ts from require('fs') and readdirSync to Bun APIs

**Current state:**

```typescript
// Line 12: Static imports
import { readdirSync, existsSync } from "node:fs";

// Lines 46, 65, 84, 105, 121, 133, 327, 346, 365, 384, 406, 424, 442, 452:
const actual = require("fs").readFileSync(absPath, "utf8");
```

**Migration plan:**

| Current                                          | Target                                                            | Rationale                                                      |
| ------------------------------------------------ | ----------------------------------------------------------------- | -------------------------------------------------------------- |
| `require("fs").readFileSync(path, "utf8")` (14x) | `await Bun.file(path).text()`                                     | CLAUDE.md: "Prefer Bun.file over node:fs's readFile/writeFile" |
| `readdirSync(dir)` (16x)                         | `readdir(dir)` from `"node:fs/promises"` (async)                  | No Bun-native readdir; switch from sync to async               |
| `readdirSync(dir, { withFileTypes: true })` (4x) | `readdir(dir, { withFileTypes: true })` from `"node:fs/promises"` | Keep withFileTypes support                                     |
| `existsSync(dir)` (1x)                           | try/catch around readdir                                          | Eliminate sync fs dependency                                   |

**Import changes:**

```typescript
// Before:
import { readdirSync, existsSync } from "node:fs";

// After:
import { readdir } from "node:fs/promises";
// (existsSync replaced with try/catch or Bun.file().exists())
```

**Async conversion impact:**

All 14 `require("fs").readFileSync` calls are inside test callbacks. These callbacks will need to become `async` if they are not already. Checking the code:

- `test("agent outputs match source", () => { ... })` -- needs `async`
- All test callbacks in Output Freshness and Plugin Output Freshness sections need async conversion

The `readdirSync` calls are in:

- Registry Completeness tests (4 calls) -- need async
- No Orphan Outputs tests (8 calls) -- need async
- Plugin No Orphan Outputs tests (4 calls) -- need async

---

### CLEAN-01: Fix Unused Loop Variable Naming

**Convention:** Prefix intentionally unused destructured variables with `_` (underscore).

**Audit of all `for (const [...] of ...)` loops with destructured variables across build scripts:**

#### Already Correct (using `_name` convention):

| File                      | Line | Variable    | Status                                               |
| ------------------------- | ---- | ----------- | ---------------------------------------------------- |
| `scripts/build-shared.ts` | 190  | `_name`     | OK -- unused first element in `[_name, def]`         |
| `scripts/build-shared.ts` | 572  | `_hookName` | OK -- unused first element in `[_hookName, hookDef]` |
| `scripts/build-shared.ts` | 622  | `_name`     | OK -- unused first element in `[_name, def]`         |
| `scripts/build-cursor.ts` | 154  | `_hookName` | OK -- unused first element in `[_hookName, hookDef]` |

#### Needs Fix (missing underscore prefix):

| File                      | Line | Current    | Should Be   | Used?                                                                     |
| ------------------------- | ---- | ---------- | ----------- | ------------------------------------------------------------------------- |
| `scripts/build-claude.ts` | 177  | `hookName` | `_hookName` | NOT used in loop body (console.log uses `hookDef.script`, not `hookName`) |

#### Used Variables (no change needed):

| File                      | Line | Variable    | Used In                                |
| ------------------------- | ---- | ----------- | -------------------------------------- |
| `scripts/build-all.ts`    | 130  | `relPath`   | Condition check and path.join          |
| `scripts/build-shared.ts` | 469  | `agentName` | Map key for generated.set              |
| `scripts/build-shared.ts` | 515  | `skillName` | Map key for generated.set              |
| `scripts/build-shared.ts` | 547  | `ruleName`  | Map key for generated.set              |
| `scripts/build-shared.ts` | 599  | `skillName` | Used in isCommandSkill + generated.set |
| `scripts/build-cursor.ts` | 68   | `agentName` | Output path + console.log              |
| `scripts/build-cursor.ts` | 96   | `skillName` | Output path + console.log              |
| `scripts/build-cursor.ts` | 122  | `ruleName`  | Output path + console.log              |
| `scripts/build-claude.ts` | 71   | `agentName` | Output path + console.log              |
| `scripts/build-claude.ts` | 107  | `skillName` | Output path + console.log              |
| `scripts/build-claude.ts` | 138  | `ruleName`  | Output path + console.log              |

**Summary:** Only 1 variable needs fixing: `hookName` -> `_hookName` in `build-claude.ts` line 177.

---

## 3. Bun API Mapping Table (Complete)

| Current API                                | File(s)                                                                                                                           | Bun-Native Equivalent             | Action                                                                                         |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------- |
| `require("fs").readFileSync(path, "utf8")` | check-drift.test.ts (14x)                                                                                                         | `await Bun.file(path).text()`     | **MIGRATE**                                                                                    |
| `readFileSync(path, "utf8")`               | plugin-spec-e2e.test.ts (15x), plugin-spec-hooks-format.test.ts (8x), plugin-spec-structure.test.ts (9x)                          | `await Bun.file(path).text()`     | **MIGRATE** (optional, lower priority -- these use explicit `node:fs` import, not `require()`) |
| `existsSync(path)`                         | plugin-spec-e2e.test.ts (9x), plugin-spec-hooks-format.test.ts (3x), plugin-spec-structure.test.ts (2x), check-drift.test.ts (1x) | `await Bun.file(path).exists()`   | **MIGRATE** (optional)                                                                         |
| `statSync(path)`                           | plugin-spec-e2e.test.ts (1x), plugin-spec-structure.test.ts (1x)                                                                  | No direct equivalent              | **KEEP** or use `node:fs/promises` stat                                                        |
| `readdirSync(dir)`                         | check-drift.test.ts (16x), plugin-spec-\*.test.ts (many)                                                                          | `readdir` from `node:fs/promises` | **MIGRATE to async**                                                                           |
| `readdir` from `fs/promises`               | build-utils.ts (2x)                                                                                                               | No Bun-native equivalent          | **KEEP** (update import to `node:fs/promises`)                                                 |
| `unlink` from `fs/promises`                | build-utils.ts (2x)                                                                                                               | No Bun-native equivalent          | **KEEP** (update import to `node:fs/promises`)                                                 |
| `rm` from `fs/promises`                    | build-utils.ts (2x)                                                                                                               | No Bun-native equivalent          | **KEEP** (update import to `node:fs/promises`)                                                 |
| `lstat` from `fs/promises`                 | build-utils.ts (2x)                                                                                                               | No Bun-native equivalent          | **KEEP** (update import to `node:fs/promises`)                                                 |
| `mkdir` from `fs/promises`                 | build-utils.ts (1x)                                                                                                               | No Bun-native equivalent          | **KEEP** (update import to `node:fs/promises`)                                                 |

---

## 4. File Inventory

### Files That Change

| File                                       | Changes                                                                                           | Requirement     |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------- | --------------- |
| `scripts/test-helpers.ts`                  | **NEW** -- shared test utilities module                                                           | TEST-01         |
| `scripts/plugin-spec-e2e.test.ts`          | Remove VALID_CLAUDE_CODE_EVENTS, extractFrontmatter, PLUGIN_ROOT; import from test-helpers        | TEST-01         |
| `scripts/plugin-spec-hooks-format.test.ts` | Remove VALID_CLAUDE_CODE_EVENTS, extractFrontmatter, PLUGIN_ROOT; import from test-helpers        | TEST-01         |
| `scripts/plugin-spec-structure.test.ts`    | Remove PLUGIN_ROOT; import from test-helpers                                                      | TEST-01         |
| `scripts/check-drift.test.ts`              | Replace require('fs') with Bun.file(); replace readdirSync with async readdir; replace existsSync | TEST-02, BUN-02 |
| `scripts/build-utils.ts`                   | Update import from `'fs/promises'` to `'node:fs/promises'`                                        | BUN-01          |
| `scripts/build-claude.ts`                  | Rename `hookName` to `_hookName` on line 177                                                      | CLEAN-01        |

### Files That Stay Unchanged

| File                      | Why                                                                |
| ------------------------- | ------------------------------------------------------------------ |
| `scripts/build-all.ts`    | No unused variables, no require('fs'), already uses Bun.write      |
| `scripts/build-shared.ts` | Already uses `_name`/`_hookName` convention, already uses Bun.file |
| `scripts/build-cursor.ts` | Already uses `_hookName` convention, already uses Bun.file         |
| `scripts/check-drift.ts`  | Already uses Bun.file -- no changes needed                         |

---

## 5. Risk Assessment

### Low Risk

| Change                                                  | Risk    | Mitigation                                                           |
| ------------------------------------------------------- | ------- | -------------------------------------------------------------------- |
| Extract test-helpers.ts (TEST-01)                       | Low     | Pure extraction, no logic changes. Import paths are straightforward. |
| Fix `hookName` -> `_hookName` (CLEAN-01)                | Trivial | Single character change, no behavior change.                         |
| Update `'fs/promises'` -> `'node:fs/promises'` (BUN-01) | Trivial | Import path alias, identical runtime behavior.                       |

### Medium Risk

| Change                                                                 | Risk   | Mitigation                                                                                                             |
| ---------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------- |
| Replace `require("fs").readFileSync` with `Bun.file().text()` (BUN-02) | Medium | Sync-to-async conversion in 14 test callbacks. Requires adding `async` keyword and `await`. Run full test suite after. |
| Replace `readdirSync` with async `readdir` (BUN-02)                    | Medium | Same async conversion concern. 16+ call sites in check-drift.test.ts. All test callbacks must become async.            |

### Risk Mitigations

1. **Run `bun test` after every wave** to catch regressions immediately
2. **Wave 1 (test-helpers extraction) is pure refactor** -- no logic changes, easy to verify
3. **Wave 2 (BUN-02 async migration) has highest risk** -- run check-drift.test.ts in isolation first
4. **CLEAN-01 and BUN-01 are trivial** -- can be combined with either wave

---

## 6. Scope Decisions

### In Scope (Phase 25)

- TEST-01: Extract VALID_CLAUDE_CODE_EVENTS, extractFrontmatter, PLUGIN_ROOT to scripts/test-helpers.ts
- TEST-02: Replace `require('fs').readFileSync` with `Bun.file().text()` in check-drift.test.ts
- BUN-01: Update build-utils.ts import from `'fs/promises'` to `'node:fs/promises'`
- BUN-02: Migrate check-drift.test.ts from readdirSync to async readdir from `node:fs/promises`
- CLEAN-01: Fix `hookName` -> `_hookName` in build-claude.ts

### Out of Scope (Future Phase)

- Migrating `readFileSync` / `readdirSync` / `existsSync` / `statSync` in plugin-spec-\*.test.ts files to async Bun APIs. These files already use explicit `import from "node:fs"` (not `require('fs')`), so they are less urgent. This is a larger undertaking (3 more files, 30+ call sites) and should be a separate phase if desired.
- Migrating generate-\*.ts scripts (generate-agents-from-cursor.ts, etc.) from `fs/promises` to `node:fs/promises`. These are legacy migration scripts that may not be actively used.

---

## 7. Recommended Wave Structure

### Wave 1: Extract Shared Test Helpers (TEST-01 + BUN-01 + CLEAN-01)

**Parallelizable subtasks:**

1. **Create `scripts/test-helpers.ts`** with:
   - `VALID_CLAUDE_CODE_EVENTS` (exported as `ReadonlySet<string>`)
   - `extractFrontmatter()` (exported function)
   - `PLUGIN_ROOT` (exported constant)

2. **Update `scripts/plugin-spec-e2e.test.ts`:**
   - Remove local VALID_CLAUDE_CODE_EVENTS (lines 36-44)
   - Remove local extractFrontmatter (lines 56-69)
   - Remove local PLUGIN_ROOT (line 29)
   - Add import from `./test-helpers`

3. **Update `scripts/plugin-spec-hooks-format.test.ts`:**
   - Remove local VALID_CLAUDE_CODE_EVENTS (lines 28-36)
   - Remove local extractFrontmatter (lines 48-61)
   - Remove local PLUGIN_ROOT (line 21)
   - Add import from `./test-helpers`

4. **Update `scripts/plugin-spec-structure.test.ts`:**
   - Remove local PLUGIN_ROOT (line 24)
   - Add import from `./test-helpers`

5. **Update `scripts/build-utils.ts`:**
   - Change `import { readdir, unlink, rm, lstat, mkdir } from 'fs/promises'` to `from 'node:fs/promises'`

6. **Update `scripts/build-claude.ts`:**
   - Change `hookName` to `_hookName` on line 177

**Verification:** `bun test` -- all existing tests pass with no logic changes.

### Wave 2: Migrate check-drift.test.ts to Bun/Async APIs (TEST-02 + BUN-02)

**Sequential subtasks (single file, extensive changes):**

1. **Replace import:**

   ```typescript
   // Before:
   import { readdirSync, existsSync } from "node:fs";

   // After:
   import { readdir } from "node:fs/promises";
   ```

2. **Replace all 14 `require("fs").readFileSync(...)` calls with `await Bun.file(...).text()`:**
   - Each test callback containing these calls must become `async`
   - Pattern: `const actual = require("fs").readFileSync(absPath, "utf8")` -> `const actual = await Bun.file(absPath).text()`

3. **Replace all 16 `readdirSync(...)` calls with `await readdir(...)`:**
   - Each test callback containing these calls must become `async`
   - `readdirSync(dir)` -> `await readdir(dir)`
   - `readdirSync(dir, { withFileTypes: true })` -> `await readdir(dir, { withFileTypes: true })`

4. **Replace `existsSync(dir)` (1 call, line 498):**
   - Wrap in try/catch around readdir, or use `import { access } from "node:fs/promises"`

**Verification:** `bun test scripts/check-drift.test.ts` first, then full `bun test`.

---

## 8. Implementation Notes

### test-helpers.ts Design

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

### Bun.file().text() vs readFileSync Pattern

```typescript
// Before (sync, uses require):
const actual = require("fs").readFileSync(absPath, "utf8");

// After (async, uses Bun.file):
const actual = await Bun.file(absPath).text();
```

For error handling where the file might not exist:

```typescript
// Before:
try {
  const actual = require("fs").readFileSync(absPath, "utf8");
  if (actual !== expected) { ... }
} catch {
  drifted.push(`${relPath}: missing`);
}

// After:
const file = Bun.file(absPath);
if (!(await file.exists())) {
  drifted.push(`${relPath}: missing`);
  continue;
}
const actual = await file.text();
if (actual !== expected) { ... }
```

This pattern is cleaner and avoids try/catch for expected missing-file scenarios.

### Why Not Bun.Glob for readdir?

`Bun.Glob` (`new Glob("*").scan(dir)`) could theoretically replace `readdirSync`, but:

1. **Different semantics**: Glob returns async iterables, not arrays. Would need `Array.fromAsync()` or manual collection.
2. **No `withFileTypes` support**: Several tests use `readdirSync(dir, { withFileTypes: true })` to distinguish files from directories. Glob's `onlyFiles` option is the only filter.
3. **Over-engineering**: Using `readdir` from `node:fs/promises` is the simplest, most readable approach.
4. **CLAUDE.md scope**: The directive says "Prefer Bun.file over node:fs's readFile/writeFile" -- it does not recommend replacing all `node:fs` APIs with Bun APIs.

---

## 9. Dependency Graph

```
Wave 1 (no dependencies between subtasks):
  [test-helpers.ts] ─┬─> [plugin-spec-e2e.test.ts update]
                      ├─> [plugin-spec-hooks-format.test.ts update]
                      └─> [plugin-spec-structure.test.ts update]
  [build-utils.ts update] (independent)
  [build-claude.ts update] (independent)

Wave 2 (depends on Wave 1 passing tests):
  [check-drift.test.ts full async migration]
```

Wave 1 subtasks are fully parallelizable.
Wave 2 is a single-file change but is large (~30 call sites).

---

## 10. Verification Plan

### After Wave 1

- `bun test` -- all tests pass
- `bun run build:all` -- build succeeds
- Verify `scripts/test-helpers.ts` exports are correctly imported by all 3 consumer test files
- Verify no duplicate definitions remain in consumer files

### After Wave 2

- `bun test scripts/check-drift.test.ts` -- drift tests pass
- `bun test` -- full suite passes
- Verify no `require("fs")` calls remain in check-drift.test.ts
- Verify no `readdirSync` calls remain in check-drift.test.ts
- Verify no `existsSync` calls remain in check-drift.test.ts
