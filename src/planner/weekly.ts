/**
 * Weekly Planner for the Luca usage-aware sprint planning system.
 *
 * Distributes WSJF-scored backlog items across multiple sessions in a
 * week, respecting the allocation percentages for four buckets:
 * needle_movers (60%), quick_wins (25%), maintenance (10%), reserve (5%).
 *
 * Functions:
 * - classifyBucket: Determine which allocation bucket an item belongs to
 * - partitionIntoBuckets: Split items into the 4 allocation buckets
 * - distributeWeekly: Build a complete WeeklyPlan across N sessions
 *
 * @module planner/weekly
 */

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
 * Keywords in the `area` field that indicate a maintenance item.
 *
 * Any item whose area (lowercased) contains one of these strings
 * is classified into the "maintenance" bucket.
 */
const MAINTENANCE_KEYWORDS = [
  "maintenance",
  "tech-debt",
  "docs",
  "cleanup",
  "documentation",
] as const;

/**
 * Classify a scored item into one of the four allocation buckets.
 *
 * Classification rules (evaluated in order):
 * 1. **maintenance**: area contains a maintenance keyword
 * 2. **needle_movers**: wsjf_score >= 3 AND effort_points >= 3
 * 3. **quick_wins**: wsjf_score >= 2 AND effort_points <= 2
 * 4. **reserve**: default for everything else
 *
 * @param item - A WSJF-scored backlog item
 * @returns The allocation bucket this item belongs to
 *
 * @example
 * ```typescript
 * classifyBucket({ area: "tech-debt", wsjf_score: 2, ... });
 * // => "maintenance"
 *
 * classifyBucket({ area: "feature", wsjf_score: 5, wsjf_inputs: { effort_points: 5 }, ... });
 * // => "needle_movers"
 *
 * classifyBucket({ area: "feature", wsjf_score: 3, wsjf_inputs: { effort_points: 1 }, ... });
 * // => "quick_wins"
 * ```
 */
export function classifyBucket(item: WSJFScoredItem): AllocationBucket {
  const areaLower = item.area.toLowerCase();

  // Rule 1: maintenance keywords in area
  for (const keyword of MAINTENANCE_KEYWORDS) {
    if (areaLower.includes(keyword)) {
      return "maintenance";
    }
  }

  // Rule 2: needle movers -- high impact AND substantial effort
  if (item.wsjf_score >= 3 && item.wsjf_inputs.effort_points >= 3) {
    return "needle_movers";
  }

  // Rule 3: quick wins -- decent priority AND low effort
  if (item.wsjf_score >= 2 && item.wsjf_inputs.effort_points <= 2) {
    return "quick_wins";
  }

  // Rule 4: everything else is reserve
  return "reserve";
}

/**
 * Partition items into the four allocation buckets, sorted by WSJF descending.
 *
 * Each item is classified via `classifyBucket` and placed into the
 * corresponding bucket array. Within each bucket, items are sorted by
 * WSJF score descending so the highest-priority items are consumed first
 * during budget allocation.
 *
 * @param items - Array of WSJF-scored items to partition
 * @returns Record mapping each AllocationBucket to its sorted items
 *
 * @example
 * ```typescript
 * const buckets = partitionIntoBuckets(items);
 * // buckets.needle_movers => sorted by WSJF desc
 * // buckets.quick_wins    => sorted by WSJF desc
 * // buckets.maintenance   => sorted by WSJF desc
 * // buckets.reserve       => sorted by WSJF desc
 * ```
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
  buckets.needle_movers = orderBy(buckets.needle_movers, "wsjf_score", "desc");
  buckets.quick_wins = orderBy(buckets.quick_wins, "wsjf_score", "desc");
  buckets.maintenance = orderBy(buckets.maintenance, "wsjf_score", "desc");
  buckets.reserve = orderBy(buckets.reserve, "wsjf_score", "desc");

  return buckets;
}

/**
 * Distribute backlog items across a weekly plan of N sessions.
 *
 * Algorithm:
 * 1. Partition items into the 4 allocation buckets
 * 2. Calculate the total effort budget from all items
 * 3. Compute per-bucket effort budgets proportional to allocation %
 * 4. Pull items from each bucket greedily up to its effort budget
 * 5. Rank all selected items by WSJF
 * 6. Distribute selected items across sessions using scheduleSession
 * 7. Remaining items go to the deferred list
 *
 * @param items - Array of WSJF-scored backlog items
 * @param sessionsCount - Number of sessions to plan (default 3)
 * @param config - Planner configuration for session scheduling
 * @returns A complete WeeklyPlan with sessions, deferred items, and allocation info
 *
 * @example
 * ```typescript
 * const plan = distributeWeekly(items, 3);
 * console.log(plan.sessions.length); // up to 3
 * console.log(plan.deferred.length); // items that didn't fit
 * ```
 */
