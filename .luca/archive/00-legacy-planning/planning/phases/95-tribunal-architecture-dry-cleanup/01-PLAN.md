---
id: 95-A
title: "Extract shared tribunal infrastructure to src/shared/ (T0)"
phase: 95
wave: 1
complexity: COMPLEX
todo: 95-A
---

# 95-A: Extract Shared Tribunal Infrastructure to `src/shared/` (T0)

## Objective

Resolve the CRITICAL entity isolation violation where `src/skills/__helpers/milestone-debate.ts` and `src/skills/__schemas/milestone-debate.schemas.ts` import directly from `src/agents/__helpers/` and `src/agents/__schemas/`. This violates Rule 2 (Entity Isolation): T2 entity domains (agents, skills, rules) must NEVER cross-import.

The fix is to extract the shared tribunal schemas and helpers out of `src/agents/` (T2) into `src/shared/` (T0), where both agents and skills can legitimately import from. After extraction, `src/agents/` re-exports from `src/shared/` to preserve its public API, and `src/skills/` imports from `src/shared/` directly.

This is the foundational change for Phase 95 -- plans 95-B and 95-C depend on the new shared location.

## Context

@src/agents/**schemas/tribunal.schemas.ts -- tribunal schemas to move (reviewFindingSchema, disagreementSchema, rebuttalSchema, unifiedRecommendationSchema, tribunalResultSchema, plus const arrays and types)
@src/agents/**helpers/tribunal-detector.ts -- tribunal helpers to move (normalizeFindings, detectDisagreements, shouldRunTribunal)
@src/agents/**helpers/tribunal-rebuttals.ts -- tribunal helpers to move (buildRebuttalPrompts, resolveRebuttals, buildTribunalResult, RebuttalPromptPair interface)
@src/skills/**helpers/milestone-debate.ts -- skills file that currently violates entity isolation by importing from agents
@src/skills/**schemas/milestone-debate.schemas.ts -- skills schema that currently violates entity isolation by importing tribunalResultSchema from agents
@src/agents/index.ts -- barrel that must continue exporting tribunal APIs (re-export from new shared location)
@src/skills/index.ts -- barrel, no change needed (already exports milestone-debate via its own helpers/schemas)
@src/shared/index.ts -- barrel that must gain new tribunal exports
@**tests**/src/agents/tribunal-detector.test.ts -- test importing from agents path (must update)
@**tests**/src/agents/tribunal-rebuttals.test.ts -- test importing from agents path (must update)
@**tests\_\_/src/skills/milestone-debate.test.ts -- test importing from agents path (must update)
@.claude/rules/module-boundary.md -- documented exceptions table (updated in 95-E)

## Tasks

### Task 1: Create tribunal schemas in src/shared/\_\_schemas/

**Goal:** Move the tribunal schemas from `src/agents/__schemas/tribunal.schemas.ts` to `src/shared/__schemas/tribunal.schemas.ts`.

**Files:** `src/shared/__schemas/tribunal.schemas.ts` (new)

**Steps:**

1. Create `src/shared/__schemas/tribunal.schemas.ts` as a copy of `src/agents/__schemas/tribunal.schemas.ts`.
2. The file has NO imports from other src/ domains (only `zod`), so it is valid at T0 (shared imports nothing from src/).
3. Verify all schemas are present: `reviewFindingSchema`, `CONFLICT_TYPES`, `conflictTypeSchema`, `disagreementSchema`, `REBUTTAL_RESOLUTIONS`, `rebuttalResolutionSchema`, `rebuttalSchema`, `unifiedRecommendationSchema`, `tribunalResultSchema`.
4. Verify all type exports are present: `ReviewFinding`, `ConflictType`, `Disagreement`, `RebuttalResolution`, `Rebuttal`, `UnifiedRecommendation`, `TribunalResult`.
5. Run `bunx --bun tsc --noEmit` to confirm no type errors.

**Verification:**

- [ ] File exists at `src/shared/__schemas/tribunal.schemas.ts`
- [ ] File imports only from `zod` (no src/ imports)
- [ ] All 9 schema/const exports present
- [ ] All 7 type exports present
- [ ] `bunx --bun tsc --noEmit` passes

### Task 2: Create tribunal-detector helpers in src/shared/\_\_helpers/

