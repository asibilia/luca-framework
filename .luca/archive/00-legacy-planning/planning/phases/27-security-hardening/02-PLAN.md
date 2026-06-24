---
id: "27-02"
title: "Build Pipeline + Schema Hardening"
wave: 1
requirements: ["SEC-03", "SEC-04"]
---

# Plan 27-02: Build Pipeline + Schema Hardening

## Objective

Add defensive guards to the build pipeline and plugin schema: implement a root path guard in `cleanDirectory()` and `cleanSkillsDirectory()` in `build-utils.ts` to prevent accidental deletion outside allowed output directories (SEC-03), and add description length (max 500) and keywords array size (max 20) limits to `pluginManifestSchema` in `plugin.types.ts` to enforce sensible bounds on external input (SEC-04). Both changes include comprehensive test coverage.

## Context

@scripts/build-utils.ts -- SEC-03: `cleanDirectory()` and `cleanSkillsDirectory()` lack path safety guards (lines 17-51, 57-81)
@src/compilers/plugin.types.ts -- SEC-04: `pluginManifestSchema` lacks description length and keywords size limits (lines 101-134)
@src/compilers/plugin.types.test.ts -- existing schema tests (303 lines); needs boundary tests for new constraints
@scripts/build-claude.ts -- consumer of `cleanDirectory()` (passes safe paths, no changes needed)
@scripts/build-cursor.ts -- consumer of `cleanDirectory()` (passes safe paths, no changes needed)
@scripts/build-all.ts -- consumer of `cleanDirectory()` (passes safe paths, no changes needed)

## Tasks

### Task 1: Add `assertSafeCleanTarget()` guard to `build-utils.ts` (SEC-03)

**Goal:** Prevent `cleanDirectory()` and `cleanSkillsDirectory()` from operating on directories outside the project root or outside known safe output directories (`.claude`, `.cursor`, `dist`).

**Files:** `scripts/build-utils.ts`

**Steps:**

1. Add the following constant and guard function after the existing imports (after line 10, before the `cleanDirectory` function on line 17):

   ````typescript
   /**
    * Known safe root directories for clean operations.
    * Only directories within these roots may be cleaned by the build pipeline.
    */
   const SAFE_CLEAN_ROOTS = [".claude", ".cursor", "dist"] as const;

   /**
    * Validate that a directory path is within the project root and within
    * an allowed output directory. Throws if the path is unsafe.
    *
    * This guard prevents accidental deletion of files outside the build
    * output directories (e.g., due to a bug or refactor passing the wrong path).
    *
    * @param dir - The directory path to validate
    * @throws Error if the path is outside the project root or not within an allowed root
    *
    * @example
    * ```typescript
    * assertSafeCleanTarget('/Users/dev/project/.claude/agents'); // OK
    * assertSafeCleanTarget('/Users/dev/project/dist/plugin');    // OK
    * assertSafeCleanTarget('/etc');                               // throws
    * assertSafeCleanTarget('/Users/dev/project/src');             // throws
    * ```
    */
   function assertSafeCleanTarget(dir: string): void {
     const resolved = path.resolve(dir);
     const projectRoot = path.resolve(process.cwd());

     // Must be within the project root (not equal to it — never clean project root itself)
     if (
       !resolved.startsWith(projectRoot + path.sep) &&
       resolved !== projectRoot
     ) {
       throw new Error(
         `cleanDirectory() refused: "${dir}" is outside the project root "${projectRoot}"`,
       );
     }

     // Must be within an allowed output subdirectory
     const relative = path.relative(projectRoot, resolved);
     const isAllowed = SAFE_CLEAN_ROOTS.some(
       (root) => relative === root || relative.startsWith(root + path.sep),
     );

     if (!isAllowed) {
       throw new Error(
         `cleanDirectory() refused: "${relative}" is not within an allowed output directory (${SAFE_CLEAN_ROOTS.join(", ")})`,
       );
     }
   }
   ````

2. Add `assertSafeCleanTarget(dir);` as the first line inside `cleanDirectory()` (line 21, after the function signature):

   ```typescript
   export async function cleanDirectory(
     dir: string,
     extensions: string[],
   ): Promise<string[]> {
     assertSafeCleanTarget(dir);  // <-- ADD THIS LINE
     const removed: string[] = [];
     // ... rest unchanged
   ```

3. Add `assertSafeCleanTarget(dir);` as the first line inside `cleanSkillsDirectory()` (line 59, after the function signature):

   ```typescript
   export async function cleanSkillsDirectory(dir: string): Promise<string[]> {
     assertSafeCleanTarget(dir);  // <-- ADD THIS LINE
     const removed: string[] = [];
     // ... rest unchanged
   ```

