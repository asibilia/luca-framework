---
id: 51-B
title: "Apply sanitizeJsonParse and deduplicate VALID_TRACKERS"
wave: B
phase: 51
mode: gap_closure
complexity: MODERATE
tasks:
  - id: T1
    title: "Apply sanitizeJsonParse in persistence.ts (luca-state)"
    file: packages/luca-state/src/persistence.ts
    priority: HIGH
  - id: T2
    title: "Apply sanitizeJsonParse in src/rules/index.ts"
    file: src/rules/index.ts
    priority: HIGH
  - id: T3
    title: "Apply sanitizeJsonParse in files.ts"
    file: packages/luca-framework/src/utils/files.ts
    priority: HIGH
  - id: T4
    title: "Deduplicate VALID_TRACKERS in config-validation.ts"
    file: packages/luca-framework/src/utils/doctor/checks/config-validation.ts
    priority: MEDIUM
  - id: T5
    title: "Final verification — build + test + typecheck"
    priority: HIGH
---

# Phase 51-B — Apply sanitizeJsonParse & Deduplicate VALID_TRACKERS

## Objective

Apply the existing `sanitizeJsonParse()` utility consistently across all `JSON.parse` calls that handle external/on-disk data, and deduplicate the `VALID_TRACKERS` constant. This closes:

- **MEDIUM #3** (Security Auditor): `JSON.parse` without prototype pollution protection in `persistence.ts`, `rules/index.ts`, and `files.ts`
- **MEDIUM #1** (Code Simplifier): `VALID_TRACKERS` constant duplicated between `wizard.ts` and `config-validation.ts`

## Context

### sanitizeJsonParse

The project has an established security pattern: all `JSON.parse` calls on external data (files on disk, user input) should use `sanitizeJsonParse()` instead, which strips `__proto__`, `constructor`, and `prototype` keys to prevent prototype pollution attacks.

Two copies of `sanitizeJsonParse` exist by design (per MEMORY: isolated domain boundary):

- `packages/luca-framework/src/utils/sanitize.ts` -- for use within `packages/luca-framework/`
- `src/shared/validation-utils.ts` -- for use within `src/`

**IMPORTANT:** `packages/luca-state/` is a separate package that cannot import from either of the above locations. Per MEMORY (self-contained cross-package modules pattern from Phase 6), it needs its own minimal copy of the sanitize utility.

### VALID_TRACKERS

`VALID_TRACKERS` is defined as `["jira", "github", "none"] as const` in `packages/luca-framework/src/utils/wizard.ts` (line 180). The same values are duplicated as a local array `const validTrackers = ["jira", "github", "none"]` in `packages/luca-framework/src/utils/doctor/checks/config-validation.ts` (line 78). Since both files are within the same package (`packages/luca-framework/`), the doctor check can simply import from `wizard.ts`.

### Security risk assessment

The three `JSON.parse` call sites parse files from the local `.planning/` and `.claude/` directories. While these are typically written by the framework itself, they can be modified by users or malicious actors. Applying `sanitizeJsonParse` provides defense-in-depth at negligible performance cost.

## Pitfalls

