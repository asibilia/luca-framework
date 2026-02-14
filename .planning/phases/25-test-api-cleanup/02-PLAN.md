---
id: "25-02"
title: "Migrate check-drift.test.ts to async Bun.file and node:fs/promises APIs"
wave: 2
requirements: ["TEST-02", "BUN-02"]
---

# Plan 25-02: Migrate check-drift.test.ts to Async Bun/node:fs APIs

## Objective

Migrate `scripts/check-drift.test.ts` from synchronous `require("fs").readFileSync` calls (14 occurrences) and `readdirSync` calls (16 occurrences) to asynchronous Bun-native and `node:fs/promises` equivalents. This aligns with the CLAUDE.md directive ("Prefer Bun.file over node:fs's readFile/writeFile") and eliminates the legacy `require("fs")` anti-pattern. The `existsSync` call (1 occurrence) is also replaced with a try/catch around async `readdir`.

## Context

@scripts/check-drift.test.ts -- the sole file being modified; currently 517 lines
@CLAUDE.md -- "Prefer `Bun.file` over `node:fs`'s readFile/writeFile"
@scripts/build-shared.ts -- provides `generateAllOutputs()` and registries consumed by the test

**Key constraint:** Converting `readFileSync` to `Bun.file().text()` and `readdirSync` to `readdir()` changes synchronous calls to asynchronous. Every test callback containing these calls MUST become `async` and every call MUST be `await`ed.

**Key constraint:** Bun has NO native `readdir` equivalent. Use `readdir` from `node:fs/promises` (async) for directory listing. `Bun.Glob` is not a suitable replacement (different semantics, no `withFileTypes` support).

## Tasks

### Task 1: Update imports

**Goal:** Replace the sync `node:fs` import with async `node:fs/promises` import. Remove `require("fs")` dependency.

**Files:** `scripts/check-drift.test.ts`

**Steps:**

1. Read `scripts/check-drift.test.ts` to verify current state.

2. Replace the import on line 12:

   ```typescript
   // Before:
   import { readdirSync, existsSync } from "node:fs";

   // After:
   import { readdir } from "node:fs/promises";
   ```

   This removes `readdirSync` and `existsSync` from the imports and adds the async `readdir` function.

**Verification:**

- [ ] File has `import { readdir } from "node:fs/promises"` and no `import ... from "node:fs"`
- [ ] No `require("fs")` calls remain (these will be fixed in subsequent tasks, but verify import is clean)

---

### Task 2: Migrate Output Freshness tests (section 1) to async Bun.file

**Goal:** Replace 6 `require("fs").readFileSync` calls with `await Bun.file().text()` in the "Output Freshness" describe block. Make all affected test callbacks `async`.

**Files:** `scripts/check-drift.test.ts`

**Steps:**

1. Read the file to verify current state of each test callback.

2. For each of the 4 loop-based freshness tests (`agent outputs match source`, `skill outputs match source`, `rule outputs match source`, `hook scripts match source`), apply this pattern change:

   The current pattern (example from "agent outputs match source", lines 38-55):

   ```typescript
   test("agent outputs match source", () => {
     const drifted: string[] = [];
     const agentFiles = [...generated.entries()].filter(
       ([p]) => p.includes("/agents/") && !p.startsWith("dist/"),
     );
     for (const [relPath, expected] of agentFiles) {
       const absPath = path.join(ROOT, relPath);
       try {
         const actual = require("fs").readFileSync(absPath, "utf8");
         if (actual !== expected) {
           drifted.push(`${relPath}: content differs`);
         }
       } catch {
         drifted.push(`${relPath}: missing`);
       }
     }
     expect(drifted).toEqual([]);
   });
   ```

   Becomes:

   ```typescript
   test("agent outputs match source", async () => {
     const drifted: string[] = [];
     const agentFiles = [...generated.entries()].filter(
       ([p]) => p.includes("/agents/") && !p.startsWith("dist/"),
     );
     for (const [relPath, expected] of agentFiles) {
       const absPath = path.join(ROOT, relPath);
       const file = Bun.file(absPath);
       if (!(await file.exists())) {
         drifted.push(`${relPath}: missing`);
         continue;
       }
       const actual = await file.text();
       if (actual !== expected) {
         drifted.push(`${relPath}: content differs`);
       }
     }
     expect(drifted).toEqual([]);
   });
   ```

   Apply the same pattern to all 4 loop-based tests:
   - `"agent outputs match source"` (line 38) -- has `require("fs").readFileSync` at line 46
   - `"skill outputs match source"` (line 57) -- has `require("fs").readFileSync` at line 65
   - `"rule outputs match source"` (line 76) -- has `require("fs").readFileSync` at line 84
   - `"hook scripts match source"` (line 95) -- has `require("fs").readFileSync` at line 105