4. Export `assertSafeCleanTarget` for testing (change `function` to `export function`):

   ```typescript
   export function assertSafeCleanTarget(dir: string): void {
   ```

5. Also export `SAFE_CLEAN_ROOTS` for testing:

   ```typescript
   export const SAFE_CLEAN_ROOTS = [".claude", ".cursor", "dist"] as const;
   ```

6. Verify type-check passes: `bunx --bun tsc --noEmit scripts/build-utils.ts`

**Verification:**

- [ ] `bunx --bun tsc --noEmit` passes (no type errors)
- [ ] `assertSafeCleanTarget` is exported and callable
- [ ] `SAFE_CLEAN_ROOTS` contains exactly `[".claude", ".cursor", "dist"]`
- [ ] Both `cleanDirectory()` and `cleanSkillsDirectory()` call `assertSafeCleanTarget()` as their first operation
- [ ] Existing callers in `build-claude.ts`, `build-cursor.ts`, `build-all.ts` pass safe paths and are unaffected

---

### Task 2: Create `scripts/build-utils.test.ts` with path guard tests (SEC-03)

**Goal:** Add comprehensive tests for `assertSafeCleanTarget()` verifying it rejects dangerous paths and accepts legitimate build output paths.

**Files:** `scripts/build-utils.test.ts` (NEW)

**Steps:**

1. Create `scripts/build-utils.test.ts` with the following content:

   ```typescript
   import { describe, test, expect } from "bun:test";
   import path from "path";
   import { assertSafeCleanTarget, SAFE_CLEAN_ROOTS } from "./build-utils";

   const PROJECT_ROOT = path.resolve(process.cwd());

   describe("SAFE_CLEAN_ROOTS", () => {
     test("contains expected root directories", () => {
       expect(SAFE_CLEAN_ROOTS).toContain(".claude");
       expect(SAFE_CLEAN_ROOTS).toContain(".cursor");
       expect(SAFE_CLEAN_ROOTS).toContain("dist");
       expect(SAFE_CLEAN_ROOTS).toHaveLength(3);
     });
   });

   describe("assertSafeCleanTarget", () => {
     test("accepts .claude subdirectories", () => {
       expect(() =>
         assertSafeCleanTarget(path.join(PROJECT_ROOT, ".claude", "agents")),
       ).not.toThrow();
       expect(() =>
         assertSafeCleanTarget(path.join(PROJECT_ROOT, ".claude", "hooks")),
       ).not.toThrow();
       expect(() =>
         assertSafeCleanTarget(path.join(PROJECT_ROOT, ".claude", "skills")),
       ).not.toThrow();
       expect(() =>
         assertSafeCleanTarget(path.join(PROJECT_ROOT, ".claude", "rules")),
       ).not.toThrow();
     });

     test("accepts .cursor subdirectories", () => {
       expect(() =>
         assertSafeCleanTarget(path.join(PROJECT_ROOT, ".cursor", "agents")),
       ).not.toThrow();
       expect(() =>
         assertSafeCleanTarget(path.join(PROJECT_ROOT, ".cursor", "hooks")),
       ).not.toThrow();
       expect(() =>
         assertSafeCleanTarget(path.join(PROJECT_ROOT, ".cursor", "skills")),
       ).not.toThrow();
       expect(() =>
         assertSafeCleanTarget(path.join(PROJECT_ROOT, ".cursor", "rules")),
       ).not.toThrow();
     });

     test("accepts dist subdirectories", () => {
       expect(() =>
         assertSafeCleanTarget(path.join(PROJECT_ROOT, "dist")),
       ).not.toThrow();
       expect(() =>
         assertSafeCleanTarget(path.join(PROJECT_ROOT, "dist", "plugin")),
       ).not.toThrow();
       expect(() =>
         assertSafeCleanTarget(
           path.join(PROJECT_ROOT, "dist", "plugin", "agents"),
         ),
       ).not.toThrow();
     });

     test("accepts root-level .claude and .cursor directories", () => {
       expect(() =>
         assertSafeCleanTarget(path.join(PROJECT_ROOT, ".claude")),
       ).not.toThrow();
       expect(() =>
         assertSafeCleanTarget(path.join(PROJECT_ROOT, ".cursor")),
       ).not.toThrow();
     });

     test("rejects paths outside the project root", () => {
       expect(() => assertSafeCleanTarget("/")).toThrow(
         /outside the project root/,
       );
       expect(() => assertSafeCleanTarget("/etc")).toThrow(
         /outside the project root/,
       );
       expect(() => assertSafeCleanTarget("/Users")).toThrow(
         /outside the project root/,
       );
       expect(() => assertSafeCleanTarget("/tmp/malicious")).toThrow(
         /outside the project root/,
       );
     });

     test("rejects paths within project root but outside allowed directories", () => {
       expect(() =>
         assertSafeCleanTarget(path.join(PROJECT_ROOT, "src")),
       ).toThrow(/not within an allowed output directory/);
       expect(() =>
         assertSafeCleanTarget(path.join(PROJECT_ROOT, "scripts")),
       ).toThrow(/not within an allowed output directory/);
       expect(() =>
         assertSafeCleanTarget(path.join(PROJECT_ROOT, "node_modules")),
       ).toThrow(/not within an allowed output directory/);
       expect(() =>
         assertSafeCleanTarget(path.join(PROJECT_ROOT, "packages")),
       ).toThrow(/not within an allowed output directory/);
       expect(() =>
         assertSafeCleanTarget(path.join(PROJECT_ROOT, ".planning")),
       ).toThrow(/not within an allowed output directory/);
     });

     test("rejects the project root itself", () => {
       // Project root itself should be rejected because it matches
       // resolved === projectRoot but the relative path is "" which
       // is not in SAFE_CLEAN_ROOTS
       expect(() => assertSafeCleanTarget(PROJECT_ROOT)).toThrow(
         /not within an allowed output directory/,
       );
     });

     test("rejects path traversal attempts", () => {
       expect(() =>
         assertSafeCleanTarget(path.join(PROJECT_ROOT, "..", "other-project")),
       ).toThrow(/outside the project root/);
       expect(() =>
         assertSafeCleanTarget(
           path.join(PROJECT_ROOT, ".claude", "..", "..", "etc"),
         ),
       ).toThrow();
     });

     test("handles relative paths by resolving against cwd", () => {
       // Relative paths resolve to absolute via path.resolve(cwd + relative)
       // ".claude/agents" resolves to PROJECT_ROOT/.claude/agents which is safe
       expect(() => assertSafeCleanTarget(".claude/agents")).not.toThrow();

       // "src" resolves to PROJECT_ROOT/src which is NOT in allowed roots
       expect(() => assertSafeCleanTarget("src")).toThrow(
         /not within an allowed output directory/,
       );
     });
   });
   ```

