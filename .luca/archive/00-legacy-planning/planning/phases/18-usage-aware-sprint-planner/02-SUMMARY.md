---
plan_id: "18-02"
title: "WSJF Scoring Engine"
status: complete
wave: 2
commit: ea843ad
---

## Results

Both tasks completed successfully.

### Task 1: Scoring functions (`src/planner/scoring.ts`)

Created 4 exported functions:

- `computeWSJF(input: WSJFInput): number` — WSJF = (BV + TC + RR) / effort_points, with division-by-zero safety
- `effortFromComplexity(complexity: string): number` — Maps complexity string to effort points via EFFORT_MAP, defaults to 3 for unknown
- `rankByWSJF(items: WSJFScoredItem[]): WSJFScoredItem[]` — Stable sort by WSJF descending, effort ascending tiebreaker, uses lodash/orderBy
- `scoreItem(params): WSJFScoredItem` — Full scoring pipeline: complexity → effort → WSJF computation → scored item assembly

Also includes CLI runner (`bun run src/planner/scoring.ts`) for manual testing.

### Task 2: Tests (`src/planner/scoring.test.ts`)

25 tests covering:

- `computeWSJF`: Basic calculation, zero effort safety, minimum/maximum inputs
- `effortFromComplexity`: All 5 complexity levels, unknown level fallback
- `rankByWSJF`: Ordering, tiebreaking, empty/single arrays, stability
- `scoreItem`: Full pipeline integration, dependency_free flag, zone assignment

**Total: 25 tests pass, 59 expect() calls**

## Files Created

| File                          | Purpose             |
| ----------------------------- | ------------------- |
| `src/planner/scoring.ts`      | WSJF scoring engine |
| `src/planner/scoring.test.ts` | Scoring tests       |

## Dependencies Added

- `lodash` (4.17.23) — for `orderBy` stable sort
- `@types/lodash` (4.17.23) — TypeScript definitions
