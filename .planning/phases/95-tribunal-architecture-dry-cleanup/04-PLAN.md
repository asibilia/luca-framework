---
id: 95-C
title: "Extract isDebateComplexity helper from 3 duplicated complexity checks"
phase: 95
wave: 2
complexity: SIMPLE
todo: 95-C
depends_on: [95-A]
---

# 95-C: Extract `isDebateComplexity()` Helper

## Objective

Extract the duplicated complexity gating check ("`COMPLEX` or `CRITICAL`") from 3 files into a single `isDebateComplexity(complexity: string): boolean` helper. Currently the exact same logic appears in:

1. `src/agents/__helpers/tribunal-detector.ts` line 222: `const qualifyingComplexities = ["COMPLEX", "CRITICAL"]; if (!qualifyingComplexities.includes(complexity.toUpperCase()))`
2. `src/agents/__helpers/root-cause-tribunal.ts` line 89: `const qualifyingComplexities = ["COMPLEX", "CRITICAL"]; if (!qualifyingComplexities.includes(complexity.toUpperCase()))`
3. `src/agents/__helpers/verification-tribunal.ts` line 121: `const qualifyingComplexities = ["COMPLEX", "CRITICAL"]; return qualifyingComplexities.includes(complexity.toUpperCase())`

The helper goes in `src/complexity/__helpers/` since it is a complexity-domain concern (T0 Foundation tier, importable by T2 agents). After 95-A, `tribunal-detector.ts` now lives in `src/shared/` (T0), which can also import from `src/complexity/` (T0-to-T0 is allowed).

**Depends on 95-A** because `tribunal-detector.ts` was moved to `src/shared/` in 95-A. The import path for the new helper depends on which domain houses the file.

## Context

@src/agents/**helpers/tribunal-detector.ts -- after 95-A this is a thin re-export; the actual logic is now in src/shared/**helpers/tribunal-detector.ts
@src/shared/**helpers/tribunal-detector.ts -- the actual shouldRunTribunal function (after 95-A move)
@src/agents/**helpers/root-cause-tribunal.ts -- shouldRunRootCauseTribunal with inline complexity check
@src/agents/**helpers/verification-tribunal.ts -- shouldRunVerificationTribunal with inline complexity check
@src/complexity/**schemas/complexity.schemas.ts -- existing COMPLEXITY_LEVELS, COMPLEXITY_ORDER exports
@src/complexity/index.ts -- barrel for complexity domain

## Tasks

### Task 1: Create isDebateComplexity helper

**Goal:** Create a focused helper function that encapsulates the "is this complexity COMPLEX or CRITICAL?" check.

**Files:** `src/complexity/__helpers/complexity-gate.ts` (new)

**Steps:**

1. Create `src/complexity/__helpers/complexity-gate.ts`:

   ````typescript
   /**
    * Complexity gating utilities for debate/tribunal activation.
    *
    * Provides a single source of truth for determining whether a complexity
    * level qualifies for debate-related features (tribunals, adversarial review).
    *
    * @module complexity/complexity-gate
    */

   /**
    * Complexity levels that qualify for debate/tribunal activation.
    *
    * COMPLEX and CRITICAL are the only levels where the additional token
    * cost of adversarial debate is justified.
    */
   const DEBATE_QUALIFYING_COMPLEXITIES = ["COMPLEX", "CRITICAL"] as const;

   /**
    * Determine whether a complexity level qualifies for debate/tribunal features.
    *
    * Returns true for COMPLEX and CRITICAL complexity levels only.
    * Case-insensitive: accepts "complex", "COMPLEX", "Complex", etc.
    *
    * @param complexity - The complexity level string to check
    * @returns true if the complexity qualifies for debate features
    *
    * @example
    * ```typescript
    * isDebateComplexity("COMPLEX");  // true
    * isDebateComplexity("CRITICAL"); // true
    * isDebateComplexity("MODERATE"); // false
    * isDebateComplexity("SIMPLE");   // false
    * isDebateComplexity("TRIVIAL");  // false
    * ```
    */
   export function isDebateComplexity(complexity: string): boolean {
     return DEBATE_QUALIFYING_COMPLEXITIES.includes(
       complexity.toUpperCase() as (typeof DEBATE_QUALIFYING_COMPLEXITIES)[number],
     );
   }
   ````