**Goal:** Move the tribunal detector helpers from `src/agents/__helpers/tribunal-detector.ts` to `src/shared/__helpers/tribunal-detector.ts`.

**Files:** `src/shared/__helpers/tribunal-detector.ts` (new)

**Steps:**

1. Create `src/shared/__helpers/tribunal-detector.ts` as a copy of `src/agents/__helpers/tribunal-detector.ts`.
2. Update the import paths from `"../__schemas/tribunal.schemas"` to `"../__schemas/tribunal.schemas"` (same relative path since we are in `shared/__helpers/` importing from `shared/__schemas/`). The relative path structure is the same, so this import remains identical.
3. The only import from outside the file is `crypto` (Node built-in) and the tribunal schemas (now co-located in shared). Verify no imports from other src/ domains.
4. Verify all exported functions: `normalizeFindings`, `detectDisagreements`, `shouldRunTribunal`.
5. Run `bunx --bun tsc --noEmit`.

**Verification:**

- [ ] File exists at `src/shared/__helpers/tribunal-detector.ts`
- [ ] Imports from `../__schemas/tribunal.schemas` (shared-internal)
- [ ] Imports `crypto` (Node built-in only)
- [ ] No imports from any other src/ domain
- [ ] All 3 exported functions present with full JSDoc
- [ ] `bunx --bun tsc --noEmit` passes

### Task 3: Create tribunal-rebuttals helpers in src/shared/\_\_helpers/

**Goal:** Move the tribunal rebuttal helpers from `src/agents/__helpers/tribunal-rebuttals.ts` to `src/shared/__helpers/tribunal-rebuttals.ts`.

**Files:** `src/shared/__helpers/tribunal-rebuttals.ts` (new)

**Steps:**

1. Create `src/shared/__helpers/tribunal-rebuttals.ts` as a copy of `src/agents/__helpers/tribunal-rebuttals.ts`.
2. Update import paths from `"../__schemas/tribunal.schemas"` to `"../__schemas/tribunal.schemas"` (same relative structure).
3. Verify all exported functions: `buildRebuttalPrompts`, `resolveRebuttals`, `buildTribunalResult`.
4. Verify the `RebuttalPromptPair` interface is exported.
5. No imports from other src/ domains.
6. Run `bunx --bun tsc --noEmit`.

**Verification:**

- [ ] File exists at `src/shared/__helpers/tribunal-rebuttals.ts`
- [ ] Imports only from `../__schemas/tribunal.schemas` (shared-internal)
- [ ] All 3 exported functions present with full JSDoc
- [ ] `RebuttalPromptPair` interface exported
- [ ] No imports from any other src/ domain
- [ ] `bunx --bun tsc --noEmit` passes

### Task 4: Update src/shared/index.ts barrel

**Goal:** Export all tribunal schemas, types, and helpers from the shared barrel.

**Files:** `src/shared/index.ts`

**Steps:**

1. Add tribunal schema exports section after the existing Validation section:

   ```typescript
   // --- Tribunal Schemas ---------------------------------------------------------

   export {
     reviewFindingSchema,
     CONFLICT_TYPES,
     conflictTypeSchema,
     disagreementSchema,
     REBUTTAL_RESOLUTIONS,
     rebuttalResolutionSchema,
     rebuttalSchema,
     unifiedRecommendationSchema,
     tribunalResultSchema,
   } from "./__schemas/tribunal.schemas";

   export type {
     ReviewFinding,
     ConflictType,
     Disagreement,
     RebuttalResolution,
     Rebuttal,
     UnifiedRecommendation,
     TribunalResult,
   } from "./__schemas/tribunal.schemas";
   ```

2. Add tribunal detector exports:

   ```typescript
   // --- Tribunal Detection -------------------------------------------------------

   export {
     normalizeFindings,
     detectDisagreements,
     shouldRunTribunal,
   } from "./__helpers/tribunal-detector";
   ```

3. Add tribunal rebuttals exports:

   ```typescript
   // --- Tribunal Rebuttals -------------------------------------------------------

   export {
     buildRebuttalPrompts,
     resolveRebuttals,
     buildTribunalResult,
   } from "./__helpers/tribunal-rebuttals";

   export type { RebuttalPromptPair } from "./__helpers/tribunal-rebuttals";
   ```