export function distributeWeekly(
  items: WSJFScoredItem[],
  sessionsCount: number = 3,
  config: PlannerConfig = DEFAULT_PLANNER_CONFIG,
): WeeklyPlan {
  const allocation = config.weekly_allocation ?? DEFAULT_WEEKLY_ALLOCATION;

  // Step 1: Partition into buckets
  const buckets = partitionIntoBuckets(items);

  // Step 2: Calculate total available effort from all items
  const totalAvailableEffort = items.reduce(
    (sum, item) => sum + item.wsjf_inputs.effort_points,
    0,
  );

  // Step 3: Compute per-bucket effort budgets
  const budgets: Record<AllocationBucket, number> = {
    needle_movers: Math.floor(
      (totalAvailableEffort * allocation.needle_movers) / 100,
    ),
    quick_wins: Math.floor(
      (totalAvailableEffort * allocation.quick_wins) / 100,
    ),
    maintenance: Math.floor(
      (totalAvailableEffort * allocation.maintenance) / 100,
    ),
    reserve: Math.floor((totalAvailableEffort * allocation.reserve) / 100),
  };

  // Step 4: Pull items from each bucket up to budget
  const selected: WSJFScoredItem[] = [];
  const deferred: WSJFScoredItem[] = [];

  const bucketNames: AllocationBucket[] = [
    "needle_movers",
    "quick_wins",
    "maintenance",
    "reserve",
  ];

  for (const bucketName of bucketNames) {
    let spent = 0;
    const bucketItems = buckets[bucketName];
    const budget = budgets[bucketName];

    for (const item of bucketItems) {
      const effort = item.wsjf_inputs.effort_points;
      if (spent + effort <= budget) {
        selected.push(item);
        spent += effort;
      } else {
        deferred.push(item);
      }
    }
  }

  // Step 5: Rank selected items by WSJF
  const ranked = rankByWSJF(selected);

  // Step 6: Distribute across sessions
  const sessions: SessionPlan[] = [];
  let remaining = [...ranked];

  for (let i = 0; i < sessionsCount && remaining.length > 0; i++) {
    const sessionPlan = scheduleSession(remaining, config);
    sessions.push(sessionPlan);

    // Remove scheduled items from remaining pool
    const scheduledPaths = new Set(
      sessionPlan.items.map((item) => item.todo_path),
    );
    remaining = remaining.filter((item) => !scheduledPaths.has(item.todo_path));
  }

  // Any remaining items after all sessions go to deferred
  const allDeferred = rankByWSJF([...deferred, ...remaining]);

  // Calculate total effort across all sessions
  const totalEffort = sessions.reduce(
    (sum, session) => sum + session.total_effort_points,
    0,
  );

  return {
    generated_at: new Date().toISOString(),
    sessions_planned: sessions.length,
    allocation: {
      needle_movers: allocation.needle_movers,
      quick_wins: allocation.quick_wins,
      maintenance: allocation.maintenance,
      reserve: allocation.reserve,
    },
    sessions,
    deferred: allDeferred,
    total_effort_points: totalEffort,
  };
}

/* ------------------------------------------------------------------ */
/*  CLI entry point                                                    */
/* ------------------------------------------------------------------ */

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
