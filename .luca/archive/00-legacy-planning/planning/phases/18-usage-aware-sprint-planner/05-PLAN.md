---
id: 18-05
title: Weekly Planner & Token Cost Model
phase: 18-usage-aware-sprint-planner
wave: 3
delivers: PLAN-05, PLAN-06
depends_on:
  - 18-01
  - 18-02
  - 18-03
tasks: 4
---

# Plan 18-05: Weekly Planner & Token Cost Model

## Objective

Implement the weekly planner that distributes work across multiple sessions within the weekly usage cap (60% needle movers, 25% quick wins, 10% maintenance, 5% reserve), and the token cost estimation model that tracks actual vs. estimated costs per task type and improves over time via MEMORY.md calibration. Adds a new `src/planner/weekly.ts` module and a `src/planner/cost-model.ts` module, both with co-located tests and CLI entry points.

## Context

- **Types from Plan 18-01:** `src/planner/types.ts` (SessionPlan, WeeklyPlan, AllocationBucket, TokenCostEstimate, WSJFScoredItem, PlannerConfig)
- **Defaults from Plan 18-01:** `src/planner/defaults.ts` (DEFAULT_WEEKLY_ALLOCATION, COLD_START_COSTS, DEFAULT_PLANNER_CONFIG, EFFORT_MAP)
- **Scoring from Plan 18-02:** `src/planner/scoring.ts` (rankByWSJF, scoreItem)
- **Scheduler from Plan 18-03:** `src/planner/scheduler.ts` (scheduleSession, estimateContextCost)
- **18-CONTEXT.md Decision 5:** Weekly allocation: 60% needle movers, 25% quick wins, 10% maintenance, 5% reserve
- **18-CONTEXT.md Decision 8:** Token cost model v1: context % with relative ordering, MEMORY.md calibration
- **Module pattern precedent:** `src/iteration/budget.ts` (pure functions, CLI entry point, Zod schema validation)
- **MEMORY.md calibration pattern:** Tag convention for storing learned estimates, cold-start defaults on first use

## Design Decisions Applied

1. **Bucket-based weekly allocation** (18-CONTEXT.md Decision 5): Classify each todo into a bucket, then fill sessions respecting ratios
2. **Bucket classification by WSJF + complexity** (heuristic): High WSJF + high effort = needle mover; low effort + high WSJF = quick win; area="maintenance"/"tech-debt" = maintenance
3. **Token cost calibration via MEMORY.md** (18-CONTEXT.md Decision 8): Store actual costs, compute rolling averages, update cold-start estimates
4. **Cold-start defaults** (18-CONTEXT.md Decision 8): Use COLD_START_COSTS on first use until calibrated
5. **Pure functions** (no-classes rule): All weekly/cost functions are stateless
6. **Immutable data** (lodash preference): Weekly plan returns new objects, never mutates inputs

## Files

### Create

- `src/planner/weekly.ts` -- Weekly planning functions
- `src/planner/weekly.test.ts` -- Tests for weekly planner
- `src/planner/cost-model.ts` -- Token cost estimation and calibration
- `src/planner/cost-model.test.ts` -- Tests for cost model

### Modify

- `src/planner/index.ts` -- Add weekly and cost-model function exports
- `.planning/config.json` -- Add `planner` configuration section

## Tasks

### Task 1: Create src/planner/cost-model.ts -- Token Cost Estimation

**Goal:** Implement token cost estimation with cold-start defaults and MEMORY.md calibration.

**File:** `src/planner/cost-model.ts` (new)

**Functions to implement:**

**1. `getColdStartCost(complexity: string): number`**

```typescript
import type { TokenCostEstimate } from "./types";
import { tokenCostEstimateSchema } from "./types";
import { COLD_START_COSTS } from "./defaults";
import type { ComplexityLevel } from "../complexity/types";

/**
 * Get the cold-start token cost estimate for a complexity level.
 *
 * Returns the default context percentage estimate from COLD_START_COSTS.
 * Used when no calibrated data exists yet.
 *
 * @param complexity - Complexity level string
 * @returns Estimated context percentage (0-100)
 */
export function getColdStartCost(complexity: string): number {
  return (
    COLD_START_COSTS[complexity as ComplexityLevel] ?? COLD_START_COSTS.MODERATE
  );
}
```

**2. `createCostEstimate(complexity: string, estimatedPercent?: number): TokenCostEstimate`**