2. Run the tests: `bun test scripts/build-utils.test.ts`

**Verification:**

- [ ] `bun test scripts/build-utils.test.ts` passes (all tests green)
- [ ] Tests cover: allowed directories, rejected external paths, rejected internal-but-unsafe paths, traversal attempts, relative path resolution
- [ ] Test file follows project conventions (bun:test, kebab-case filename, functional patterns)

---

### Task 3: Add constraint limits to `pluginManifestSchema` (SEC-04)

**Goal:** Add `.max(500)` to description and `.max(20)` / per-item `.min(1).max(50)` to keywords in the plugin manifest schema.

**Files:** `src/compilers/plugin.types.ts`

**Steps:**

1. Update the `description` field (line 118) in `pluginManifestSchema`. Replace:

   ```typescript
   /** Human-readable description of the plugin's purpose. */
   description: z.string().optional(),
   ```

   With:

   ```typescript
   /** Human-readable description of the plugin's purpose (max 500 chars). */
   description: z.string().max(500).optional(),
   ```

2. Update the `keywords` field (lines 132-133) in `pluginManifestSchema`. Replace:

   ```typescript
   /** Searchable keywords / tags for discovery. Defaults to empty array. */
   keywords: z.array(z.string()).default([]),
   ```

   With:

   ```typescript
   /** Searchable keywords / tags for discovery (max 20 items, each 1-50 chars). Defaults to empty array. */
   keywords: z.array(z.string().min(1).max(50)).max(20).default([]),
   ```

3. Verify type-check passes: `bunx --bun tsc --noEmit src/compilers/plugin.types.ts`

4. Verify existing tests still pass: `bun test src/compilers/plugin.types.test.ts`

**Verification:**

- [ ] `bunx --bun tsc --noEmit` passes (no type errors)
- [ ] `bun test src/compilers/plugin.types.test.ts` passes (all existing tests green)
- [ ] `description` field has `.max(500)` constraint
- [ ] `keywords` array has `.max(20)` constraint
- [ ] Individual keyword strings have `.min(1).max(50)` constraints
- [ ] Existing tests with short descriptions and small keyword arrays remain valid

---

### Task 4: Add boundary tests to `plugin.types.test.ts` (SEC-04)