- **RISK:** `packages/luca-state/` cannot import from `packages/luca-framework/` or `src/`. It needs its own copy of `sanitizeJsonParse`. Keep it minimal (just the function + `stripPrototypeKeys` helper) to minimize duplication surface.
- **CAUTION:** `src/rules/index.ts` uses `readFileSync` (synchronous) at module evaluation time. The `sanitizeJsonParse` replacement is also synchronous (it wraps `JSON.parse`), so this is safe.
- **CAUTION:** In `persistence.ts`, the `loadPersistedActor` function parses the result as `Snapshot<unknown>`. After sanitization, the cast `as Snapshot<unknown>` still works because `sanitizeJsonParse` returns `unknown`.
- **NOTE:** `persistence.ts` line 153 uses `await configFile.json()` (Bun's built-in JSON method), NOT `JSON.parse`. This call was not flagged in the audit and does not need to change -- Bun's `.json()` method does not support custom reviver/sanitization, and this is reading a known-good config file. Only line 104 (`JSON.parse(text)`) was flagged.
- **NOTE:** The `files.ts` file has two `JSON.parse` calls: line 259 (reading existing settings.json) and line 267 (reading hook settings template). Both should be sanitized for consistency, even though the template file is framework-controlled.

---

## Task T1 — Apply sanitizeJsonParse in persistence.ts (luca-state)

**File:** `packages/luca-state/src/persistence.ts`
**Gap:** MEDIUM (Security Auditor) — Line 104: `JSON.parse(text)` without prototype pollution protection on `state.json`

### Step 1: Create sanitize utility in luca-state package

**File:** `packages/luca-state/src/sanitize.ts` (new)

Per the isolated-domains pattern, create a self-contained copy:

```typescript
/**
 * JSON parsing with prototype pollution protection for luca-state.
 *
 * NOTE: This function is intentionally duplicated from
 * packages/luca-framework/src/utils/sanitize.ts.
 * The two packages are isolated by design and cannot cross-import.
 * If you modify this function, update the other copies as well.
 *
 * Copies exist in:
 * - packages/luca-framework/src/utils/sanitize.ts
 * - packages/luca-state/src/sanitize.ts (this file)
 * - src/shared/validation-utils.ts
 *
 * @module luca-state/sanitize
 */

/** Keys that can be exploited for prototype pollution attacks */
const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Recursively strip prototype pollution keys from a parsed JSON value.
 *
 * @param obj - The value to sanitize
 * @returns A new value with dangerous keys removed
 */
function stripPrototypeKeys(obj: unknown): unknown {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(stripPrototypeKeys);
  }

  const cleaned: Record<string, unknown> = {};
  for (const key of Object.keys(obj as Record<string, unknown>)) {
    if (!DANGEROUS_KEYS.has(key)) {
      cleaned[key] = stripPrototypeKeys((obj as Record<string, unknown>)[key]);
    }
  }
  return cleaned;
}

/**
 * Parse JSON and strip prototype pollution keys.
 *
 * @param json - The JSON string to parse
 * @returns Parsed and sanitized value
 * @throws {SyntaxError} If the input is not valid JSON
 */
export function sanitizeJsonParse(json: string): unknown {
  const parsed = JSON.parse(json);
  return stripPrototypeKeys(parsed);
}
```

### Step 2: Update persistence.ts

```typescript
// BEFORE (line 104)
snapshot = JSON.parse(text) as Snapshot<unknown>;

// AFTER
import { sanitizeJsonParse } from "./sanitize";
// ...
snapshot = sanitizeJsonParse(text) as Snapshot<unknown>;
```

Full change in `loadPersistedActor`:

```typescript
// BEFORE (lines 102-110)
let snapshot: Snapshot<unknown>;
try {
  snapshot = JSON.parse(text) as Snapshot<unknown>;
} catch {
  return {
    success: false,
    error: `State file contains invalid JSON: ${filePath}`,
  };
}

// AFTER
let snapshot: Snapshot<unknown>;
try {
  snapshot = sanitizeJsonParse(text) as Snapshot<unknown>;
} catch {
  return {
    success: false,
    error: `State file contains invalid JSON: ${filePath}`,
  };
}
```

### Verification

- [ ] `packages/luca-state/src/sanitize.ts` created with correct implementation
- [ ] `grep "JSON.parse" packages/luca-state/src/persistence.ts` returns only the `persistActor` serialization call (`JSON.stringify`), not any `JSON.parse`
- [ ] `bun test __tests__/packages/luca-state/` passes
- [ ] TypeScript compiles without errors

---

## Task T2 — Apply sanitizeJsonParse in src/rules/index.ts

**File:** `src/rules/index.ts`
**Gap:** MEDIUM (Security Auditor) — Line 86: `JSON.parse(raw)` without sanitization on `config.json`

### What to change

Import `sanitizeJsonParse` from `src/shared/validation-utils.ts` (same domain: `src/`):

```typescript
// BEFORE (top of file, add after existing imports)
import { readFileSync } from "node:fs";
import { join } from "node:path";

// AFTER (add the sanitize import)
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sanitizeJsonParse } from "../shared/validation-utils";
```

Update `loadProfileConfig`:

```typescript
// BEFORE (line 86)
const config = JSON.parse(raw);

// AFTER
const config = sanitizeJsonParse(raw) as Record<string, any>;
```

### Design Note

`sanitizeJsonParse` is synchronous (it wraps `JSON.parse`), so it works in this synchronous context. The `as Record<string, any>` cast is needed because `sanitizeJsonParse` returns `unknown`.

### Verification

- [ ] `grep "JSON.parse" src/rules/index.ts` returns no results
- [ ] `bun test __tests__/src/rules/` passes
- [ ] `bun run build:all` succeeds (rules index is imported by build pipeline)
- [ ] TypeScript compiles without errors

---

## Task T3 — Apply sanitizeJsonParse in files.ts

**File:** `packages/luca-framework/src/utils/files.ts`
**Gap:** MEDIUM (Security Auditor) — Lines 259, 267: `JSON.parse` without validation on settings.json and hook settings template

### What to change

Add import for `sanitizeJsonParse` (within `packages/luca-framework/`, use the local sanitize module):

```typescript
// BEFORE (top of file, imports section)
import { rm, mkdir, readdir, copyFile, chmod } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "pathe";
import * as p from "@clack/prompts";
import { copyTemplates, getTemplatesDir } from "./template";
import { createManifest, writeManifest } from "./manifest";
import { logger } from "./logger";
import type { LucaConfig, LucaManifest } from "../types";

// AFTER (add sanitize import)
import { rm, mkdir, readdir, copyFile, chmod } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "pathe";
import * as p from "@clack/prompts";
import { copyTemplates, getTemplatesDir } from "./template";
import { createManifest, writeManifest } from "./manifest";
import { sanitizeJsonParse } from "./sanitize";
import { logger } from "./logger";
import type { LucaConfig, LucaManifest } from "../types";
```

Update both `JSON.parse` calls:

```typescript
// BEFORE (line 259) — parsing existing settings.json
existingSettings = JSON.parse(existing);

// AFTER
existingSettings = sanitizeJsonParse(existing) as Record<string, unknown>;
```

```typescript
// BEFORE (line 267) — parsing hook settings template
const hooksSettings = JSON.parse(hooksContent);

// AFTER
const hooksSettings = sanitizeJsonParse(hooksContent) as Record<
  string,
  unknown
>;
```

### Verification

- [ ] `grep "JSON.parse" packages/luca-framework/src/utils/files.ts` returns no results
- [ ] `bun test __tests__/packages/luca-framework/` passes
- [ ] TypeScript compiles without errors

---

## Task T4 — Deduplicate VALID_TRACKERS in config-validation.ts

**File:** `packages/luca-framework/src/utils/doctor/checks/config-validation.ts`
**Gap:** MEDIUM (Code Simplifier) — `VALID_TRACKERS` duplicated between `wizard.ts:180` and `config-validation.ts:78`

### Current state

In `wizard.ts` (line 180):

```typescript
export const VALID_TRACKERS = ["jira", "github", "none"] as const;
```

In `config-validation.ts` (line 78):

```typescript
const validTrackers = ["jira", "github", "none"];
```

Both are in `packages/luca-framework/`, so a direct import is safe.

### What to change

1. **Add import in config-validation.ts:**

   ```typescript
   // BEFORE (top of file)
   import { join } from "pathe";
   import { sanitizeJsonParse } from "../../sanitize";
   import { validateBranding } from "../../branding";
   import type { CheckResult, DoctorCheck } from "../types";

   // AFTER
   import { join } from "pathe";
   import { sanitizeJsonParse } from "../../sanitize";
   import { validateBranding } from "../../branding";
   import { VALID_TRACKERS } from "../../wizard";
   import type { CheckResult, DoctorCheck } from "../types";
   ```

2. **Replace the local `validTrackers` array:**

   ```typescript
   // BEFORE (line 78)
   const validTrackers = ["jira", "github", "none"];

   // AFTER (removed — using imported VALID_TRACKERS)
   ```

3. **Update the usage (lines 80-81):**

   ```typescript
   // BEFORE
         if (
           config.workTracker &&
           !validTrackers.includes(config.workTracker as string)
         ) {

   // AFTER
         if (
           config.workTracker &&
           !VALID_TRACKERS.includes(config.workTracker as (typeof VALID_TRACKERS)[number])
         ) {
   ```

4. **Update the error message (line 88):**

   ```typescript
   // BEFORE
             details: `workTracker must be one of: ${validTrackers.join(", ")}. Got: "${config.workTracker}"`,

   // AFTER
             details: `workTracker must be one of: ${VALID_TRACKERS.join(", ")}. Got: "${config.workTracker}"`,
   ```

### Design Note

The `VALID_TRACKERS` constant is typed as `readonly ["jira", "github", "none"]` (via `as const`). The `.includes()` call needs the type assertion `as (typeof VALID_TRACKERS)[number]` to satisfy TypeScript's strict narrowing, matching the pattern already used in `wizard.ts` (lines 213-216).

### Verification

- [ ] `grep -n "validTrackers" packages/luca-framework/src/utils/doctor/checks/config-validation.ts` returns no results (local variable removed)
- [ ] `grep -rn "VALID_TRACKERS" packages/luca-framework/src/` shows exactly 2 files: `wizard.ts` (definition) and `config-validation.ts` (import)
- [ ] `bun test __tests__/packages/luca-framework/` passes
- [ ] TypeScript compiles without errors

---

## Task T5 — Final verification

Run the complete verification harness:

```bash
# TypeScript compilation
bunx --bun tsc --noEmit

# Full test suite
bun test

# Verify no raw JSON.parse on external data in target files
grep -n "JSON.parse" packages/luca-state/src/persistence.ts
# Expected: 0 results (only JSON.stringify should remain)

grep -n "JSON.parse" src/rules/index.ts
# Expected: 0 results

grep -n "JSON.parse" packages/luca-framework/src/utils/files.ts
# Expected: 0 results

# Verify VALID_TRACKERS is not duplicated
grep -rn "validTrackers\b" packages/luca-framework/src/utils/doctor/checks/
# Expected: 0 results (local variable removed)

# Build pipeline still works
bun run build:all
```

### Success Criteria

- [ ] `bunx --bun tsc --noEmit` exits 0
- [ ] `bun test` exits 0 with no failures
- [ ] `bun run build:all` succeeds
- [ ] Zero `JSON.parse` on external data in `persistence.ts`, `rules/index.ts`, `files.ts`
- [ ] `VALID_TRACKERS` defined once in `wizard.ts`, imported in `config-validation.ts`
- [ ] New `packages/luca-state/src/sanitize.ts` created with documentation noting the intentional duplication
- [ ] All sanitizeJsonParse NOTE comments updated to list 3 copy locations