```typescript
/**
 * Create a TokenCostEstimate for a complexity level.
 *
 * If no estimatedPercent is provided, uses the cold-start default.
 *
 * @param complexity - Complexity level string
 * @param estimatedPercent - Override estimated context percentage
 * @returns A new TokenCostEstimate
 */
export function createCostEstimate(
  complexity: string,
  estimatedPercent?: number,
): TokenCostEstimate {
  return tokenCostEstimateSchema.parse({
    complexity,
    estimated_context_percent: estimatedPercent ?? getColdStartCost(complexity),
    source: estimatedPercent !== undefined ? "calibrated" : "cold_start",
  });
}
```

**3. `calibrateCost(existing: TokenCostEstimate, actualPercent: number): TokenCostEstimate`**

```typescript
/**
 * Calibrate a cost estimate with actual observation data.
 *
 * Uses exponential moving average: new_estimate = (old * count + actual) / (count + 1).
 * Transitions source from "cold_start" to "calibrated" after first observation.
 *
 * Returns a NEW TokenCostEstimate (immutable).
 *
 * @param existing - Current cost estimate
 * @param actualPercent - Actual context percentage observed
 * @returns Updated TokenCostEstimate with calibrated values
 */
export function calibrateCost(
  existing: TokenCostEstimate,
  actualPercent: number,
): TokenCostEstimate {
  const newCount = existing.sample_count + 1;
  const newEstimate =
    (existing.estimated_context_percent * existing.sample_count +
      actualPercent) /
    newCount;

  return {
    ...existing,
    estimated_context_percent: Math.round(newEstimate * 10) / 10,
    actual_context_percent: actualPercent,
    sample_count: newCount,
    source: "calibrated",
  };
}
```

**4. `buildCostTable(calibrations?: Record<string, TokenCostEstimate>): Record<string, TokenCostEstimate>`**

```typescript
/**
 * Build a complete cost table for all complexity levels.
 *
 * Merges calibrated values with cold-start defaults. If a calibration
 * exists for a level, it is used; otherwise the cold-start default is used.
 *
 * @param calibrations - Optional map of complexity -> calibrated estimate
 * @returns Complete cost table with entries for all 5 complexity levels
 */
export function buildCostTable(
  calibrations?: Record<string, TokenCostEstimate>,
): Record<string, TokenCostEstimate> {
  const levels = ["TRIVIAL", "SIMPLE", "MODERATE", "COMPLEX", "CRITICAL"];
  const table: Record<string, TokenCostEstimate> = {};

  for (const level of levels) {
    table[level] = calibrations?.[level] ?? createCostEstimate(level);
  }

  return table;
}
```

**5. `formatCostTableForMemory(table: Record<string, TokenCostEstimate>): string`**

```typescript
/**
 * Format a cost table as a MEMORY.md-compatible string.
 *
 * Produces a markdown table that can be stored as a MEMORY.md pattern
 * entry for cross-session calibration persistence.
 *
 * @param table - Complete cost table
 * @returns Markdown-formatted cost table string
 */
export function formatCostTableForMemory(
  table: Record<string, TokenCostEstimate>,
): string {
  const lines = [
    "| Complexity | Estimated % | Actual % | Samples | Source |",
    "|-----------|------------|---------|---------|--------|",
  ];

  for (const [level, estimate] of Object.entries(table)) {
    lines.push(
      `| ${level} | ${estimate.estimated_context_percent}% | ${estimate.actual_context_percent ?? "N/A"}% | ${estimate.sample_count} | ${estimate.source} |`,
    );
  }

  return lines.join("\n");
}
```

**CLI entry point:**

```typescript
/**
 * CLI entry point for token cost model operations.
 *
 * Usage:
 *   bun run src/planner/cost-model.ts cold-start --complexity=COMPLEX
 *   bun run src/planner/cost-model.ts table
 *   bun run src/planner/cost-model.ts calibrate \
 *     --complexity=MODERATE --actual=25 --current='{ ... }'
 *
 * Outputs JSON or markdown to stdout.
 */
if (import.meta.main) {
  const subcommand = Bun.argv[2];

  const getArg = (name: string): string | undefined => {
    const prefix = `--${name}=`;
    const arg = Bun.argv.find((a) => a.startsWith(prefix));
    return arg ? arg.slice(prefix.length) : undefined;
  };

  if (subcommand === "cold-start") {
    const complexity = getArg("complexity") ?? "MODERATE";
    const cost = getColdStartCost(complexity);
    console.log(JSON.stringify({ complexity, cost }, null, 2));
  } else if (subcommand === "table") {
    const table = buildCostTable();
    console.log(JSON.stringify(table, null, 2));
  } else if (subcommand === "calibrate") {
    const complexity = getArg("complexity") ?? "MODERATE";
    const actual = Number(getArg("actual") ?? "20");
    const existing = createCostEstimate(complexity);
    const calibrated = calibrateCost(existing, actual);
    console.log(JSON.stringify(calibrated, null, 2));
  } else {
    console.error(
      "Usage: bun run cost-model.ts <cold-start|table|calibrate> [options]",
    );
    process.exit(1);
  }
}
```

