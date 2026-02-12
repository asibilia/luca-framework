/**
 * Session scheduler for the Luca usage-aware sprint planning system.
 *
 * Implements the core scheduling algorithm that:
 * 1. Selects a Big Rock (highest WSJF dependency-free item) as the first task
 * 2. Fills remaining session capacity with WSJF-ordered tail items
 * 3. Assigns quality zones based on cumulative context consumption
 * 4. Generates Mermaid gantt charts and human-readable rationale
 *
 * The scheduler respects the MAX_CONTEXT_PERCENT budget (70%) and always
 * includes at least one item per session. Items are stamped with their
 * advisory quality zone so downstream consumers know expected quality.
 *
 * @module planner/scheduler
 */
import orderBy from "lodash/orderBy";

import type {
  WSJFScoredItem,
  SessionPlan,
  QualityZone,
  ZoneBoundary,
  PlannerConfig,
} from "./types";
import {
  DEFAULT_ZONE_BOUNDARIES,
  COLD_START_COSTS,
  DEFAULT_SESSION_CAP_MINUTES,
  MAX_CONTEXT_PERCENT,
  DEFAULT_PLANNER_CONFIG,
} from "./defaults";
import type { ComplexityLevel } from "../complexity/types";

/**
 * Select the Big Rock for the session: the highest-WSJF dependency-free item.
 *
 * The Big Rock is always scheduled first so it executes in the peak quality
 * zone. Only items where `dependency_free === true` are eligible.
 *
 * @param items - Array of WSJF-scored items to consider
 * @returns The highest-WSJF dependency-free item, or null if none qualify
 *
 * @example
 * ```typescript
 * const items = [
 *   { todo_path: "a.md", wsjf_score: 10, dependency_free: true, ... },
 *   { todo_path: "b.md", wsjf_score: 15, dependency_free: false, ... },
 * ];
 * const rock = selectBigRock(items);
 * // rock => item "a.md" (b.md excluded because dependency_free=false)
 * ```
 */
export function selectBigRock(items: WSJFScoredItem[]): WSJFScoredItem | null {
  const eligible = items.filter((item) => item.dependency_free === true);
  if (eligible.length === 0) return null;
  const sorted = orderBy(eligible, "wsjf_score", "desc");
  return sorted[0] ?? null;
}

/**
 * Estimate the context cost (as a percentage) for a given complexity level.
 *
 * Looks up the complexity string in the config's cold_start_costs map.
 * Unknown complexity strings default to the MODERATE cost (20%).
 *
 * @param complexity - Complexity level string (e.g., "COMPLEX", "TRIVIAL")
 * @param config - Planner configuration with cold_start_costs. Defaults to DEFAULT_PLANNER_CONFIG.
 * @returns Estimated context percentage consumed by a task of this complexity
 *
 * @example
 * ```typescript
 * estimateContextCost("COMPLEX"); // => 35
 * estimateContextCost("UNKNOWN"); // => 20 (falls back to MODERATE)
 * ```
 */
export function estimateContextCost(
  complexity: string,
  config: PlannerConfig = DEFAULT_PLANNER_CONFIG,
): number {
  const costs = config.cold_start_costs as Record<string, number>;
  return costs[complexity] ?? costs["MODERATE"] ?? COLD_START_COSTS.MODERATE;
}

/**
 * Assign a quality zone based on cumulative context percentage consumed.
 *
 * Iterates through the zone boundaries to find where `cumulativePercent`
 * falls (start_percent inclusive, end_percent exclusive). Returns "stop"
 * if the percentage is beyond all defined boundaries.
 *
 * @param cumulativePercent - Current cumulative context usage percentage (0-100+)
 * @param boundaries - Zone boundary definitions. Defaults to DEFAULT_ZONE_BOUNDARIES.
 * @returns The quality zone label for the given context usage level
 *
 * @example
 * ```typescript
 * assignQualityZone(15);  // => "peak"
 * assignQualityZone(40);  // => "good"
 * assignQualityZone(55);  // => "degrading"
 * assignQualityZone(80);  // => "stop"
 * ```
 */
export function assignQualityZone(
  cumulativePercent: number,
  boundaries: ZoneBoundary[] = DEFAULT_ZONE_BOUNDARIES,
): QualityZone {
  for (const boundary of boundaries) {
    if (
      cumulativePercent >= boundary.start_percent &&
      cumulativePercent < boundary.end_percent
    ) {
      return boundary.zone;
    }
  }
  return "stop";
}

/**
 * Build a human-readable rationale string explaining the session plan.
 *
 * Mentions the Big Rock title and WSJF score if present, counts tail items,
 * and reports total effort points across the session.
 *
 * @param items - Ordered list of items in the session plan
 * @param bigRock - The selected Big Rock item, or null if none was selected
 * @returns Human-readable rationale string
 */
function buildRationale(
  items: WSJFScoredItem[],
  bigRock: WSJFScoredItem | null,
): string {
  if (items.length === 0) {
    return "Empty session: no items to schedule.";
  }

  const parts: string[] = [];

  if (bigRock) {
    parts.push(
      `Big Rock: "${bigRock.title}" (WSJF ${bigRock.wsjf_score.toFixed(1)})`,
    );
  }

  const tailCount = bigRock ? items.length - 1 : items.length;
  if (tailCount > 0) {
    parts.push(`${tailCount} tail item${tailCount === 1 ? "" : "s"} by WSJF`);
  }

  const totalEffort = items.reduce(
    (sum, item) => sum + item.wsjf_inputs.effort_points,
    0,
  );
  parts.push(`total effort: ${totalEffort} points`);

  return parts.join("; ") + ".";
}