**Goal:** Add tests verifying the new description length and keywords array size limits at their exact boundaries.

**Files:** `src/compilers/plugin.types.test.ts`

**Steps:**

1. Add the following test block inside the existing `describe("pluginManifestSchema", ...)` block (after the last test at line 256, before the closing `});` of the describe block):

   ```typescript
   test("accepts description at exactly 500 characters", () => {
     const result = pluginManifestSchema.safeParse({
       name: "my-plugin",
       description: "a".repeat(500),
     });
     expect(result.success).toBe(true);
   });

   test("rejects description exceeding 500 characters", () => {
     const result = pluginManifestSchema.safeParse({
       name: "my-plugin",
       description: "a".repeat(501),
     });
     expect(result.success).toBe(false);
   });

   test("accepts keywords array with exactly 20 items", () => {
     const keywords = Array.from({ length: 20 }, (_, i) => `kw-${i}`);
     const result = pluginManifestSchema.safeParse({
       name: "my-plugin",
       keywords,
     });
     expect(result.success).toBe(true);
     if (result.success) {
       expect(result.data.keywords).toHaveLength(20);
     }
   });

   test("rejects keywords array exceeding 20 items", () => {
     const keywords = Array.from({ length: 21 }, (_, i) => `kw-${i}`);
     const result = pluginManifestSchema.safeParse({
       name: "my-plugin",
       keywords,
     });
     expect(result.success).toBe(false);
   });

   test("accepts keyword at exactly 50 characters", () => {
     const result = pluginManifestSchema.safeParse({
       name: "my-plugin",
       keywords: ["a".repeat(50)],
     });
     expect(result.success).toBe(true);
   });

   test("rejects keyword exceeding 50 characters", () => {
     const result = pluginManifestSchema.safeParse({
       name: "my-plugin",
       keywords: ["a".repeat(51)],
     });
     expect(result.success).toBe(false);
   });

   test("rejects empty string keyword", () => {
     const result = pluginManifestSchema.safeParse({
       name: "my-plugin",
       keywords: ["valid", ""],
     });
     expect(result.success).toBe(false);
   });
   ```

2. Run the tests: `bun test src/compilers/plugin.types.test.ts`

**Verification:**

- [ ] `bun test src/compilers/plugin.types.test.ts` passes (all tests green, including new boundary tests)
- [ ] Description boundary: 500 chars passes, 501 chars fails
- [ ] Keywords array boundary: 20 items passes, 21 items fails
- [ ] Keyword length boundary: 50 chars passes, 51 chars fails
- [ ] Empty string keyword is rejected
- [ ] All pre-existing tests still pass

---

### Task 5: Run full verification suite

**Goal:** Confirm all changes work together and nothing is broken across the full test suite.

**Files:** All files modified in Tasks 1-4

**Steps:**

1. Run type-check: `bunx --bun tsc --noEmit`
2. Run full test suite: `bun test`
3. Run build to ensure build-utils guard does not break existing build: `bun run build:all`
4. Run drift check: `bun test scripts/check-drift.test.ts`

**Verification:**

- [ ] `bunx --bun tsc --noEmit` passes (no type errors)
- [ ] `bun test` passes (all 945+ tests, 6 skip, plus new tests)
- [ ] `bun run build:all` completes successfully (no `assertSafeCleanTarget` rejections)
- [ ] `bun test scripts/check-drift.test.ts` passes (zero drift)
- [ ] New test file `scripts/build-utils.test.ts` is included in test run and passes
- [ ] New boundary tests in `src/compilers/plugin.types.test.ts` are included and pass

---

## Success Criteria

- [ ] SEC-03: `cleanDirectory()` and `cleanSkillsDirectory()` throw on paths outside `.claude/`, `.cursor/`, or `dist/`
- [ ] SEC-03: `assertSafeCleanTarget()` is exported and tested with comprehensive test cases
- [ ] SEC-03: Existing build callers (`build-claude.ts`, `build-cursor.ts`, `build-all.ts`) are unaffected
- [ ] SEC-04: `pluginManifestSchema.description` has `.max(500)` constraint
- [ ] SEC-04: `pluginManifestSchema.keywords` has `.max(20)` array limit and `.min(1).max(50)` per-item limits
- [ ] SEC-04: Boundary tests verify exact limits (500/501, 20/21, 50/51, empty string)
- [ ] `bun test` passes (full suite including new tests)
- [ ] `bunx --bun tsc --noEmit` passes (no type errors)
- [ ] `bun run build:all` completes successfully
- [ ] `bun test scripts/check-drift.test.ts` passes (zero drift)