### Task 2: Create src/planner/weekly.ts -- Weekly Planner

**Goal:** Implement weekly planning with bucket-based allocation across multiple sessions.

**File:** `src/planner/weekly.ts` (new)

**Functions to implement:**

**1. `classifyBucket(item: WSJFScoredItem): AllocationBucket`**

```typescript
import orderBy from "lodash/orderBy";

import type {
  WSJFScoredItem,
  SessionPlan,
  WeeklyPlan,
  AllocationBucket,
  PlannerConfig,
} from "./types";
import {
  DEFAULT_WEEKLY_ALLOCATION,
  DEFAULT_PLANNER_CONFIG,
  EFFORT_MAP,
} from "./defaults";
import { scheduleSession } from "./scheduler";
import { rankByWSJF } from "./scoring";

/**
 * Classify a scored item into a weekly allocation bucket.
 *
 * Classification heuristic:
 * - needle_movers: WSJF >= 3 AND effort >= 3 (high-impact, substantial work)
 * - quick_wins: WSJF >= 2 AND effort <= 2 (valuable, low effort)
 * - maintenance: area contains "maintenance", "tech-debt", "docs", "cleanup"
 * - reserve: everything else (default bucket)
 *
 * @param item - WSJF-scored item
 * @returns The allocation bucket this item belongs to
 */
export function classifyBucket(item: WSJFScoredItem): AllocationBucket {
  const maintenanceAreas = [
    "maintenance",
    "tech-debt",
    "docs",
    "cleanup",
    "documentation",
  ];
  if (maintenanceAreas.some((a) => item.area.toLowerCase().includes(a))) {
    return "maintenance";
  }
  if (item.wsjf_score >= 3 && item.wsjf_inputs.effort_points >= 3) {
    return "needle_movers";
  }
  if (item.wsjf_score >= 2 && item.wsjf_inputs.effort_points <= 2) {
    return "quick_wins";
  }
  return "reserve";
}
```

**2. `partitionIntoBuckets(items: WSJFScoredItem[]): Record<AllocationBucket, WSJFScoredItem[]>`**

```typescript
/**
 * Partition items into allocation buckets.
 *
 * Each item is classified into exactly one bucket. Within each bucket,
 * items are sorted by WSJF descending.
 *
 * @param items - Array of WSJF-scored items
 * @returns Record mapping each bucket to its sorted items
 */
export function partitionIntoBuckets(
  items: WSJFScoredItem[],
): Record<AllocationBucket, WSJFScoredItem[]> {
  const buckets: Record<AllocationBucket, WSJFScoredItem[]> = {
    needle_movers: [],
    quick_wins: [],
    maintenance: [],
    reserve: [],
  };

  for (const item of items) {
    const bucket = classifyBucket(item);
    buckets[bucket].push(item);
  }

  // Sort each bucket by WSJF descending
  for (const key of Object.keys(buckets) as AllocationBucket[]) {
    buckets[key] = rankByWSJF(buckets[key]);
  }

  return buckets;
}
```

**3. `distributeWeekly(items: WSJFScoredItem[], sessionsCount: number, config?: PlannerConfig): WeeklyPlan`**

