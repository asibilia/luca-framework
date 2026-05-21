---
id: 96-C
title: "Replace native .sort() and .filter() with lodash orderBy and filter across debate/tribunal files"
phase: 96
wave: 2
complexity: MODERATE
todo: 96-C
---

# 96-C: Replace Native `.sort()` and `.filter()` with Lodash `orderBy` and `filter`

## Objective

Replace all native `.sort()` calls with lodash `orderBy` (immutable, returns new array) and all native `.filter()` calls with lodash `filter` across all v2.6.0 debate/tribunal files. This aligns with the project convention documented in `.claude/rules/lodash-preference.md` to use lodash for consistency, immutability, and safer operations.

**Scope:** ~8 files, ~20 call sites (4 `.sort()` and ~16 `.filter()` instances).

## Context

@.claude/rules/lodash-preference.md — "Use lodash orderBy instead of .sort(), lodash filter instead of .filter()"
@src/shared/**helpers/tribunal-rebuttals.ts — 1x .sort (line 67), 5x .filter (lines 228, 231, 234, 293, 296)
@src/agents/**helpers/verification-tribunal.ts — no native .sort or .filter (already clean)
@src/agents/**helpers/root-cause-tribunal.ts — no native .sort or .filter (already clean)
@src/iteration/**helpers/stall-debate.ts — 1x .sort (line 122), 2x .filter (lines 104, 107)
@src/skills/**helpers/milestone-debate.ts — 5x .filter (lines 256, 257, 260, 264, 267)
@src/skills/**helpers/pr-verdict-debate.ts — 2x .filter (lines 71, 72)
@src/iteration/**helpers/convergence.ts — 3x .filter (lines 164, 167, 243)
@src/iteration/**helpers/metrics-collector.ts — 1x .filter (line 60)

**Note:** `convergence.ts` line 93 (`.filter((t) => t.length > 1)` inside the private `tokenize` function) is a low-level string operation that does not benefit from lodash migration. The `.filter(Boolean)` on line 243 is also idiomatic. Both are excluded from this plan per pragmatism (lodash adds overhead with no benefit for these cases). However, lines 164 and 167 (filtering classified errors by classification) are included.

## Tasks

### Task 1: Migrate `tribunal-rebuttals.ts`

**Goal:** Replace 1x `.sort()` and 5x `.filter()` with lodash equivalents.

**Files:** `src/shared/__helpers/tribunal-rebuttals.ts`

**Steps:**

1. Add imports at top of file:

   ```typescript
   import orderBy from "lodash/orderBy";
   import filter from "lodash/filter";
   ```

2. **Line 67 — `.sort()` in `buildRebuttalPrompts`:**
   - Before: `const sorted = [...findings].sort((a, b) => severityRank(b.severity) - severityRank(a.severity));`
   - After: `const sorted = orderBy(findings, [(f) => severityRank(f.severity)], ["desc"]);`
   - Note: `orderBy` already returns a new array, so the `[...findings]` spread is no longer needed.

3. **Lines 228-234 — `.filter()` in `resolveRebuttals`:**
   - Before: `const upheldCount = findingRebuttals.filter((r) => r.resolution === "upheld").length;`
   - After: `const upheldCount = filter(findingRebuttals, (r) => r.resolution === "upheld").length;`
   - Same pattern for `withdrawnCount` (line 231) and `modifiedCount` (line 234).

4. **Lines 293-296 — `.filter()` in `buildTribunalResult`:**
   - Before: `const withdrawnCount = rebuttals.filter((r) => r.resolution === "withdrawn").length;`
   - After: `const withdrawnCount = filter(rebuttals, (r) => r.resolution === "withdrawn").length;`
   - Same pattern for `modifiedCount` (line 296).

5. Run `bunx --bun tsc --noEmit`.

**Call sites:** 1x sort → orderBy, 5x filter → filter

**Verification:**

- [ ] Zero `.sort()` calls remain in the file
- [ ] All 5 `.filter()` calls replaced with lodash `filter()`
- [ ] Lodash imports use individual import pattern
- [ ] `bunx --bun tsc --noEmit` passes

### Task 2: Migrate `stall-debate.ts`

**Goal:** Replace 1x `.sort()` and 2x `.filter()` with lodash equivalents.

**Files:** `src/iteration/__helpers/stall-debate.ts`

**Steps:**

1. Add imports at top of file:

   ```typescript
   import orderBy from "lodash/orderBy";
   import filter from "lodash/filter";
   ```

2. **Line 122 — `.sort()` in `evaluateStallDebate`:**
   - Before:
     ```typescript
     const topSources = Array.from(sourceCounts.entries())
       .sort((a, b) => b[1] - a[1])
       .slice(0, 3)
       .map(([source]) => source);
     ```
   - After:
     ```typescript
     const topSources = orderBy(
       Array.from(sourceCounts.entries()),
       [(e) => e[1]],
       ["desc"],
     )
       .slice(0, 3)
       .map(([source]) => source);
     ```

3. **Lines 104-107 — `.filter()` in `evaluateStallDebate`:**
   - Before: `const correctableCount = current_errors.filter((e) => e.classification === "correctable").length;`
   - After: `const correctableCount = filter(current_errors, (e) => e.classification === "correctable").length;`
   - Same pattern for `totalActive` (line 107).

4. Run `bunx --bun tsc --noEmit`.

**Call sites:** 1x sort → orderBy, 2x filter → filter

**Verification:**

- [ ] Zero `.sort()` calls remain in the file
- [ ] All 2 `.filter()` calls replaced with lodash `filter()`
- [ ] `bunx --bun tsc --noEmit` passes

### Task 3: Migrate `milestone-debate.ts`

**Goal:** Replace 5x `.filter()` with lodash equivalents.

**Files:** `src/skills/__helpers/milestone-debate.ts`

**Steps:**

1. Add import at top of file:

   ```typescript
   import filter from "lodash/filter";
   ```

2. **Lines 256-267 — `.filter()` in `generateConsensusSummary`:**
   - `rebuttals.filter((r) => r.resolution === "upheld")` → `filter(rebuttals, (r) => r.resolution === "upheld")`
   - `rebuttals.filter((r) => r.resolution === "withdrawn")` → `filter(rebuttals, (r) => r.resolution === "withdrawn")`
   - `rebuttals.filter((r) => r.resolution === "modified")` → `filter(rebuttals, (r) => r.resolution === "modified")`
   - `recommendations.filter((r) => r.confidence > 0.8)` → `filter(recommendations, (r) => r.confidence > 0.8)`
   - `recommendations.filter((r) => r.confidence >= 0.5 && r.confidence <= 0.8)` → `filter(recommendations, (r) => r.confidence >= 0.5 && r.confidence <= 0.8)`

3. Run `bunx --bun tsc --noEmit`.

**Call sites:** 5x filter → filter

**Verification:**

- [ ] All 5 `.filter()` calls replaced with lodash `filter()`
- [ ] `bunx --bun tsc --noEmit` passes

### Task 4: Migrate `pr-verdict-debate.ts`

**Goal:** Replace 2x `.filter()` with lodash equivalents.

**Files:** `src/skills/__helpers/pr-verdict-debate.ts`

**Steps:**

1. Add import at top of file:

   ```typescript
   import filter from "lodash/filter";
   ```

2. **Lines 71-72 — `.filter()` in `detectVerdictSplits`:**
   - `commentVerdicts.filter((v) => v.valid)` → `filter(commentVerdicts, (v) => v.valid)`
   - `commentVerdicts.filter((v) => !v.valid)` → `filter(commentVerdicts, (v) => !v.valid)`

3. Run `bunx --bun tsc --noEmit`.

**Call sites:** 2x filter → filter

**Verification:**

- [ ] All 2 `.filter()` calls replaced with lodash `filter()`
- [ ] `bunx --bun tsc --noEmit` passes

### Task 5: Migrate `convergence.ts`

**Goal:** Replace 2x `.filter()` with lodash equivalents (excluding internal `tokenize` and `Boolean` filter).

**Files:** `src/iteration/__helpers/convergence.ts`

**Steps:**

1. Add import at top of file:

   ```typescript
   import filter from "lodash/filter";
   ```

2. **Lines 164-167 — `.filter()` in `computeConvergenceSignals`:**
   - `currentErrors.filter((e) => e.classification !== "permanent")` → `filter(currentErrors, (e) => e.classification !== "permanent")`
   - `previousErrors.filter((e) => e.classification !== "permanent")` → `filter(previousErrors, (e) => e.classification !== "permanent")`

3. **Excluded:**
   - Line 93 (`.filter((t) => t.length > 1)` in `tokenize`) — internal string processing, not array of domain objects.
   - Line 243 (`.filter(Boolean)` on `staleSignals`) — idiomatic boolean filter on primitive array.

4. Run `bunx --bun tsc --noEmit`.

**Call sites:** 2x filter → filter (2 excluded)

**Verification:**

- [ ] 2 target `.filter()` calls replaced with lodash `filter()`
- [ ] 2 excluded `.filter()` calls remain (tokenize, Boolean)
- [ ] `bunx --bun tsc --noEmit` passes

### Task 6: Migrate `metrics-collector.ts`

**Goal:** Replace 1x `.filter()` with lodash equivalent.

**Files:** `src/iteration/__helpers/metrics-collector.ts`

**Steps:**

1. Add import at top of file:

   ```typescript
   import filter from "lodash/filter";
   ```

2. **Line 60 — `.filter()` in `buildIterationMetrics`:**
   - Before: `loopResult.history.iterations.filter((r) => r.convergence_status === "stalled").length`
   - After: `filter(loopResult.history.iterations, (r) => r.convergence_status === "stalled").length`

3. Run `bunx --bun tsc --noEmit`.

**Call sites:** 1x filter → filter

**Verification:**

- [ ] The 1 `.filter()` call replaced with lodash `filter()`
- [ ] `bunx --bun tsc --noEmit` passes

### Task 7: Final validation

**Goal:** Run full verification to confirm no regressions.

**Steps:**

1. Run `bunx --bun tsc --noEmit` — full type check.
2. Run `bun test` — full test suite.
3. Verify zero native `.sort()` calls remain in debate/tribunal files.
4. Verify all domain-object `.filter()` calls use lodash `filter()`.
5. Confirm all lodash imports use individual import pattern: `import X from "lodash/X"`.

**Verification:**

- [ ] `bunx --bun tsc --noEmit` passes
- [ ] `bun test` passes (pre-existing failures acceptable)
- [ ] Zero native `.sort()` in debate/tribunal files
- [ ] All domain-object `.filter()` calls use lodash `filter()`
- [ ] All lodash imports are individual (`lodash/orderBy`, `lodash/filter`)

## Success Criteria

- [ ] 4x `.sort()` calls replaced with lodash `orderBy` (immutable, descriptive)
- [ ] ~16x `.filter()` calls replaced with lodash `filter` (consistency)
- [ ] No functional behavior change (same semantics, same output)
- [ ] All lodash imports use individual import pattern
- [ ] `bunx --bun tsc --noEmit` passes
- [ ] `bun test` passes
