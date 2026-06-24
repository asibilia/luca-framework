---
id: PLAN-98-A
title: "Extract Resolution-Counting Helper from 3 Duplicated Filter Patterns"
phase: 98
wave: 1
depends_on: []
---

# PLAN-98-A: Extract Resolution-Counting Helper from 3 Duplicated Filter Patterns

## Objective

Extract a shared `countResolutions()` helper to replace the duplicated pattern of filtering rebuttals by resolution status (upheld/withdrawn/modified). This pattern appears in 3 locations and each instance uses `lodash/filter` with identical logic.

Source: `.planning/v2.6.1-MILESTONE-AUDIT.md` — MEDIUM DRY issue.

## Context

@file src/shared/\_\_helpers/tribunal-rebuttals.ts — Contains 2 of the 3 copies (lines 230-241 in `resolveRebuttals`, lines 298-305 in `buildTribunalResult`).

@file src/skills/\_\_helpers/milestone-debate.ts — Contains the 3rd copy (lines 274-285 in `generateConsensusSummary`).

@file src/shared/index.ts — Barrel for shared domain; the new helper will be exported here.

The duplicated pattern in all 3 locations:

```typescript
const upheldCount = filter(rebuttals, (r) => r.resolution === "upheld").length;
const withdrawnCount = filter(
  rebuttals,
  (r) => r.resolution === "withdrawn",
).length;
const modifiedCount = filter(
  rebuttals,
  (r) => r.resolution === "modified",
).length;
```

## Tasks

### Task 1: Create the `countResolutions` helper in shared

**Goal:** Create a new file `src/shared/__helpers/resolution-counts.ts` with a `countResolutions()` function that returns a typed object with counts for each resolution type.

**File:** `src/shared/__helpers/resolution-counts.ts` (NEW)

**Target content:**

````typescript
import filter from "lodash/filter";

import type { Rebuttal } from "../__schemas/tribunal.schemas";

/**
 * Counts of each rebuttal resolution type.
 *
 * Used by tribunal result builders and consensus summary generators
 * to avoid duplicating the filter-by-resolution pattern.
 */
export interface ResolutionCounts {
  /** Number of rebuttals where the finding was upheld */
  upheld: number;
  /** Number of rebuttals where the finding was withdrawn */
  withdrawn: number;
  /** Number of rebuttals where the finding was modified */
  modified: number;
}

/**
 * Count rebuttals by resolution status.
 *
 * Replaces the repeated pattern of filtering rebuttals three times
 * (upheld/withdrawn/modified) and taking `.length` of each result.
 *
 * @param rebuttals - Array of completed rebuttal records
 * @returns Object with counts for each resolution type
 *
 * @example
 * ```typescript
 * const counts = countResolutions(rebuttals);
 * // { upheld: 3, withdrawn: 1, modified: 2 }
 * ```
 */
export function countResolutions(rebuttals: Rebuttal[]): ResolutionCounts {
  return {
    upheld: filter(rebuttals, (r) => r.resolution === "upheld").length,
    withdrawn: filter(rebuttals, (r) => r.resolution === "withdrawn").length,
    modified: filter(rebuttals, (r) => r.resolution === "modified").length,
  };
}
````

**Verification:** File exists and exports `countResolutions` and `ResolutionCounts`.

### Task 2: Export the new helper from shared barrel

**Goal:** Add the export to `src/shared/index.ts`.

**File:** `src/shared/index.ts`

**Current (end of file, after line 103):**

```typescript
export type {
  VotablePerspective,
  MajorityVoteResult,
} from "./__helpers/tribunal-consensus";
```

**Target (append after the above block):**

```typescript
export type {
  VotablePerspective,
  MajorityVoteResult,
} from "./__helpers/tribunal-consensus";

// ─── Resolution Counting ─────────────────────────────────────────────────────

export { countResolutions } from "./__helpers/resolution-counts";
export type { ResolutionCounts } from "./__helpers/resolution-counts";
```

**Verification:** `grep -n "countResolutions" src/shared/index.ts` returns the export line.

### Task 3: Replace resolution counting in `resolveRebuttals` (tribunal-rebuttals.ts)

**Goal:** Replace the inline filter calls in `resolveRebuttals` with `countResolutions()`.

**File:** `src/shared/__helpers/tribunal-rebuttals.ts`

**Add import (after the existing imports from tribunal.schemas, around line 16):**

```typescript
import { countResolutions } from "./resolution-counts";
```

**Current (lines 230-241 in `resolveRebuttals`):**

```typescript
const upheldCount = filter(
  findingRebuttals,
  (r) => r.resolution === "upheld",
).length;
const withdrawnCount = filter(
  findingRebuttals,
  (r) => r.resolution === "withdrawn",
).length;
const modifiedCount = filter(
  findingRebuttals,
  (r) => r.resolution === "modified",
).length;
```

**Target:**

