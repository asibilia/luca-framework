---
id: 50-A
title: "Bun Convention Alignment"
wave: A
phase: 50
mode: gap_closure
complexity: SIMPLE
tasks:
  - id: T1
    title: "Replace execa with Bun.$ in github-adapter.ts"
    file: packages/luca-framework/src/adapters/github-adapter.ts
    priority: HIGH
  - id: T2
    title: "Update npm/npx references to bun/bunx in version-check.ts"
    file: packages/luca-framework/src/utils/version-check.ts
    priority: MEDIUM
  - id: T3
    title: "Update npx references to bunx in init.ts"
    file: packages/luca-framework/src/commands/init.ts
    priority: MEDIUM
  - id: T4
    title: "Update npx references to bunx in update.ts"
    file: packages/luca-framework/src/commands/update.ts
    priority: MEDIUM
  - id: T5
    title: "Replace CJS require() with ESM imports in rules/index.ts"
    file: src/rules/index.ts
    priority: MEDIUM
  - id: T6
    title: "Update tests and remove execa dependency"
    priority: MEDIUM
  - id: T7
    title: "Final verification — build + test + typecheck"
    priority: HIGH
---

# Phase 50 — Bun Convention Alignment

## Objective

Replace all non-Bun patterns (execa, npm/npx references, CJS require) with their Bun-native equivalents per CLAUDE.md conventions. This phase closes 4 audit gaps identified in the v1.7.0 codebase health review.

## Context

CLAUDE.md mandates:

- `Bun.$` instead of `execa`
- `bun`/`bunx` instead of `npm`/`npx` in user-facing messages
- ESM `import` instead of CJS `require()`
- `Bun.file` over `node:fs` readFile/writeFile

These conventions exist but are violated in 4 specific locations. All changes are string-level or import-level replacements with no logic changes.

## Pitfalls (from WORKING.md)

- `Bun.$` uses tagged template literals, not `(command, args[])` like execa. Error handling differs: `Bun.$` throws `ShellError` with `.exitCode`, `.stderr`, `.stdout` properties, whereas execa throws with `.message`.
- The `github-adapter.ts` uses execa's `(command, args[])` signature in 4 call sites. Each must be converted to `Bun.$` tagged template syntax with proper argument interpolation.
- The `loadProfileConfig()` in `src/rules/index.ts` uses synchronous `require("fs").readFileSync` because the function is called at module top-level (not async). The replacement must also be synchronous — use `readFileSync` from `"node:fs"` via ESM import.
- Test mocks currently mock the `execa` module. After migration, tests must mock `Bun.$` or use a different test strategy.

---

## Task T1 — Replace execa with Bun.$ in github-adapter.ts

**File:** `packages/luca-framework/src/adapters/github-adapter.ts`
**Gap:** HIGH — Line 11 imports execa; lines 251, 318, 329, 370 call it.

### What to change

1. **Remove the execa import** (line 11):

   ```typescript
   // BEFORE
   import { execa } from "execa";

   // AFTER
   // (removed — using Bun.$ instead)
   ```

2. **Replace `execa("gh", [...args])` with `Bun.$`** in 4 locations:

   **getTicket (line 251-258):**

   ```typescript
   // BEFORE
   const { stdout } = await execa("gh", [
     "issue",
     "view",
     "--json",
     "number,title,body,state,labels,assignees,url",
     "--",
     issueNumber,
   ]);

   // AFTER
   const result =
     await Bun.$`gh issue view --json number,title,body,state,labels,assignees,url -- ${issueNumber}`.quiet();
   const stdout = result.text();
   ```

   **createBranch — gh issue develop (line 318-324):**

   ```typescript
   // BEFORE
   await execa("gh", ["issue", "develop", issueNumber, "--name", branchName]);

   // AFTER
   await Bun.$`gh issue develop ${issueNumber} --name ${branchName}`.quiet();
   ```

   **createBranch — git checkout fallback (line 329):**

   ```typescript
   // BEFORE
   await execa("git", ["checkout", "-b", "--", branchName]);

   // AFTER
   await Bun.$`git checkout -b -- ${branchName}`.quiet();
   ```

   **validate — gh auth status (line 370):**

   ```typescript
   // BEFORE
   const { stdout } = await execa("gh", ["auth", "status"]);

   // AFTER
   const result = await Bun.$`gh auth status`.quiet();
   const stdout = result.text();
   ```