3. For the settings.json test (`"hooks config in .claude/settings.json matches source"`, line 116):

   Change from:

   ```typescript
   test("hooks config in .claude/settings.json matches source", () => {
     const expectedJson = generated.get(".claude/settings.json__hooks");
     expect(expectedJson).toBeDefined();

     const settingsPath = path.join(ROOT, ".claude", "settings.json");
     const settingsContent = require("fs").readFileSync(settingsPath, "utf8");
     const settings = JSON.parse(settingsContent);
     const actualJson = JSON.stringify(settings.hooks ?? {}, null, 2);

     expect(actualJson).toBe(expectedJson);
   });
   ```

   To:

   ```typescript
   test("hooks config in .claude/settings.json matches source", async () => {
     const expectedJson = generated.get(".claude/settings.json__hooks");
     expect(expectedJson).toBeDefined();

     const settingsPath = path.join(ROOT, ".claude", "settings.json");
     const settingsContent = await Bun.file(settingsPath).text();
     const settings = JSON.parse(settingsContent);
     const actualJson = JSON.stringify(settings.hooks ?? {}, null, 2);

     expect(actualJson).toBe(expectedJson);
   });
   ```

4. For the cursor hooks.json test (`".cursor/hooks.json matches source"`, line 128):

   Change from:

   ```typescript
   test(".cursor/hooks.json matches source", () => {
     const expectedJson = generated.get(".cursor/hooks.json");
     expect(expectedJson).toBeDefined();

     const hooksJsonPath = path.join(ROOT, ".cursor", "hooks.json");
     const actualJson = require("fs").readFileSync(hooksJsonPath, "utf8");

     expect(actualJson).toBe(expectedJson);
   });
   ```

   To:

   ```typescript
   test(".cursor/hooks.json matches source", async () => {
     const expectedJson = generated.get(".cursor/hooks.json");
     expect(expectedJson).toBeDefined();

     const hooksJsonPath = path.join(ROOT, ".cursor", "hooks.json");
     const actualJson = await Bun.file(hooksJsonPath).text();

     expect(actualJson).toBe(expectedJson);
   });
   ```

**Verification:**

- [ ] `bun test scripts/check-drift.test.ts` passes (Output Freshness section)
- [ ] No `require("fs")` calls remain in lines 31-137

---

### Task 3: Migrate Registry Completeness tests (section 2) to async readdir

**Goal:** Replace 4 `readdirSync` calls with `await readdir()` in the "Registry Completeness" describe block. Make all affected test callbacks `async`.

**Files:** `scripts/check-drift.test.ts`

**Steps:**

1. Read the file to verify current state.