```typescript
/**
 * Distribute items across multiple sessions respecting weekly allocation ratios.
 *
 * Algorithm:
 * 1. Partition items into buckets (needle_movers, quick_wins, maintenance, reserve)
 * 2. Calculate effort budget per bucket based on total available effort and allocation %
 * 3. Pull items from each bucket up to its effort budget
 * 4. Combine into a unified list and schedule individual sessions
 * 5. Deferred items go into the deferred list
 *
 * @param items - Array of WSJF-scored items (full backlog)
 * @param sessionsCount - Number of sessions to plan for this week
 * @param config - Planner configuration (defaults to DEFAULT_PLANNER_CONFIG)
 * @returns A complete weekly plan with per-session plans and deferred items
 */
export function distributeWeekly(
  items: WSJFScoredItem[],
  sessionsCount: number,
  config: PlannerConfig = DEFAULT_PLANNER_CONFIG,
): WeeklyPlan {
  const buckets = partitionIntoBuckets(items);
  const allocation = config.weekly_allocation;

  // Calculate total effort budget for the week (rough: sessionsCount * 70% max context / avg cost)
  // Simplified: use sum of all item effort points as total backlog, allocate proportionally
  const totalBacklogEffort = items.reduce(
    (sum, i) => sum + i.wsjf_inputs.effort_points,
    0,
  );

  // Calculate per-bucket effort budgets
  const budgets: Record<AllocationBucket, number> = {
    needle_movers: Math.round(
      (totalBacklogEffort * allocation.needle_movers) / 100,
    ),
    quick_wins: Math.round((totalBacklogEffort * allocation.quick_wins) / 100),
    maintenance: Math.round(
      (totalBacklogEffort * allocation.maintenance) / 100,
    ),
    reserve: Math.round((totalBacklogEffort * allocation.reserve) / 100),
  };

  // Pull items from each bucket up to its effort budget
  const selectedItems: WSJFScoredItem[] = [];
  const deferredItems: WSJFScoredItem[] = [];

  for (const bucketName of [
    "needle_movers",
    "quick_wins",
    "maintenance",
    "reserve",
  ] as AllocationBucket[]) {
    let remainingBudget = budgets[bucketName];
    for (const item of buckets[bucketName]) {
      if (remainingBudget >= item.wsjf_inputs.effort_points) {
        selectedItems.push(item);
        remainingBudget -= item.wsjf_inputs.effort_points;
      } else {
        deferredItems.push(item);
      }
    }
  }

  // Distribute selected items across sessions
  const sessions: SessionPlan[] = [];
  let remainingItems = rankByWSJF(selectedItems);

  for (let i = 0; i < sessionsCount && remainingItems.length > 0; i++) {
    const sessionPlan = scheduleSession(remainingItems, config);
    sessions.push(sessionPlan);

    // Remove scheduled items from remaining
    const scheduledPaths = new Set(sessionPlan.items.map((si) => si.todo_path));
    remainingItems = remainingItems.filter(
      (item) => !scheduledPaths.has(item.todo_path),
    );
  }

  // Any items that didn't fit into sessions go to deferred
  deferredItems.push(...remainingItems);

  const totalEffort = sessions.reduce(
    (sum, s) => sum + s.total_effort_points,
    0,
  );

  return {
    generated_at: new Date().toISOString(),
    sessions_planned: sessions.length,
    allocation: { ...allocation },
    sessions,
    deferred: deferredItems,
    total_effort_points: totalEffort,
  };
}
```

**CLI entry point:**

```typescript
/**
 * CLI entry point for weekly planning.
 *
 * Usage:
 *   bun run src/planner/weekly.ts plan \
 *     --items='[{ ... WSJFScoredItem JSON array ... }]' \
 *     --sessions=3
 *
 *   bun run src/planner/weekly.ts classify \
 *     --item='{ ... WSJFScoredItem JSON ... }'
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

  if (subcommand === "plan") {
    const itemsJson = getArg("items") ?? "[]";
    const sessions = Number(getArg("sessions") ?? "3");
    const items: WSJFScoredItem[] = JSON.parse(itemsJson);
    const plan = distributeWeekly(items, sessions);
    console.log(JSON.stringify(plan, null, 2));
  } else if (subcommand === "classify") {
    const itemJson = getArg("item") ?? "{}";
    const item: WSJFScoredItem = JSON.parse(itemJson);
    const bucket = classifyBucket(item);
    console.log(JSON.stringify({ bucket }, null, 2));
  } else {
    console.error("Usage: bun run weekly.ts <plan|classify> [options]");
    process.exit(1);
  }
}
```

### Task 3: Write tests for cost-model and weekly planner

**Goal:** Comprehensive tests for both modules.

**File:** `src/planner/cost-model.test.ts` (new)

Write tests covering:

1. **getColdStartCost:**
   - Returns correct cost for each complexity level (TRIVIAL=5, SIMPLE=10, MODERATE=20, COMPLEX=35, CRITICAL=50)
   - Returns MODERATE default (20) for unknown complexity