2. The file imports nothing from src/ (pure function, T0 compliant).
3. Run `bunx --bun tsc --noEmit`.

**Verification:**

- [ ] File exists at `src/complexity/__helpers/complexity-gate.ts`
- [ ] No imports from src/ (T0 compliant)
- [ ] Function is case-insensitive
- [ ] JSDoc with examples present
- [ ] `bunx --bun tsc --noEmit` passes

### Task 2: Export from complexity barrel

**Goal:** Export the new helper from `src/complexity/index.ts`.

**Files:** `src/complexity/index.ts`

**Steps:**

1. Add export: `export { isDebateComplexity } from "./__helpers/complexity-gate";`
2. Run `bunx --bun tsc --noEmit`.

**Verification:**

- [ ] Barrel remains pure re-exports
- [ ] `isDebateComplexity` accessible via `~/complexity`
- [ ] `bunx --bun tsc --noEmit` passes

### Task 3: Update shouldRunTribunal in shared/tribunal-detector.ts

**Goal:** Replace inline complexity check with `isDebateComplexity()` call.

**Files:** `src/shared/__helpers/tribunal-detector.ts` (the canonical copy after 95-A)

**Steps:**

1. Add import: `import { isDebateComplexity } from "~/complexity/__helpers/complexity-gate";`
   - This is a T0-to-T0 import (shared importing from complexity), which is allowed.

2. In `shouldRunTribunal()`, replace:

   ```typescript
   const qualifyingComplexities = ["COMPLEX", "CRITICAL"];
   if (!qualifyingComplexities.includes(complexity.toUpperCase())) {
     return false;
   }
   ```

   With:

   ```typescript
   if (!isDebateComplexity(complexity)) {
     return false;
   }
   ```

3. Run `bunx --bun tsc --noEmit`.
4. Run `bun test __tests__/src/agents/tribunal-detector.test.ts`.

**Verification:**

- [ ] Inline complexity check replaced with `isDebateComplexity()` call
- [ ] Import from `~/complexity/__helpers/complexity-gate` added
- [ ] `bunx --bun tsc --noEmit` passes
- [ ] `bun test __tests__/src/agents/tribunal-detector.test.ts` passes

### Task 4: Update shouldRunVerificationTribunal

**Goal:** Replace inline complexity check with `isDebateComplexity()` call.

**Files:** `src/agents/__helpers/verification-tribunal.ts`

**Steps:**

1. Add import: `import { isDebateComplexity } from "~/complexity/__helpers/complexity-gate";`
   - T2 (agents) importing from T0 (complexity) is allowed.

2. In `shouldRunVerificationTribunal()`, replace:

   ```typescript
   const qualifyingComplexities = ["COMPLEX", "CRITICAL"];
   return qualifyingComplexities.includes(complexity.toUpperCase());
   ```

   With:

   ```typescript
   return isDebateComplexity(complexity);
   ```

3. Run `bunx --bun tsc --noEmit`.
4. Run `bun test __tests__/src/agents/verification-tribunal.test.ts`.

**Verification:**

- [ ] Inline complexity check replaced
- [ ] `bunx --bun tsc --noEmit` passes
- [ ] `bun test __tests__/src/agents/verification-tribunal.test.ts` passes

### Task 5: Update shouldRunRootCauseTribunal

**Goal:** Replace inline complexity check with `isDebateComplexity()` call.

**Files:** `src/agents/__helpers/root-cause-tribunal.ts`

**Steps:**

