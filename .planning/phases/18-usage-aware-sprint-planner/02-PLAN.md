---
id: 18-02
title: WSJF Scoring Engine
phase: 18-usage-aware-sprint-planner
wave: 2
delivers: PLAN-03
depends_on:
  - 18-01
tasks: 2
---

# Plan 18-02: WSJF Scoring Engine

## Objective

Implement the WSJF (Weighted Shortest Job First) scoring engine in `src/planner/scoring.ts`. This module computes WSJF scores from input components, ranks a list of scored items by WSJF descending, and provides utility functions for score computation. It includes a CLI entry point via `import.meta.main` for standalone testing and debugging.

## Context

- **Types from Plan 18-01:** `src/planner/types.ts` (WSJFInput, WSJFScoredItem, EffortPoints)
- **Defaults from Plan 18-01:** `src/planner/defaults.ts` (EFFORT_MAP)
- **Module pattern precedent:** `src/iteration/convergence.ts` (pure functions, CLI entry point, co-located test)
- **WSJF formula:** (business_value + time_criticality + risk_reduction) / effort_points
- **18-CONTEXT.md Decision 3:** PM agent infers BV/TC/RR from todo context; scoring is mechanical
- **18-CONTEXT.md Decision 7:** Big Rock First is slot 1, then WSJF tail -- but Big Rock selection is in scheduler, not scoring
- **CLI pattern precedent:** `src/iteration/budget.ts` (import.meta.main + Bun.argv + JSON stdout)

## Design Decisions Applied

1. **Pure functions** (no-classes rule): All scoring functions are stateless, no side effects
2. **Deterministic sorting** (lodash preference): Use `orderBy` from lodash for stable sort
3. **Effort from complexity proxy** (18-CONTEXT.md Decision 2): EFFORT_MAP converts ComplexityLevel to effort points
4. **Score is computed, not stored as input** (single source of truth): computeWSJF calculates from inputs each time
5. **Division-by-zero safety**: If effort_points is 0 (should not happen per schema validation), return 0

## Files

### Create

- `src/planner/scoring.ts` -- WSJF computation and ranking functions
- `src/planner/scoring.test.ts` -- Tests for scoring module

## Tasks

### Task 1: Create src/planner/scoring.ts -- WSJF Scoring Engine

**Goal:** Implement WSJF score computation and ranking utilities.

**File:** `src/planner/scoring.ts` (new)

**Functions to implement:**

**1. `computeWSJF(input: WSJFInput): number`**

Compute the WSJF score from input components:

````typescript
import orderBy from "lodash/orderBy";

import type { WSJFInput, WSJFScoredItem } from "./types";
import type { ComplexityLevel } from "../complexity/types";
import { EFFORT_MAP } from "./defaults";

/**
 * Compute WSJF score from input components.
 *
 * Formula: (business_value + time_criticality + risk_reduction) / effort_points
 *
 * Higher scores indicate higher priority (more value per unit effort).
 * Division by zero returns 0 as a safety measure, though schema validation
 * should prevent effort_points from being 0.
 *
 * @param input - WSJF input components
 * @returns Computed WSJF score (higher is better)
 *
 * @example
 * ```typescript
 * computeWSJF({ business_value: 8, time_criticality: 5, risk_reduction: 3, effort_points: 5 })
 * // (8 + 5 + 3) / 5 = 3.2
 * ```
 */
export function computeWSJF(input: WSJFInput): number {
  if (input.effort_points === 0) return 0;
  const costOfDelay =
    input.business_value + input.time_criticality + input.risk_reduction;
  return costOfDelay / input.effort_points;
}
````

**2. `effortFromComplexity(complexity: ComplexityLevel): number`**

Map a complexity level to its effort point value:

```typescript
/**
 * Map a complexity level to its effort point value.
 *
 * Uses the EFFORT_MAP from defaults which follows the Fibonacci-like proxy:
 * TRIVIAL=1, SIMPLE=2, MODERATE=3, COMPLEX=5, CRITICAL=8.
 *
 * If the complexity level is not found (unknown string), returns 3 (MODERATE)
 * as a safe default.
 *
 * @param complexity - Complexity level string
 * @returns Effort points for the complexity level
 */
export function effortFromComplexity(complexity: string): number {
  return EFFORT_MAP[complexity as ComplexityLevel] ?? 3;
}
```

**3. `rankByWSJF(items: WSJFScoredItem[]): WSJFScoredItem[]`**

Sort items by WSJF score descending (highest priority first):

````typescript
/**
 * Sort items by WSJF score descending (highest priority first).
 *
 * Uses lodash orderBy for stable sorting. Items with equal WSJF scores
 * are secondarily sorted by effort_points ascending (prefer cheaper items
 * when value-per-effort is equal).
 *
 * Returns a new array (immutable -- does not mutate input).
 *
 * @param items - Array of WSJF-scored items
 * @returns New array sorted by WSJF score descending, then effort ascending
 *
 * @example
 * ```typescript
 * const ranked = rankByWSJF(items);
 * // ranked[0] has highest WSJF score (most value per effort)
 * ```
 */
export function rankByWSJF(items: WSJFScoredItem[]): WSJFScoredItem[] {
  return orderBy(
    items,
    [(item) => item.wsjf_score, (item) => item.wsjf_inputs.effort_points],
    ["desc", "asc"],
  );
}
````