2. For each of the 4 registry tests, change `readdirSync` to `await readdir` and add `async` to the callback:
   - `"every src/skills/general/*.skill.ts has a skillRegistry entry"` (line 153):
     - Change `() => {` to `async () => {`
     - Change `readdirSync(skillDir)` to `await readdir(skillDir)` (line 155)

   - `"every src/agents/general/*.agent.ts has an agentRegistry entry"` (line 170):
     - Change `() => {` to `async () => {`
     - Change `readdirSync(agentDir)` to `await readdir(agentDir)` (line 172)

   - `"every src/rules/general/*.rule.ts has a ruleRegistry entry"` (line 187):
     - Change `() => {` to `async () => {`
     - Change `readdirSync(ruleDir)` to `await readdir(ruleDir)` (line 189)

   - `"every src/hooks/scripts/*.sh has a hookRegistry entry"` (line 204):
     - Change `() => {` to `async () => {`
     - Change `readdirSync(hooksDir)` to `await readdir(hooksDir)` (line 206)

   Note: `readdir` from `node:fs/promises` returns `Promise<string[]>` (same shape as `readdirSync`), so the `.filter()` chain works identically after `await`.

**Verification:**

- [ ] `bun test scripts/check-drift.test.ts` passes (Registry Completeness section)
- [ ] No `readdirSync` calls remain in lines 142-220

---

### Task 4: Migrate No Orphan Outputs tests (section 3) to async readdir

**Goal:** Replace 8 `readdirSync` calls with `await readdir()` in the "No Orphan Outputs" describe block. Make all affected test callbacks `async`.

**Files:** `scripts/check-drift.test.ts`

**Steps:**

1. Read the file to verify current state.

2. Apply the same pattern to all 8 tests:
   - `"no orphan agent outputs in .claude/agents/"` (line 239):
     - Change `() => {` to `async () => {`
     - Change `readdirSync(dir)` to `await readdir(dir)` (line 241)

   - `"no orphan agent outputs in .cursor/agents/"` (line 248):
     - Change `() => {` to `async () => {`
     - Change `readdirSync(dir)` to `await readdir(dir)` (line 250)

   - `"no orphan skill outputs in .claude/skills/"` (line 257):
     - Change `() => {` to `async () => {`
     - Change `readdirSync(dir, { withFileTypes: true })` to `await readdir(dir, { withFileTypes: true })` (line 259)

   - `"no orphan skill outputs in .cursor/skills/"` (line 266):
     - Change `() => {` to `async () => {`
     - Change `readdirSync(dir, { withFileTypes: true })` to `await readdir(dir, { withFileTypes: true })` (line 268)

   - `"no orphan rule outputs in .claude/rules/"` (line 275):
     - Change `() => {` to `async () => {`
     - Change `readdirSync(dir)` to `await readdir(dir)` (line 277)

   - `"no orphan rule outputs in .cursor/rules/"` (line 284):
     - Change `() => {` to `async () => {`
     - Change `readdirSync(dir)` to `await readdir(dir)` (line 286)

   - `"no orphan hook scripts in .claude/hooks/"` (line 293):
     - Change `() => {` to `async () => {`
     - Change `readdirSync(dir)` to `await readdir(dir)` (line 295)

   - `"no orphan hook scripts in .cursor/hooks/"` (line 300):
     - Change `() => {` to `async () => {`
     - Change `readdirSync(dir)` to `await readdir(dir)` (line 302)

**Verification:**

- [ ] `bun test scripts/check-drift.test.ts` passes (No Orphan Outputs section)
- [ ] No `readdirSync` calls remain in lines 226-306

---

### Task 5: Migrate Plugin Output Freshness tests (section 4) to async Bun.file

**Goal:** Replace 8 `require("fs").readFileSync` calls with `await Bun.file().text()` in the "Plugin Output Freshness" describe block. Make all affected test callbacks `async`.

**Files:** `scripts/check-drift.test.ts`

**Steps:**

1. Read the file to verify current state.