4. Verify barrel contains only re-export statements (barrel invariant).
5. Run `bunx --bun tsc --noEmit`.

**Verification:**

- [ ] Barrel contains only `export { ... } from` and `export type { ... } from`
- [ ] All tribunal schemas, types, and helpers accessible via `~/shared`
- [ ] `bunx --bun tsc --noEmit` passes

### Task 5: Convert src/agents/ tribunal files to re-export from shared

**Goal:** Replace the original tribunal files in `src/agents/` with thin re-export wrappers that import from `~/shared`, preserving the agents public API.

**Files:** `src/agents/__schemas/tribunal.schemas.ts`, `src/agents/__helpers/tribunal-detector.ts`, `src/agents/__helpers/tribunal-rebuttals.ts`

**Steps:**

1. Replace `src/agents/__schemas/tribunal.schemas.ts` contents with re-exports from shared:

   ```typescript
   /**
    * Tribunal schemas — re-exported from shared.
    *
    * The canonical source of tribunal schemas is ~/shared/__schemas/tribunal.schemas.
    * This file preserves backward compatibility for consumers importing from ~/agents.
    */
   export {
     reviewFindingSchema,
     CONFLICT_TYPES,
     conflictTypeSchema,
     disagreementSchema,
     REBUTTAL_RESOLUTIONS,
     rebuttalResolutionSchema,
     rebuttalSchema,
     unifiedRecommendationSchema,
     tribunalResultSchema,
   } from "~/shared/__schemas/tribunal.schemas";

   export type {
     ReviewFinding,
     ConflictType,
     Disagreement,
     RebuttalResolution,
     Rebuttal,
     UnifiedRecommendation,
     TribunalResult,
   } from "~/shared/__schemas/tribunal.schemas";
   ```

2. Replace `src/agents/__helpers/tribunal-detector.ts` contents with re-exports from shared:

   ```typescript
   /**
    * Tribunal detector — re-exported from shared.
    *
    * Canonical source: ~/shared/__helpers/tribunal-detector.
    */
   export {
     normalizeFindings,
     detectDisagreements,
     shouldRunTribunal,
   } from "~/shared/__helpers/tribunal-detector";
   ```

3. Replace `src/agents/__helpers/tribunal-rebuttals.ts` contents with re-exports from shared:

   ```typescript
   /**
    * Tribunal rebuttals — re-exported from shared.
    *
    * Canonical source: ~/shared/__helpers/tribunal-rebuttals.
    */
   export {
     buildRebuttalPrompts,
     resolveRebuttals,
     buildTribunalResult,
   } from "~/shared/__helpers/tribunal-rebuttals";

   export type { RebuttalPromptPair } from "~/shared/__helpers/tribunal-rebuttals";
   ```

4. The `src/agents/index.ts` barrel does NOT need changes -- it already re-exports from these files, and they now delegate to shared.
5. Run `bunx --bun tsc --noEmit`.
6. Run `bun test __tests__/src/agents/tribunal-detector.test.ts __tests__/src/agents/tribunal-rebuttals.test.ts` to confirm existing tests pass through the re-export layer.

**Verification:**

- [ ] Each agents file is now a pure re-export wrapper (no logic)
- [ ] `src/agents/index.ts` unchanged (still re-exports from its local files)
- [ ] `bunx --bun tsc --noEmit` passes
- [ ] `bun test __tests__/src/agents/tribunal-detector.test.ts` passes
- [ ] `bun test __tests__/src/agents/tribunal-rebuttals.test.ts` passes

### Task 6: Update src/skills/ imports to use shared

**Goal:** Fix the entity isolation violation by updating skills imports to use `~/shared` instead of `~/agents`.

**Files:** `src/skills/__helpers/milestone-debate.ts`, `src/skills/__schemas/milestone-debate.schemas.ts`

**Steps:**

1. In `src/skills/__helpers/milestone-debate.ts`, update imports:
   - Change `from "~/agents/__helpers/tribunal-detector"` to `from "~/shared/__helpers/tribunal-detector"`
   - Change `from "~/agents/__helpers/tribunal-rebuttals"` to `from "~/shared/__helpers/tribunal-rebuttals"`
   - Change `from "~/agents/__schemas/tribunal.schemas"` to `from "~/shared/__schemas/tribunal.schemas"`
   - Update the module JSDoc to remove the reference to "tribunal infrastructure from ~/agents"