2. **createCostEstimate:**
   - Creates cold_start estimate with default percentage
   - Creates calibrated estimate with custom percentage
   - Applies Zod defaults (sample_count=0, source="cold_start")

3. **calibrateCost:**
   - First calibration: (cold_start \* 0 + actual) / 1 = actual
   - Second calibration: rolling average
   - Transitions source to "calibrated"
   - Returns new object (immutability check)
   - Updates sample_count

4. **buildCostTable:**
   - Returns entries for all 5 complexity levels
   - Uses cold-start defaults when no calibrations provided
   - Merges calibrated values when provided
   - Cold-start levels not overridden remain

5. **formatCostTableForMemory:**
   - Produces valid markdown table
   - Contains all 5 complexity levels
   - Shows "N/A" for missing actual_context_percent
   - Shows numeric values for calibrated estimates

**File:** `src/planner/weekly.test.ts` (new)

Write tests covering:

1. **classifyBucket:**
   - High WSJF + high effort = needle_movers
   - High WSJF + low effort = quick_wins
   - Area contains "maintenance" = maintenance
   - Area contains "tech-debt" = maintenance
   - Area contains "docs" = maintenance
   - Default bucket = reserve

2. **partitionIntoBuckets:**
   - Returns all 4 bucket keys
   - Each item appears in exactly one bucket
   - Items within each bucket sorted by WSJF descending
   - Empty input returns empty buckets

3. **distributeWeekly:**
   - Produces correct number of sessions (or fewer if not enough items)
   - Allocation respects 60/25/10/5 split approximately
   - Deferred items are items that exceeded budget
   - Sessions are individually valid SessionPlan objects
   - Total effort across sessions matches selected items
   - Works with empty item list (0 sessions)
   - Works with single item (1 session, 1 item)

### Task 4: Update planner index and config.json

**Goal:** Add weekly and cost-model exports to barrel, add planner config section.

**File:** `src/planner/index.ts` (modify)

Add these exports after the scheduler exports:

```typescript
// Weekly planning
export {
  classifyBucket,
  partitionIntoBuckets,
  distributeWeekly,
} from "./weekly";

// Token cost model
export {
  getColdStartCost,
  createCostEstimate,
  calibrateCost,
  buildCostTable,
  formatCostTableForMemory,
} from "./cost-model";
```

**File:** `.planning/config.json` (modify)

Add a new top-level `planner` section after the `iteration` section (or after whichever section comes last):

```json
{
  "planner": {
    "session_cap_minutes": 180,
    "weekly_allocation": {
      "needle_movers": 60,
      "quick_wins": 25,
      "maintenance": 10,
      "reserve": 5
    },
    "zone_boundaries": {
      "peak_end": 30,
      "good_end": 50,
      "degrading_end": 70
    },
    "cold_start_costs": {
      "TRIVIAL": 5,
      "SIMPLE": 10,
      "MODERATE": 20,
      "COMPLEX": 35,
      "CRITICAL": 50
    }
  }
}
```

## Verification Criteria

- [ ] `src/planner/cost-model.ts` compiles with zero type errors
- [ ] `src/planner/weekly.ts` compiles with zero type errors
- [ ] `bun test src/planner/cost-model.test.ts` passes all tests
- [ ] `bun test src/planner/weekly.test.ts` passes all tests
- [ ] `bun run src/planner/cost-model.ts cold-start --complexity=COMPLEX` outputs `{ "complexity": "COMPLEX", "cost": 35 }`
- [ ] `bun run src/planner/cost-model.ts table` outputs entries for all 5 levels
- [ ] `getColdStartCost` returns correct default for each level
- [ ] `calibrateCost` produces rolling average correctly
- [ ] `calibrateCost` returns new object (does not mutate input)
- [ ] `formatCostTableForMemory` produces valid markdown table
- [ ] `classifyBucket` correctly classifies needle_movers, quick_wins, maintenance
- [ ] `distributeWeekly` respects allocation ratios approximately
- [ ] `distributeWeekly` distributes items across requested sessions
- [ ] Deferred items are those that exceeded weekly budget
- [ ] `.planning/config.json` has `planner` section with correct defaults
- [ ] `plannerConfigSchema` from 18-01 types can parse the new config.json planner section
- [ ] `src/planner/index.ts` exports all weekly and cost-model functions