2. For the 4 loop-based plugin freshness tests, apply the same Bun.file pattern from Task 2:
   - `"plugin agent outputs match source"` (line 319) -- `require("fs").readFileSync` at line 327
   - `"plugin skill outputs match source"` (line 338) -- `require("fs").readFileSync` at line 346
   - `"plugin command outputs match source"` (line 357) -- `require("fs").readFileSync` at line 365
   - `"plugin hook scripts match source"` (line 376) -- `require("fs").readFileSync` at line 384

   Each follows the same try/catch pattern. Convert to the Bun.file exists/text pattern:

   ```typescript
   // Before:
   try {
     const actual = require("fs").readFileSync(absPath, "utf8");
     if (actual !== expected) {
       drifted.push(`${relPath}: content differs`);
     }
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
   if (actual !== expected) {
     drifted.push(`${relPath}: content differs`);
   }
   ```

3. For the 4 single-file plugin freshness tests:
   - `"plugin hooks.json matches source"` (line 395) -- `require("fs").readFileSync` at line 406:

     ```typescript
     // Before:
     const actualJson = require("fs").readFileSync(hooksJsonPath, "utf8");

     // After:
     const actualJson = await Bun.file(hooksJsonPath).text();
     ```

   - `"plugin.json matches source"` (line 411) -- `require("fs").readFileSync` at line 424:

     ```typescript
     // Before:
     const actualJson = require("fs").readFileSync(pluginJsonPath, "utf8");

     // After:
     const actualJson = await Bun.file(pluginJsonPath).text();
     ```

   - `"marketplace.json matches source"` (line 429) -- `require("fs").readFileSync` at line 442:

     ```typescript
     // Before:
     const actualJson = require("fs").readFileSync(marketplaceJsonPath, "utf8");

     // After:
     const actualJson = await Bun.file(marketplaceJsonPath).text();
     ```

   - `"README.md matches source"` (line 447) -- `require("fs").readFileSync` at line 452:

     ```typescript
     // Before:
     const actualReadme = require("fs").readFileSync(readmePath, "utf8");

     // After:
     const actualReadme = await Bun.file(readmePath).text();
     ```

   All 4 of these test callbacks also need `async` added.

**Verification:**

- [ ] `bun test scripts/check-drift.test.ts` passes (Plugin Output Freshness section)
- [ ] No `require("fs")` calls remain in lines 312-456

---

### Task 6: Migrate Plugin No Orphan Outputs tests (section 5) to async readdir + replace existsSync

**Goal:** Replace 4 `readdirSync` calls and 1 `existsSync` call with async equivalents in the "Plugin No Orphan Outputs" describe block.

**Files:** `scripts/check-drift.test.ts`

**Steps:**

1. Read the file to verify current state.

2. Apply async readdir to the 4 tests:
   - `"no orphan agent outputs in dist/plugin/agents/"` (line 478):
     - Change `() => {` to `async () => {`
     - Change `readdirSync(dir)` to `await readdir(dir)` (line 480)

   - `"no orphan skill outputs in dist/plugin/skills/"` (line 487):
     - Change `() => {` to `async () => {`
     - Change `readdirSync(dir, { withFileTypes: true })` to `await readdir(dir, { withFileTypes: true })` (line 489)

   - `"no orphan command outputs in dist/plugin/commands/"` (line 496):
     - Change `() => {` to `async () => {`
     - Replace `existsSync(dir)` (line 498) with a try/catch approach:

       ```typescript
       // Before:
       test("no orphan command outputs in dist/plugin/commands/", () => {
         const dir = path.join(ROOT, "dist", "plugin", "commands");
         if (!existsSync(dir)) return; // skip if commands/ not yet generated
         const validCommandNames = new Set([
           ...Object.keys(skillRegistry).filter(isCommandSkill),
           "lu",
         ]);
         const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
         const orphans = files.filter(
           (f) => !validCommandNames.has(f.replace(".md", "")),
         );
         expect(orphans).toEqual([]);
       });

       // After:
       test("no orphan command outputs in dist/plugin/commands/", async () => {
         const dir = path.join(ROOT, "dist", "plugin", "commands");
         let files: string[];
         try {
           files = (await readdir(dir)).filter((f) => f.endsWith(".md"));
         } catch {
           return; // skip if commands/ not yet generated
         }
         const validCommandNames = new Set([
           ...Object.keys(skillRegistry).filter(isCommandSkill),
           "lu",
         ]);
         const orphans = files.filter(
           (f) => !validCommandNames.has(f.replace(".md", "")),
         );
         expect(orphans).toEqual([]);
       });
       ```

   - `"no orphan hook scripts in dist/plugin/scripts/"` (line 510):
     - Change `() => {` to `async () => {`
     - Change `readdirSync(dir)` to `await readdir(dir)` (line 512)

