---
id: 95-B
title: "Extract shared resolveMajorityVote utility from duplicated tribunal logic"
phase: 95
wave: 2
complexity: MODERATE
todo: 95-B
depends_on: [95-A]
---

# 95-B: Extract Shared `resolveMajorityVote<T>()` Utility

## Objective

Extract the ~40 lines of identical majority-vote consensus resolution logic duplicated between `resolveVerificationTribunal()` (in `src/agents/__helpers/verification-tribunal.ts`, lines 296-335) and `resolveRootCauseTribunal()` (in `src/agents/__helpers/root-cause-tribunal.ts`, lines 292-335) into a single generic `resolveMajorityVote<T>()` utility in `src/shared/__helpers/tribunal-consensus.ts`.

Both functions implement the exact same algorithm:

1. Count votes per category from an array of 3 perspectives
2. Find majority (2+ votes)
3. If no majority (3-way split), use highest-confidence perspective as tiebreaker
4. Record the dissenting perspective
5. Calculate consensus confidence (average of agreeing voters)

The only difference is the category type (`ConflictCategory` vs `RootCauseChallengeCategory`) and the perspective type (`DiagnosticPerspective` vs `RootCausePerspective`). A generic function parameterized on both types eliminates the duplication.

**Depends on 95-A** because the shared utility goes in `src/shared/` (T0) and must be importable by `src/agents/` (T2).

## Context

@src/agents/**helpers/verification-tribunal.ts -- resolveVerificationTribunal lines 296-335 (the duplicated majority-vote block)
@src/agents/**helpers/root-cause-tribunal.ts -- resolveRootCauseTribunal lines 292-335 (the duplicated majority-vote block)
@src/shared/index.ts -- barrel that must export the new utility
@**tests**/src/agents/verification-tribunal.test.ts -- existing tests for resolveVerificationTribunal
@**tests**/src/agents/root-cause-tribunal.test.ts -- existing tests for resolveRootCauseTribunal

## Tasks

### Task 1: Create tribunal-consensus.ts in src/shared/\_\_helpers/

**Goal:** Implement a generic `resolveMajorityVote<TCategory, TPerspective>()` function.

**Files:** `src/shared/__helpers/tribunal-consensus.ts` (new)

**Steps:**

1. Create `src/shared/__helpers/tribunal-consensus.ts`.

2. Define the generic interface for a perspective (the minimum shape needed by the algorithm):

   ```typescript
   /**
    * Minimum interface a tribunal perspective must implement for majority-vote resolution.
    *
    * Both DiagnosticPerspective and RootCausePerspective satisfy this shape.
    */
   export interface VotablePerspective<TCategory extends string> {
     category_assessment: TCategory;
     confidence: number;
   }
   ```

3. Define the result type:

   ```typescript
   /**
    * Result of a majority-vote resolution across three tribunal perspectives.
    */
   export interface MajorityVoteResult<TCategory extends string, TPerspective> {
     /** The consensus category chosen by majority or tiebreaker */
     consensus_category: TCategory;
     /** Perspectives that voted for the consensus category */
     consensus_voters: TPerspective[];
     /** The dissenting perspective (if any) */
     dissenter: TPerspective | undefined;
     /** Average confidence of the consensus voters */
     consensus_confidence: number;
   }
   ```

4. Implement `resolveMajorityVote`:

   ```typescript
   /**
    * Resolve consensus from three tribunal perspectives using majority vote.
    *
    * Algorithm:
    * 1. Count votes per category
    * 2. If any category has 2+ votes, that is the majority consensus
    * 3. If 3-way split (all different), use highest confidence as tiebreaker
    * 4. Calculate consensus confidence as average of agreeing voters
    * 5. Record dissenter (the perspective that disagrees with consensus)
    *
    * @param perspectives - Exactly three tribunal perspectives
    * @returns MajorityVoteResult with consensus category, voters, dissenter, and confidence
    */
   export function resolveMajorityVote<
     TCategory extends string,
     TPerspective extends VotablePerspective<TCategory>,
   >(
     perspectives: [TPerspective, TPerspective, TPerspective],
   ): MajorityVoteResult<TCategory, TPerspective> {
     // ... (extract the common algorithm from both tribunal files)
   }
   ```

5. The implementation should be an exact extraction of the shared logic:
   - Build votes map: `Map<TCategory, TPerspective[]>`
   - Find majority: `[...votes.entries()].find(([, voters]) => voters.length >= 2)`
   - Handle 3-way split: sort by confidence descending, pick top
   - Record dissenter
   - Calculate consensus confidence: `sum(confidence) / count`
   - Round to 2 decimal places: `Math.round(confidence * 100) / 100`

6. The file must import nothing from src/ (only TypeScript built-ins). It is T0 compliant.

7. Run `bunx --bun tsc --noEmit`.

**Verification:**

- [ ] File exists at `src/shared/__helpers/tribunal-consensus.ts`
- [ ] No imports from src/ (T0 compliant)
- [ ] Generic function works with any `TCategory extends string` and any `TPerspective extends VotablePerspective<TCategory>`
- [ ] Algorithm matches the existing logic exactly
- [ ] Confidence rounding to 2 decimal places preserved
- [ ] `bunx --bun tsc --noEmit` passes

### Task 2: Export from shared barrel

**Goal:** Export the new utility from `src/shared/index.ts`.

**Files:** `src/shared/index.ts`

**Steps:**

1. Add exports after the tribunal rebuttals section:

   ```typescript
   // --- Tribunal Consensus -------------------------------------------------------

   export { resolveMajorityVote } from "./__helpers/tribunal-consensus";
   export type {
     VotablePerspective,
     MajorityVoteResult,
   } from "./__helpers/tribunal-consensus";
   ```