/**
 * Generate a Mermaid gantt chart from an ordered list of session items.
 *
 * Groups items into sections by their assigned quality zone and creates
 * task entries with durations based on effort_points. Colons in task
 * titles are replaced with " -" for Mermaid syntax compatibility.
 *
 * @param items - Ordered list of items with assigned_zone populated
 * @returns Mermaid gantt chart source string, or empty string for empty input
 *
 * @example
 * ```typescript
 * const chart = generateMermaidGantt(scheduledItems);
 * // Returns:
 * // gantt
 * //   title Session Plan
 * //   dateFormat X
 * //   axisFormat %s
 * //   section peak
 * //   Build auth module : 0, 5
 * //   ...
 * ```
 */
export function generateMermaidGantt(items: WSJFScoredItem[]): string {
  if (items.length === 0) return "";

  const lines: string[] = [
    "gantt",
    "  title Session Plan",
    "  dateFormat X",
    "  axisFormat %s",
  ];

  let currentZone: QualityZone | null = null;
  let offset = 0;

  for (const item of items) {
    const zone = item.assigned_zone ?? "stop";
    if (zone !== currentZone) {
      currentZone = zone;
      lines.push(`  section ${zone}`);
    }

    const safeTitle = item.title.replace(/:/g, " -");
    const duration = item.wsjf_inputs.effort_points;
    lines.push(`  ${safeTitle} : ${offset}, ${duration}`);
    offset += duration;
  }

  return lines.join("\n");
}

/**
 * Schedule a session by selecting a Big Rock first, then greedily filling
 * remaining capacity with WSJF-ordered items within the context budget.
 *
 * The algorithm:
 * 1. Select the Big Rock (highest-WSJF dependency-free item)
 * 2. Build a queue: Big Rock first, then remaining items sorted by WSJF desc
 * 3. Greedily add items while cumulative context cost <= MAX_CONTEXT_PERCENT
 * 4. Always include at least one item even if it exceeds the budget
 * 5. Assign quality zones and generate gantt chart + rationale
 *
 * @param items - Array of WSJF-scored items to schedule
 * @param config - Planner configuration. Defaults to DEFAULT_PLANNER_CONFIG.
 * @returns A complete SessionPlan with ordered items, zones, gantt, and rationale
 *
 * @example
 * ```typescript
 * const items = rankByWSJF(scoredItems);
 * const plan = scheduleSession(items);
 * console.log(plan.rationale);
 * console.log(plan.mermaid_gantt);
 * ```
 */
export function scheduleSession(
  items: WSJFScoredItem[],
  config: PlannerConfig = DEFAULT_PLANNER_CONFIG,
): SessionPlan {
  if (items.length === 0) {
    return {
      generated_at: new Date().toISOString(),
      session_cap_minutes: config.session_cap_minutes,
      total_effort_points: 0,
      items: [],
      rationale: buildRationale([], null),
    };
  }

  const bigRock = selectBigRock(items);

  // Build queue: Big Rock first, then remaining by WSJF desc
  const remaining = bigRock
    ? items.filter((item) => item.todo_path !== bigRock.todo_path)
    : [...items];
  const sortedRemaining = orderBy(remaining, "wsjf_score", "desc");

  const queue: WSJFScoredItem[] = bigRock
    ? [bigRock, ...sortedRemaining]
    : sortedRemaining;

  // Greedily fill within context budget
  const scheduled: WSJFScoredItem[] = [];
  let cumulativeContextPercent = 0;

  for (let i = 0; i < queue.length; i++) {
    const item = queue[i]!;
    const cost = estimateContextCost(item.complexity, config);

    // Always include at least one item
    if (
      scheduled.length > 0 &&
      cumulativeContextPercent + cost > MAX_CONTEXT_PERCENT
    ) {
      break;
    }

    const zone = assignQualityZone(cumulativeContextPercent);
    const scheduledItem: WSJFScoredItem = {
      ...item,
      assigned_zone: zone,
    };
    scheduled.push(scheduledItem);
    cumulativeContextPercent += cost;
  }

  const totalEffort = scheduled.reduce(
    (sum, item) => sum + item.wsjf_inputs.effort_points,
    0,
  );

  const bigRockIndex =
    bigRock &&
    scheduled.length > 0 &&
    scheduled[0]!.todo_path === bigRock.todo_path
      ? 0
      : undefined;

  const mermaidGantt = generateMermaidGantt(scheduled);
  const rationale = buildRationale(scheduled, bigRock);

  return {
    generated_at: new Date().toISOString(),
    session_cap_minutes: config.session_cap_minutes,
    total_effort_points: totalEffort,
    items: scheduled,
    big_rock_index: bigRockIndex,
    mermaid_gantt: mermaidGantt,
    rationale,
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

  if (subcommand === "schedule") {
    const itemsJson = getArg("items") ?? "[]";
    const items: WSJFScoredItem[] = JSON.parse(itemsJson);
    const plan = scheduleSession(items);
    console.log(JSON.stringify(plan, null, 2));
  } else if (subcommand === "big-rock") {
    const itemsJson = getArg("items") ?? "[]";
    const items: WSJFScoredItem[] = JSON.parse(itemsJson);
    const rock = selectBigRock(items);
    console.log(JSON.stringify(rock, null, 2));
  } else if (subcommand === "zone") {
    const percent = Number(getArg("percent") ?? "0");
    const zone = assignQualityZone(percent);
    console.log(JSON.stringify({ percent, zone }, null, 2));
  } else {
    console.error(
      "Usage: bun run scheduler.ts <schedule|big-rock|zone> [options]",
    );
    process.exit(1);
  }
}