**Verification:**

- [ ] `bun test scripts/check-drift.test.ts` passes (Plugin No Orphan Outputs section)
- [ ] No `readdirSync` calls remain in the file
- [ ] No `existsSync` calls remain in the file
- [ ] No `require("fs")` calls remain in the file

---

### Task 7: Final validation and cleanup

**Goal:** Verify the entire file has no remaining sync fs calls and all tests pass.

**Files:** `scripts/check-drift.test.ts`

**Steps:**

1. Read the final state of the file.

2. Verify there are ZERO occurrences of:
   - `require("fs")`
   - `readdirSync`
   - `existsSync`
   - `readFileSync`
   - `import ... from "node:fs"` (the sync fs module import)

3. Verify the file has:
   - `import { readdir } from "node:fs/promises"` as the only fs-related import
   - All test callbacks that perform file/directory operations are `async`

4. Run the targeted test:

   ```bash
   bun test scripts/check-drift.test.ts
   ```

5. Run the full test suite:

   ```bash
   bun test
   ```

6. Run the drift check:

   ```bash
   bun run check:drift
   ```

**Verification:**

- [ ] `bun test scripts/check-drift.test.ts` passes
- [ ] `bun test` passes (full suite)
- [ ] No sync fs APIs remain in the file
- [ ] All 30 test callbacks that had sync fs calls are now `async`

---

## Success Criteria

- [ ] Zero `require("fs")` calls remain in `scripts/check-drift.test.ts`
- [ ] Zero `readdirSync` calls remain in `scripts/check-drift.test.ts`
- [ ] Zero `existsSync` calls remain in `scripts/check-drift.test.ts`
- [ ] Zero `readFileSync` calls remain in `scripts/check-drift.test.ts`
- [ ] All 14 file reads use `await Bun.file(path).text()` instead of `require("fs").readFileSync`
- [ ] All 16 directory reads use `await readdir()` from `node:fs/promises`
- [ ] The 1 `existsSync` is replaced with a try/catch around `readdir`
- [ ] Import is `import { readdir } from "node:fs/promises"` (no `"node:fs"` sync import)
- [ ] `bun test` passes (full suite)
- [ ] `bun run build:all` succeeds (build scripts unaffected)

## Execution Rules

1. **Read before edit:** Always read the file before each task to verify current line numbers. Phase 24 refactored this file heavily; line numbers in this plan are based on the current post-Phase-24 state but MUST be re-verified.
2. **Test after each task:** Run `bun test scripts/check-drift.test.ts` after each task to catch regressions incrementally.
3. **Async consistency:** Every test callback that uses `await` must have the `async` keyword. Missing `async` will cause "await is only valid in async function" errors.
4. **Preserve test semantics:** The Bun.file `exists()` + `text()` pattern must behave identically to the try/catch around `readFileSync`. A missing file should produce the same "missing" error message.
5. **No Bun.Glob for readdir:** Use `readdir` from `node:fs/promises`, NOT `Bun.Glob`. Bun has no native readdir equivalent, and Glob has different semantics (no `withFileTypes` support).
6. **Full suite at the end:** After all tasks pass individually, run the full `bun test` suite to verify no cross-file regressions.