2. In `src/skills/__schemas/milestone-debate.schemas.ts`, update imports:
   - Change `from "~/agents/__schemas/tribunal.schemas"` to `from "~/shared/__schemas/tribunal.schemas"`
   - Update the module JSDoc to reference `~/shared` instead of `~/agents`

3. Run `bunx --bun tsc --noEmit`.
4. Run `bun test __tests__/src/skills/milestone-debate.test.ts`.

**Verification:**

- [ ] No imports from `~/agents/` in any `src/skills/` file
- [ ] All imports now reference `~/shared/` paths
- [ ] Module JSDoc updated to reflect new import source
- [ ] `bunx --bun tsc --noEmit` passes
- [ ] `bun test __tests__/src/skills/milestone-debate.test.ts` passes

### Task 7: Update test imports

**Goal:** Update test files that import tribunal helpers/schemas to use the new shared paths (or verify they still work through agents re-exports).

**Files:** `__tests__/src/agents/tribunal-detector.test.ts`, `__tests__/src/agents/tribunal-rebuttals.test.ts`, `__tests__/src/skills/milestone-debate.test.ts`

**Steps:**

1. For `__tests__/src/agents/tribunal-detector.test.ts`:
   - The test imports from `../../../src/agents/__helpers/tribunal-detector` and `../../../src/agents/__schemas/tribunal.schemas`
   - These paths still work because agents files now re-export from shared
   - **No changes needed** -- verify the test passes as-is

2. For `__tests__/src/agents/tribunal-rebuttals.test.ts`:
   - Same situation -- imports go through agents re-exports
   - **No changes needed** -- verify the test passes as-is

3. For `__tests__/src/skills/milestone-debate.test.ts`:
   - This test imports `normalizeFindings` from `../../../src/agents/__helpers/tribunal-detector` and `resolveRebuttals` from `../../../src/agents/__helpers/tribunal-rebuttals`
   - Update these imports to use `../../../src/shared/__helpers/tribunal-detector` and `../../../src/shared/__helpers/tribunal-rebuttals`
   - Also update the type import from `../../../src/agents/__schemas/tribunal.schemas` to `../../../src/shared/__schemas/tribunal.schemas`

4. Run full test suite: `bun test __tests__/src/agents/tribunal-detector.test.ts __tests__/src/agents/tribunal-rebuttals.test.ts __tests__/src/skills/milestone-debate.test.ts`.

**Verification:**

- [ ] All 3 test files pass
- [ ] `__tests__/src/skills/milestone-debate.test.ts` no longer imports from agents
- [ ] `bunx --bun tsc --noEmit` passes

### Task 8: Final validation

**Goal:** Run full verification to confirm no regressions.

**Steps:**

1. Run `bunx --bun tsc --noEmit` -- full type check
2. Run `bun test` -- full test suite
3. Verify no files in `src/skills/` import from `~/agents/` (the entity isolation violation is resolved)
4. Verify `src/shared/__schemas/tribunal.schemas.ts` imports nothing from src/ (T0 invariant)
5. Verify `src/shared/__helpers/tribunal-detector.ts` imports nothing outside shared/ and Node built-ins
6. Verify `src/shared/__helpers/tribunal-rebuttals.ts` imports nothing outside shared/

**Verification:**

- [ ] `bunx --bun tsc --noEmit` passes
- [ ] `bun test` passes (full suite, known pre-existing failures acceptable)
- [ ] Zero cross-entity imports from skills -> agents for tribunal code
- [ ] All new shared files are T0 compliant (no upward imports)

## Success Criteria

- [ ] Entity isolation violation RESOLVED: `src/skills/` no longer imports from `src/agents/`
- [ ] Tribunal infrastructure canonical home is `src/shared/` (T0)
- [ ] `src/agents/` preserves its public API via re-exports from shared
- [ ] All existing tests pass without modification to test logic (only import path changes)
- [ ] `bunx --bun tsc --noEmit` passes
- [ ] `bun test` passes
- [ ] No new tier violations introduced