2. Run `bunx --bun tsc --noEmit`.

**Verification:**

- [ ] Barrel remains pure re-exports
- [ ] `resolveMajorityVote`, `VotablePerspective`, `MajorityVoteResult` accessible via `~/shared`
- [ ] `bunx --bun tsc --noEmit` passes

### Task 3: Refactor resolveVerificationTribunal to use shared utility

**Goal:** Replace the inline majority-vote logic in `resolveVerificationTribunal()` with a call to `resolveMajorityVote()`.

**Files:** `src/agents/__helpers/verification-tribunal.ts`

**Steps:**

1. Add import: `import { resolveMajorityVote } from "~/shared/__helpers/tribunal-consensus";`

2. In `resolveVerificationTribunal()`, replace lines 297-335 (the votes counting, majority finding, dissenter tracking, and confidence calculation) with:

   ```typescript
   const {
     consensus_category: consensusCategory,
     dissenter,
     consensus_confidence: consensusConfidence,
   } = resolveMajorityVote<ConflictCategory, DiagnosticPerspective>(
     perspectives,
   );
   ```

3. Keep the rest of the function intact (token cost estimation, result building, schema parsing).

4. Run `bunx --bun tsc --noEmit`.
5. Run `bun test __tests__/src/agents/verification-tribunal.test.ts` -- all existing tests must pass.

**Verification:**

- [ ] Inline majority-vote logic removed (~35 lines reduced)
- [ ] Single call to `resolveMajorityVote` replaces it
- [ ] `bunx --bun tsc --noEmit` passes
- [ ] `bun test __tests__/src/agents/verification-tribunal.test.ts` passes (no behavior change)

### Task 4: Refactor resolveRootCauseTribunal to use shared utility

**Goal:** Replace the inline majority-vote logic in `resolveRootCauseTribunal()` with a call to `resolveMajorityVote()`.

**Files:** `src/agents/__helpers/root-cause-tribunal.ts`

**Steps:**

1. Add import: `import { resolveMajorityVote } from "~/shared/__helpers/tribunal-consensus";`

2. In `resolveRootCauseTribunal()`, replace lines 292-335 (the votes counting, majority finding, dissenter tracking, and confidence calculation) with:

   ```typescript
   const {
     consensus_category: consensusCategory,
     dissenter,
     consensus_confidence: consensusConfidence,
   } = resolveMajorityVote<RootCauseChallengeCategory, RootCausePerspective>(
     perspectives,
   );
   ```

3. Keep the rest of the function intact (token cost estimation, resolution mapping, action mapping, result building).

4. Run `bunx --bun tsc --noEmit`.
5. Run `bun test __tests__/src/agents/root-cause-tribunal.test.ts` -- all existing tests must pass.

**Verification:**

- [ ] Inline majority-vote logic removed (~35 lines reduced)
- [ ] Single call to `resolveMajorityVote` replaces it
- [ ] `bunx --bun tsc --noEmit` passes
- [ ] `bun test __tests__/src/agents/root-cause-tribunal.test.ts` passes (no behavior change)

### Task 5: Write tests for resolveMajorityVote

**Goal:** Dedicated unit tests for the shared generic utility.

**Files:** `__tests__/src/shared/tribunal-consensus.test.ts` (new)

**Steps:**

1. Create test file using `bun:test` imports.

2. Define simple test types:

   ```typescript
   type TestCategory = "alpha" | "beta" | "gamma";
   interface TestPerspective {
     category_assessment: TestCategory;
     confidence: number;
   }
   ```

3. Test cases:
   - **Unanimous (3-0):** All three perspectives vote the same category. Consensus is that category, confidence is the average, no dissenter.
   - **Majority (2-1):** Two perspectives agree, one dissents. Consensus is the majority category, confidence is the average of the two, dissenter is the one that disagrees.
   - **Three-way split:** All three perspectives vote different categories. Consensus uses highest-confidence tiebreaker. Dissenter is the second-highest confidence.
   - **Confidence rounding:** Verify confidence is rounded to 2 decimal places.
   - **Same confidence in split:** When all three have the same confidence in a 3-way split, the first sorted perspective wins (stable sort behavior).

4. Run `bun test __tests__/src/shared/tribunal-consensus.test.ts`.

**Verification:**

- [ ] All test cases pass
- [ ] Tests cover unanimity, majority, and 3-way split
- [ ] Confidence rounding verified
- [ ] `bun test __tests__/src/shared/tribunal-consensus.test.ts` passes

### Task 6: Final validation

**Goal:** Confirm no regressions across the full test suite.

**Steps:**

1. Run `bunx --bun tsc --noEmit`.
2. Run `bun test __tests__/src/agents/verification-tribunal.test.ts __tests__/src/agents/root-cause-tribunal.test.ts __tests__/src/shared/tribunal-consensus.test.ts`.
3. Run `bun test` (full suite).

**Verification:**

- [ ] `bunx --bun tsc --noEmit` passes
- [ ] All tribunal tests pass
- [ ] Full test suite passes
- [ ] Net code reduction: ~70 lines removed (35 per file), ~30 lines added (shared utility)

## Success Criteria

- [ ] `resolveMajorityVote<T>()` generic utility exists in `src/shared/__helpers/tribunal-consensus.ts`
- [ ] Both `resolveVerificationTribunal` and `resolveRootCauseTribunal` call the shared utility
- [ ] Duplicated ~40-line majority-vote blocks removed from both files
- [ ] All existing tests pass without modification to test assertions
- [ ] New dedicated tests for `resolveMajorityVote` cover all resolution paths
- [ ] `bunx --bun tsc --noEmit` passes
- [ ] `bun test` passes