3. **Update error handling in parseGhError** (line 113):
   - `Bun.$` throws a `ShellError` when the command exits non-zero. The error object has `.message`, `.stderr`, `.stdout`, and `.exitCode` properties.
   - The existing `parseGhError` function already uses `error instanceof Error ? error.message : String(error)`, which will work with `ShellError` since it extends `Error`.
   - However, for ENOENT/not-found detection, the `ShellError.message` includes stderr content, so the existing pattern-matching logic should still work. Verify in testing.

4. **Update JSDoc** on `parseGhError` (line 108-111):

   ```typescript
   // BEFORE
   * @param error - Error from execa

   // AFTER
   * @param error - Error from Bun.$ shell execution
   ```

### Verification

- [ ] No `execa` import remains in the file
- [ ] `grep -r "execa" packages/luca-framework/src/` returns no results
- [ ] `bun test __tests__/packages/luca-framework/src/adapters/github-adapter.test.ts` passes
- [ ] TypeScript compiles without errors

---

## Task T2 — Update npm/npx references to bun/bunx in version-check.ts

**File:** `packages/luca-framework/src/utils/version-check.ts`
**Gap:** MEDIUM — Line 54 user-facing message says `npm install -g` and `npx luca update`.

### What to change

**Line 54 — update notifier message:**

```typescript
// BEFORE
message: `New Luca CLI version available: {currentVersion} → {latestVersion}\nRun: npm install -g luca-framework@latest\n\nTo update project framework files, run: npx luca update`,

// AFTER
message: `New Luca CLI version available: {currentVersion} → {latestVersion}\nRun: bun install -g luca-framework@latest\n\nTo update project framework files, run: bunx luca update`,
```

### Verification

- [ ] `grep -n "npm\|npx" packages/luca-framework/src/utils/version-check.ts` returns no results
- [ ] `bun test __tests__/packages/luca-framework/src/utils/version-check.test.ts` passes

---

## Task T3 — Update npx references to bunx in init.ts

**File:** `packages/luca-framework/src/commands/init.ts`
**Gap:** MEDIUM — Lines 59, 64, 85, 122 contain `npx` in user-facing messages.

### What to change

**Line 59:**

```typescript
// BEFORE
logger.info("  npx luca update");
// AFTER
logger.info("  bunx luca update");
```

**Line 64:**

```typescript
// BEFORE
logger.info("  rm -rf .planning/ .cursor/luca/ && npx luca init");
// AFTER
logger.info("  rm -rf .planning/ .cursor/luca/ && bunx luca init");
```

**Line 85:**

```typescript
// BEFORE
logger.info("Example: npx luca init --config ./luca-config.json");
// AFTER
logger.info("Example: bunx luca init --config ./luca-config.json");
```

**Line 122:**

```typescript
// BEFORE
logger.info("  3. Run `npx luca init` again");
// AFTER
logger.info("  3. Run `bunx luca init` again");
```

### Verification

- [ ] `grep -n "npx\|npm" packages/luca-framework/src/commands/init.ts` returns no results
- [ ] `bun test __tests__/packages/luca-framework/src/commands/init.test.ts` passes

---

## Task T4 — Update npx references to bunx in update.ts

**File:** `packages/luca-framework/src/commands/update.ts`
**Gap:** MEDIUM — Lines 238, 364, 531, 533 contain `npx` in user-facing messages.

### What to change

**Line 238 (CONFLICTS.md template):**

```typescript
// BEFORE
4. Run \`npx luca update\` again after resolving all conflicts
// AFTER
4. Run \`bunx luca update\` again after resolving all conflicts
```

**Line 364:**

```typescript
// BEFORE
logger.info("Run `npx luca init` to initialize a new Luca project.");
// AFTER
logger.info("Run `bunx luca init` to initialize a new Luca project.");
```

**Line 531:**

```typescript
// BEFORE
logger.info("  1. Run `npx luca doctor` to check your installation");
// AFTER
logger.info("  1. Run `bunx luca doctor` to check your installation");
```

**Line 533:**

```typescript
// BEFORE
logger.info(
  "  2. Run `npx luca update --dry-run` to preview changes without applying them",
);
// AFTER
logger.info(
  "  2. Run `bunx luca update --dry-run` to preview changes without applying them",
);
```

