---
id: PLAN-98-C
title: "Extract safeParse-or-Throw Utility from Repeated Switch Pattern"
phase: 98
wave: 1
depends_on: []
---

# PLAN-98-C: Extract safeParse-or-Throw Utility from Repeated Switch Pattern

## Objective

Extract a generic `safeParseOrThrow()` utility to replace the repeated pattern in the `appendMetrics` switch statement where each of the 4 cases does: `safeParse(entry)` -> check `!parsed.success` -> throw with context -> push to array. The 4 cases are structurally identical aside from the schema and target array.

Source: `.planning/v2.6.1-MILESTONE-AUDIT.md` — MEDIUM DRY issue.

## Context

@file src/iteration/\_\_helpers/metrics-collector.ts — Contains the `appendMetrics` function (lines 308-357) with a 4-case switch where each case follows the same pattern.

@file src/shared/index.ts — Barrel for shared domain; the new utility will be exported here.

The repeated pattern in each switch case (4 times):

```typescript
case "iteration_metrics": {
  const parsed = iterationMetricsSchema.safeParse(entry);
  if (!parsed.success) {
    throw new Error(
      `[metrics-collector] Invalid iteration_metrics entry: ${parsed.error.message}`,
    );
  }
  metricsFile.iteration_metrics.push(parsed.data);
  break;
}
```

Each case varies only in: schema name, error label string, and target array reference.

## Tasks

### Task 1: Create the `safeParseOrThrow` utility in shared

**Goal:** Create a new file `src/shared/__helpers/safe-parse-or-throw.ts` with a generic `safeParseOrThrow()` function.

**File:** `src/shared/__helpers/safe-parse-or-throw.ts` (NEW)

**Target content:**

````typescript
import type { z } from "zod";

/**
 * Parse a value with a Zod schema, throwing a descriptive error on failure.
 *
 * Replaces the repeated pattern of:
 * 1. `schema.safeParse(value)`
 * 2. Check `!parsed.success`
 * 3. Throw `new Error(...)` with a context label
 *
 * @param schema - Zod schema to parse against
 * @param value - Value to parse
 * @param label - Human-readable label for error messages (e.g., "[metrics-collector] Invalid iteration_metrics entry")
 * @returns The parsed and validated value
 * @throws Error with descriptive message if parsing fails
 *
 * @example
 * ```typescript
 * const entry = safeParseOrThrow(
 *   iterationMetricsSchema,
 *   rawEntry,
 *   "[metrics-collector] Invalid iteration_metrics entry",
 * );
 * metricsFile.iteration_metrics.push(entry);
 * ```
 */
export function safeParseOrThrow<T>(
  schema: z.ZodType<T>,
  value: unknown,
  label: string,
): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`${label}: ${parsed.error.message}`);
  }
  return parsed.data;
}
````

**Verification:** File exists and exports `safeParseOrThrow`.

### Task 2: Export the new utility from shared barrel

**Goal:** Add the export to `src/shared/index.ts`.

**File:** `src/shared/index.ts`

**Append after the last export block (after the Tribunal Consensus section, or after the Resolution Counting section if PLAN-98-A is executed first):**

```typescript
// ─── Parsing Utilities ──────────────────────────────────────────────────────

export { safeParseOrThrow } from "./__helpers/safe-parse-or-throw";
```

**Verification:** `grep -n "safeParseOrThrow" src/shared/index.ts` returns the export line.

### Task 3: Refactor `appendMetrics` switch to use `safeParseOrThrow`

**Goal:** Replace all 4 switch cases with single-line calls to `safeParseOrThrow`.

**File:** `src/iteration/__helpers/metrics-collector.ts`

**Add import (after existing imports, around line 3):**

```typescript
import { safeParseOrThrow } from "~/shared/__helpers/safe-parse-or-throw";
```

**Current (lines 316-357 in `appendMetrics`):**