**4. `scoreItem(params: { todo_path: string; title: string; area: string; business_value: number; time_criticality: number; risk_reduction: number; complexity: string; dependency_free: boolean }): WSJFScoredItem`**

Convenience function to create a fully scored item from raw inputs:

```typescript
/**
 * Create a fully scored WSJFScoredItem from raw parameters.
 *
 * Computes effort points from complexity level and WSJF score
 * from the input components. Convenience function that combines
 * effortFromComplexity and computeWSJF into a single call.
 *
 * @param params - Raw input parameters
 * @returns A complete WSJFScoredItem with computed scores
 */
export function scoreItem(params: {
  todo_path: string;
  title: string;
  area: string;
  business_value: number;
  time_criticality: number;
  risk_reduction: number;
  complexity: string;
  dependency_free: boolean;
}): WSJFScoredItem {
  const effort = effortFromComplexity(params.complexity);
  const wsjfInputs: WSJFInput = {
    business_value: params.business_value,
    time_criticality: params.time_criticality,
    risk_reduction: params.risk_reduction,
    effort_points: effort,
  };
  const score = computeWSJF(wsjfInputs);

  return {
    todo_path: params.todo_path,
    title: params.title,
    area: params.area,
    wsjf_inputs: wsjfInputs,
    wsjf_score: score,
    complexity: params.complexity,
    dependency_free: params.dependency_free,
  };
}
```

**CLI entry point:**

```typescript
/**
 * CLI entry point for WSJF scoring operations.
 *
 * Usage:
 *   bun run src/planner/scoring.ts compute \
 *     --bv=8 --tc=5 --rr=3 --effort=5
 *
 *   bun run src/planner/scoring.ts rank \
 *     --items='[{ ... WSJFScoredItem JSON array ... }]'
 *
 * Outputs JSON result to stdout.
 */
if (import.meta.main) {
  const subcommand = Bun.argv[2];

  const getArg = (name: string): string | undefined => {
    const prefix = `--${name}=`;
    const arg = Bun.argv.find((a) => a.startsWith(prefix));
    return arg ? arg.slice(prefix.length) : undefined;
  };

  if (subcommand === "compute") {
    const bv = Number(getArg("bv") ?? "5");
    const tc = Number(getArg("tc") ?? "5");
    const rr = Number(getArg("rr") ?? "5");
    const effort = Number(getArg("effort") ?? "3");
    const score = computeWSJF({
      business_value: bv,
      time_criticality: tc,
      risk_reduction: rr,
      effort_points: effort,
    });
    console.log(JSON.stringify({ score }, null, 2));
  } else if (subcommand === "rank") {
    const itemsJson = getArg("items") ?? "[]";
    const items: WSJFScoredItem[] = JSON.parse(itemsJson);
    const ranked = rankByWSJF(items);
    console.log(JSON.stringify(ranked, null, 2));
  } else {
    console.error("Usage: bun run scoring.ts <compute|rank> [options]");
    process.exit(1);
  }
}
```

### Task 2: Create src/planner/scoring.test.ts

**Goal:** Comprehensive tests for WSJF scoring functions.

**File:** `src/planner/scoring.test.ts` (new)

Write tests covering:

1. **computeWSJF:**
   - Standard computation: (8+5+3)/5 = 3.2
   - All maximum values: (10+10+10)/1 = 30
   - All minimum values: (1+1+1)/8 = 0.375
   - Division by zero safety: effort_points=0 returns 0
   - Equal cost-of-delay with different efforts produce different scores
   - Higher business_value produces higher score (all else equal)

2. **effortFromComplexity:**
   - Returns correct effort for each known complexity level (TRIVIAL=1, SIMPLE=2, MODERATE=3, COMPLEX=5, CRITICAL=8)
   - Returns 3 (MODERATE default) for unknown complexity strings
   - Case-sensitive: "trivial" (lowercase) returns default

3. **rankByWSJF:**
   - Items sorted by WSJF score descending
   - Equal WSJF scores sorted by effort ascending (prefer cheaper)
   - Returns new array (immutability check)
   - Empty array returns empty array
   - Single item returns same item in array
   - Preserves all item fields through sorting

4. **scoreItem:**
   - Computes correct effort from complexity
   - Computes correct WSJF score
   - Returns complete WSJFScoredItem with all fields
   - Works with each complexity level

**Note:** Barrel export updates for `src/planner/index.ts` are consolidated in Plan 18-03 Task 3 to avoid parallel modification conflicts in Wave 2.

## Verification Criteria

- [ ] `src/planner/scoring.ts` compiles with zero type errors
- [ ] `bun test src/planner/scoring.test.ts` passes all tests
- [ ] `bun run src/planner/scoring.ts compute --bv=8 --tc=5 --rr=3 --effort=5` outputs `{ "score": 3.2 }`
- [ ] `computeWSJF` formula is (BV + TC + RR) / effort
- [ ] `computeWSJF` returns 0 when effort_points is 0 (safety)
- [ ] `effortFromComplexity` returns correct values for all 5 levels
- [ ] `effortFromComplexity` returns 3 for unknown complexity strings
- [ ] `rankByWSJF` sorts descending by WSJF score
- [ ] `rankByWSJF` uses effort ascending as tiebreaker
- [ ] `rankByWSJF` returns a new array (does not mutate input)
- [ ] `scoreItem` computes effort and WSJF automatically from complexity
- [ ] Scoring exports in `src/planner/index.ts` are handled by Plan 18-03 Task 3