1. Add import: `import { isDebateComplexity } from "~/complexity/__helpers/complexity-gate";`
   - T2 (agents) importing from T0 (complexity) is allowed.

2. In `shouldRunRootCauseTribunal()`, replace:

   ```typescript
   const qualifyingComplexities = ["COMPLEX", "CRITICAL"];
   if (!qualifyingComplexities.includes(complexity.toUpperCase())) {
     return false;
   }
   ```

   With:

   ```typescript
   if (!isDebateComplexity(complexity)) {
     return false;
   }
   ```

3. Run `bunx --bun tsc --noEmit`.
4. Run `bun test __tests__/src/agents/root-cause-tribunal.test.ts`.

**Verification:**

- [ ] Inline complexity check replaced
- [ ] `bunx --bun tsc --noEmit` passes
- [ ] `bun test __tests__/src/agents/root-cause-tribunal.test.ts` passes

### Task 6: Write tests for isDebateComplexity

**Goal:** Dedicated unit tests for the new helper.

**Files:** `__tests__/src/complexity/complexity-gate.test.ts` (new)

**Steps:**

1. Create test file:

   ```typescript
   import { describe, test, expect } from "bun:test";
   import { isDebateComplexity } from "../../../src/complexity/__helpers/complexity-gate";

   describe("isDebateComplexity", () => {
     test("returns true for COMPLEX", () => {
       expect(isDebateComplexity("COMPLEX")).toBe(true);
     });

     test("returns true for CRITICAL", () => {
       expect(isDebateComplexity("CRITICAL")).toBe(true);
     });

     test("returns false for MODERATE", () => {
       expect(isDebateComplexity("MODERATE")).toBe(false);
     });

     test("returns false for SIMPLE", () => {
       expect(isDebateComplexity("SIMPLE")).toBe(false);
     });

     test("returns false for TRIVIAL", () => {
       expect(isDebateComplexity("TRIVIAL")).toBe(false);
     });

     test("is case-insensitive", () => {
       expect(isDebateComplexity("complex")).toBe(true);
       expect(isDebateComplexity("Critical")).toBe(true);
       expect(isDebateComplexity("moderate")).toBe(false);
     });

     test("returns false for empty string", () => {
       expect(isDebateComplexity("")).toBe(false);
     });

     test("returns false for unknown values", () => {
       expect(isDebateComplexity("UNKNOWN")).toBe(false);
     });
   });
   ```

2. Run `bun test __tests__/src/complexity/complexity-gate.test.ts`.

**Verification:**

- [ ] All test cases pass
- [ ] Covers all 5 complexity levels plus edge cases
- [ ] `bun test __tests__/src/complexity/complexity-gate.test.ts` passes

### Task 7: Final validation

**Goal:** Full verification pass.

**Steps:**

1. Run `bunx --bun tsc --noEmit`.
2. Run `bun test __tests__/src/agents/tribunal-detector.test.ts __tests__/src/agents/verification-tribunal.test.ts __tests__/src/agents/root-cause-tribunal.test.ts __tests__/src/complexity/complexity-gate.test.ts`.
3. Run `bun test` (full suite).
4. Verify no inline `qualifyingComplexities` arrays remain in any tribunal file.

**Verification:**

- [ ] `bunx --bun tsc --noEmit` passes
- [ ] All tribunal and complexity-gate tests pass
- [ ] Full test suite passes
- [ ] Zero inline `["COMPLEX", "CRITICAL"]` arrays in tribunal code

## Success Criteria

- [ ] `isDebateComplexity()` helper exists in `src/complexity/__helpers/complexity-gate.ts`
- [ ] All 3 inline complexity checks replaced with `isDebateComplexity()` calls
- [ ] New helper exported from `src/complexity/index.ts`
- [ ] Dedicated tests cover all complexity levels and edge cases
- [ ] All existing tribunal tests pass unchanged
- [ ] `bunx --bun tsc --noEmit` passes
- [ ] `bun test` passes