```typescript
switch (category) {
  case "iteration_metrics": {
    const parsed = iterationMetricsSchema.safeParse(entry);
    if (!parsed.success) {
      throw new Error(
        `[metrics-collector] Invalid iteration_metrics entry: ${parsed.error.message}`,
      );
    }
    metricsFile.iteration_metrics.push(parsed.data);
    break;
  }
  case "plan_quality_metrics": {
    const parsed = planQualityMetricsSchema.safeParse(entry);
    if (!parsed.success) {
      throw new Error(
        `[metrics-collector] Invalid plan_quality_metrics entry: ${parsed.error.message}`,
      );
    }
    metricsFile.plan_quality_metrics.push(parsed.data);
    break;
  }
  case "review_metrics": {
    const parsed = reviewMetricsSchema.safeParse(entry);
    if (!parsed.success) {
      throw new Error(
        `[metrics-collector] Invalid review_metrics entry: ${parsed.error.message}`,
      );
    }
    metricsFile.review_metrics.push(parsed.data);
    break;
  }
  case "convergence_metrics": {
    const parsed = convergenceMetricsSchema.safeParse(entry);
    if (!parsed.success) {
      throw new Error(
        `[metrics-collector] Invalid convergence_metrics entry: ${parsed.error.message}`,
      );
    }
    metricsFile.convergence_metrics.push(parsed.data);
    break;
  }
}
```

**Target:**

```typescript
switch (category) {
  case "iteration_metrics": {
    metricsFile.iteration_metrics.push(
      safeParseOrThrow(
        iterationMetricsSchema,
        entry,
        "[metrics-collector] Invalid iteration_metrics entry",
      ),
    );
    break;
  }
  case "plan_quality_metrics": {
    metricsFile.plan_quality_metrics.push(
      safeParseOrThrow(
        planQualityMetricsSchema,
        entry,
        "[metrics-collector] Invalid plan_quality_metrics entry",
      ),
    );
    break;
  }
  case "review_metrics": {
    metricsFile.review_metrics.push(
      safeParseOrThrow(
        reviewMetricsSchema,
        entry,
        "[metrics-collector] Invalid review_metrics entry",
      ),
    );
    break;
  }
  case "convergence_metrics": {
    metricsFile.convergence_metrics.push(
      safeParseOrThrow(
        convergenceMetricsSchema,
        entry,
        "[metrics-collector] Invalid convergence_metrics entry",
      ),
    );
    break;
  }
}
```

**Verification:** Each switch case is now a single `push(safeParseOrThrow(...))` call. No more inline `safeParse` + error check in the switch.

## Success Criteria

- [ ] New `src/shared/__helpers/safe-parse-or-throw.ts` file exists with `safeParseOrThrow()`
- [ ] `safeParseOrThrow` exported from `src/shared/index.ts` barrel
- [ ] `appendMetrics` switch reduced from ~40 lines to ~20 lines, using `safeParseOrThrow` in each case
- [ ] Error messages preserved (same label format: `[metrics-collector] Invalid {category} entry: {error}`)
- [ ] Behavior unchanged: invalid entries still throw, valid entries still push
- [ ] `bunx --bun tsc --noEmit` passes
- [ ] `bun test` passes

## Verification

```bash
# Verify helper file exists
test -f src/shared/__helpers/safe-parse-or-throw.ts && echo "PASS: helper exists" || echo "FAIL"

# Verify barrel export
grep -n "safeParseOrThrow" src/shared/index.ts && echo "PASS: barrel exports utility" || echo "FAIL"

# Verify refactored switch uses safeParseOrThrow
grep -c "safeParseOrThrow" src/iteration/__helpers/metrics-collector.ts | grep -q "4" && echo "PASS: 4 calls in switch" || echo "FAIL"

# Verify no remaining inline safeParse in the switch (the build functions above the switch still use safeParse — that's fine)
# Count safeParse calls in appendMetrics function specifically
grep -A 50 "export async function appendMetrics" src/iteration/__helpers/metrics-collector.ts | grep -c "\.safeParse(" | grep -q "0" && echo "PASS: no inline safeParse in appendMetrics" || echo "FAIL"

# No regressions
bunx --bun tsc --noEmit
bun test
```
