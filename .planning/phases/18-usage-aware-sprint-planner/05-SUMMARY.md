---
plan_id: "18-05"
title: "Weekly Planner & Token Cost Model"
status: complete
wave: 3
commit: 11d9301
---

## Results

All 4 tasks completed successfully.

### Task 1: Token cost model (`src/planner/cost-model.ts`)

Created 5 exported functions:

- `getColdStartCost(complexity, config?): number` — Returns cold-start context % for a complexity level
- `createCostEstimate(complexity, config?): TokenCostEstimate` — Creates initial estimate from cold-start defaults
- `calibrateCost(existing, actual): TokenCostEstimate` — Rolling average: `(est * count + actual) / (count + 1)`, increments sample_count, marks source as "calibrated"
- `buildCostTable(complexities, config?): TokenCostEstimate[]` — Creates full table for a list of complexity levels
- `formatCostTableForMemory(table): string` — Formats as markdown table for MEMORY.md persistence

Also includes CLI runner for manual testing.

### Task 2: Weekly planner (`src/planner/weekly.ts`)

Created 3 exported functions:

- `classifyBucket(item): AllocationBucket` — Classifies items into allocation buckets:
  - Maintenance areas (docs, debt, cleanup) → `maintenance`
  - High WSJF + high effort (>= 3) → `needle_movers`
  - High WSJF + low effort → `quick_wins`
  - Default → `reserve`
- `partitionIntoBuckets(items): Record<AllocationBucket, WSJFScoredItem[]>` — Groups items by bucket
- `distributeWeekly(items, sessionsPlanned, config?): WeeklyPlan` — Full weekly plan:
  - Proportional budget allocation (60/25/10/5)
  - Multi-session distribution via `scheduleSession`
  - Deferred items tracking

Also includes CLI runner.

### Task 3: Tests

- `cost-model.test.ts` — 25 tests covering all 5 functions
- `weekly.test.ts` — 29 tests covering classification, partitioning, distribution

**Total: 54 tests pass**

### Task 4: Config integration (`.planning/config.json`)

Added `"planner"` section with:

- `session_cap_minutes: 180`
- `weekly_allocation: { needle_movers: 60, quick_wins: 25, maintenance: 10, reserve: 5 }`
- `zone_boundaries: { peak_end: 30, good_end: 50, degrading_end: 70 }`
- `cold_start_costs: { TRIVIAL: 5, SIMPLE: 10, MODERATE: 20, COMPLEX: 35, CRITICAL: 50 }`

## Files Created/Modified

| File                             | Action   | Purpose                           |
| -------------------------------- | -------- | --------------------------------- |
| `src/planner/cost-model.ts`      | Created  | Token cost estimation             |
| `src/planner/cost-model.test.ts` | Created  | Cost model tests                  |
| `src/planner/weekly.ts`          | Created  | Weekly planning                   |
| `src/planner/weekly.test.ts`     | Created  | Weekly planner tests              |
| `src/planner/index.ts`           | Modified | Added weekly + cost-model exports |
| `.planning/config.json`          | Modified | Added planner configuration       |

## Deviations

None — implementation matches plan specification.