### Verification

- [ ] `grep -n "npx\|npm" packages/luca-framework/src/commands/update.ts` returns no results
- [ ] `bun test __tests__/packages/luca-framework/src/commands/update.test.ts` passes

---

## Task T5 — Replace CJS require() with ESM imports in rules/index.ts

**File:** `src/rules/index.ts`
**Gap:** MEDIUM — Lines 81-82 use `require("fs")` and `require("path")` in an ESM module.

### What to change

1. **Add ESM imports at the top of the file** (after existing imports, before line 30):

   ```typescript
   // BEFORE (no fs/path imports at top)

   // AFTER
   import { readFileSync } from "node:fs";
   import { join } from "node:path";
   ```

2. **Replace CJS require calls in loadProfileConfig** (lines 80-84):

   ```typescript
   // BEFORE
   function loadProfileConfig(): {
     opinionated_guidelines: boolean;
     tech_stack_profiles: string[];
   } {
     try {
       const fs = require("fs");
       const path = require("path");
       const configPath = path.join(process.cwd(), ".planning", "config.json");
       const raw = fs.readFileSync(configPath, "utf-8");

   // AFTER
   function loadProfileConfig(): {
     opinionated_guidelines: boolean;
     tech_stack_profiles: string[];
   } {
     try {
       const configPath = join(process.cwd(), ".planning", "config.json");
       const raw = readFileSync(configPath, "utf-8");
   ```

### Design Note

This function is called synchronously at module evaluation time (line 131: `...loadProfileRules()`). It must remain synchronous. We use `readFileSync` from `"node:fs"` via ESM import instead of `Bun.file()` (which is async). This is the correct tradeoff per the constraint.

### Verification

- [ ] `grep -n "require(" src/rules/index.ts` returns no results
- [ ] `bun test __tests__/src/rules/rule-registry.test.ts` passes
- [ ] TypeScript compiles without errors

---

## Task T6 — Update tests and remove execa dependency

### Test updates

1. **`__tests__/utils/mock-execa.ts`** — This mock utility will no longer be needed for github-adapter tests. However, it may be used by other test files. Check usage:
   - If only used by github-adapter tests, mark for removal.
   - If used elsewhere, keep but note it as legacy.

2. **`__tests__/packages/luca-framework/src/adapters/github-adapter.test.ts`** — Must be updated to test `Bun.$` instead of `execa`:
   - Replace `mock.module('execa', ...)` with spying on or mocking `Bun.$`.
   - Alternative: Since `Bun.$` is a global, the test can use `mock.module` to intercept shell commands, or restructure the adapter to accept an executor function for testability.
   - Recommended approach: Extract a thin shell execution wrapper that can be mocked, or use `Bun.$`'s `.env()` and `.cwd()` capabilities for integration-style tests.
   - Simplest approach: Mock `Bun.$` via a module-level abstraction. Add a thin `runShell` helper to the adapter that wraps `Bun.$` and can be replaced in tests.

3. **Remove `execa` from `packages/luca-framework/package.json`** dependencies after confirming no other files import it:
   ```bash
   cd packages/luca-framework && bun remove execa
   ```

### Verification

- [ ] `grep -r "execa" __tests__/` — only legacy/unused references remain (or none)
- [ ] `grep -r "execa" packages/luca-framework/` — no references remain
- [ ] `bun test` — all tests pass

---

## Task T7 — Final verification

Run the complete verification harness:

```bash
# TypeScript compilation
bunx --bun tsc --noEmit

# Full test suite
bun test

# Verify no remaining violations
grep -rn "from ['\"]execa['\"]" packages/ src/
grep -rn "require(" src/rules/index.ts
grep -rn "npx " packages/luca-framework/src/
grep -rn "npm install" packages/luca-framework/src/
```

### Success Criteria

- [ ] Zero `execa` imports in source files under `packages/` and `src/`
- [ ] Zero `require()` calls in `src/rules/index.ts`
- [ ] Zero `npx` or `npm install` references in `packages/luca-framework/src/` user-facing messages
- [ ] `bunx --bun tsc --noEmit` exits 0
- [ ] `bun test` exits 0 with no failures
- [ ] `execa` removed from `packages/luca-framework/package.json` dependencies