```typescript
const {
  upheld: upheldCount,
  withdrawn: withdrawnCount,
  modified: modifiedCount,
} = countResolutions(findingRebuttals);
```

**Verification:** `grep -n "r.resolution ===" src/shared/__helpers/tribunal-rebuttals.ts` returns at most 0 matches in `resolveRebuttals` (the buildTribunalResult pattern is handled in Task 4).

### Task 4: Replace resolution counting in `buildTribunalResult` (tribunal-rebuttals.ts)

**Goal:** Replace the inline filter calls in `buildTribunalResult` with `countResolutions()`.

**File:** `src/shared/__helpers/tribunal-rebuttals.ts`

**Current (lines 298-305 in `buildTribunalResult`):**

```typescript
const withdrawnCount = filter(
  rebuttals,
  (r) => r.resolution === "withdrawn",
).length;
const modifiedCount = filter(
  rebuttals,
  (r) => r.resolution === "modified",
).length;
```

**Target:**

```typescript
const { withdrawn: withdrawnCount, modified: modifiedCount } =
  countResolutions(rebuttals);
```

**Verification:** `grep -c "r.resolution ===" src/shared/__helpers/tribunal-rebuttals.ts` returns `0`.

### Task 5: Replace resolution counting in `generateConsensusSummary` (milestone-debate.ts)

**Goal:** Replace the inline filter calls in `generateConsensusSummary` with `countResolutions()`.

**File:** `src/skills/__helpers/milestone-debate.ts`

**Add import (after the existing imports from shared, around line 18-21):**

```typescript
import { countResolutions } from "~/shared/__helpers/resolution-counts";
```

**Current (lines 274-285 in `generateConsensusSummary`):**

```typescript
const upheldCount = filter(rebuttals, (r) => r.resolution === "upheld").length;
const withdrawnCount = filter(
  rebuttals,
  (r) => r.resolution === "withdrawn",
).length;
const modifiedCount = filter(
  rebuttals,
  (r) => r.resolution === "modified",
).length;
```

**Target:**

```typescript
const {
  upheld: upheldCount,
  withdrawn: withdrawnCount,
  modified: modifiedCount,
} = countResolutions(rebuttals);
```

**Verification:** `grep -c "r.resolution ===" src/skills/__helpers/milestone-debate.ts` returns `0`.

### Task 6: Clean up unused lodash/filter imports if no longer needed

**Goal:** After replacing the resolution counting patterns, check whether `lodash/filter` is still used in each file. If not, remove the import.

**File:** `src/shared/__helpers/tribunal-rebuttals.ts`

Check: After Tasks 3 and 4, are there remaining `filter()` calls in this file? Looking at the source, `filter` is imported on line 2 but after the resolution counting extraction, it is no longer used anywhere in the file. **Remove** `import filter from "lodash/filter";` from line 2.

**File:** `src/skills/__helpers/milestone-debate.ts`

Check: `filter` is imported on line 10. After Task 5, the remaining usage of `filter` is in `generateConsensusSummary` at lines 287-293 (the `highConfidence` and `contested` filters on `recommendations`). These use `filter` on recommendations, not rebuttals. **Keep** the `filter` import.

**Verification:**

- `grep -n "from.*lodash/filter" src/shared/__helpers/tribunal-rebuttals.ts` returns no matches (removed).
- `grep -n "from.*lodash/filter" src/skills/__helpers/milestone-debate.ts` returns the existing import (kept because still used).

## Success Criteria

- [ ] New `src/shared/__helpers/resolution-counts.ts` file exists with `countResolutions()` and `ResolutionCounts` type
- [ ] `countResolutions` exported from `src/shared/index.ts` barrel
- [ ] Zero `r.resolution === "upheld"` / `"withdrawn"` / `"modified"` filter patterns remain in `tribunal-rebuttals.ts`
- [ ] Zero `r.resolution === "upheld"` / `"withdrawn"` / `"modified"` filter patterns remain in `milestone-debate.ts`
- [ ] `bunx --bun tsc --noEmit` passes
- [ ] `bun test` passes

## Verification

```bash
# Verify helper file exists
test -f src/shared/__helpers/resolution-counts.ts && echo "PASS: helper exists" || echo "FAIL"

# Verify barrel export
grep -n "countResolutions" src/shared/index.ts && echo "PASS: barrel exports helper" || echo "FAIL"

# Verify no remaining inline resolution counting
grep -rn "r\.resolution ===" src/shared/__helpers/tribunal-rebuttals.ts src/skills/__helpers/milestone-debate.ts && echo "FAIL: inline patterns remain" || echo "PASS: all extracted"

# Verify unused import removed
grep -n "lodash/filter" src/shared/__helpers/tribunal-rebuttals.ts && echo "FAIL: unused filter import remains" || echo "PASS: cleanup done"

# No regressions
bunx --bun tsc --noEmit
bun test
```
