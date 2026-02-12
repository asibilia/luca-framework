/**
 * WSJF (Weighted Shortest Job First) Scoring Engine.
 *
 * Provides pure-function utilities for computing WSJF scores,
 * mapping complexity levels to effort points, ranking items by
 * WSJF priority, and building scored items from raw inputs.
 *
 * WSJF Formula: (business_value + time_criticality + risk_reduction) / effort_points
 *
 * This module is the core scoring engine consumed by the session
 * scheduler (Plan 18-03) and weekly planner (Plan 18-05).
 *
 * @module planner/scoring
 */

import orderBy from "lodash/orderBy";

import type { ComplexityLevel } from "../complexity/types";
import type { WSJFInput, WSJFScoredItem } from "./types";
import { EFFORT_MAP } from "./defaults";

/**
 * Compute a WSJF score from raw input components.
 *
 * Formula: (business_value + time_criticality + risk_reduction) / effort_points
 *
 * Returns 0 when effort_points is 0 to prevent division-by-zero.
 *
 * @param input - WSJF input components (each factor 1-10, effort > 0)
 * @returns Computed WSJF score (higher = higher priority)
 *
 * @example
 * ```typescript
 * const score = computeWSJF({
 *   business_value: 8,
 *   time_criticality: 5,
 *   risk_reduction: 3,
 *   effort_points: 5,
 * });
 * // score === 3.2
 * ```
 */
export function computeWSJF(input: WSJFInput): number {
  if (input.effort_points === 0) {
    return 0;
  }
  return (
    (input.business_value + input.time_criticality + input.risk_reduction) /
    input.effort_points
  );
}

/**
 * Map a complexity level string to its effort point value.
 *
 * Uses the EFFORT_MAP from defaults.ts (Fibonacci-like proxy):
 * TRIVIAL=1, SIMPLE=2, MODERATE=3, COMPLEX=5, CRITICAL=8
 *
 * Returns 3 (MODERATE default) for unknown complexity strings,
 * including case mismatches (the lookup is case-sensitive).
 *
 * @param complexity - Complexity level string (should be uppercase)
 * @returns Effort points for the given complexity level
 *
 * @example
 * ```typescript
 * effortFromComplexity("TRIVIAL");  // 1
 * effortFromComplexity("COMPLEX");  // 5
 * effortFromComplexity("unknown");  // 3 (MODERATE default)
 * ```
 */
export function effortFromComplexity(complexity: string): number {
  const mapped = EFFORT_MAP[complexity as ComplexityLevel];
  return mapped ?? EFFORT_MAP.MODERATE;
}

/**
 * Rank scored items by WSJF score in descending order.
 *
 * Uses lodash/orderBy for stable sorting. Tiebreaker: when two items
 * share the same WSJF score, the one with lower effort_points ranks
 * higher (prefer cheaper work when priority is equal).
 *
 * Returns a new array -- the input array is not mutated.
 *
 * @param items - Array of WSJF-scored items to rank
 * @returns New array sorted by WSJF descending, then effort ascending
 *
 * @example
 * ```typescript
 * const ranked = rankByWSJF(items);
 * // ranked[0] has the highest WSJF score
 * ```
 */
export function rankByWSJF(items: WSJFScoredItem[]): WSJFScoredItem[] {
  return orderBy(
    items,
    [
      (item: WSJFScoredItem) => item.wsjf_score,
      (item: WSJFScoredItem) => item.wsjf_inputs.effort_points,
    ],
    ["desc", "asc"],
  );
}

/**
 * Convenience function to build a complete WSJFScoredItem.
 *
 * Combines effortFromComplexity and computeWSJF to produce a fully
 * scored item from raw inputs. This is the primary entry point for
 * constructing scored items from todo metadata.
 *
 * @param params - Raw item parameters including WSJF factors and metadata
 * @returns Complete WSJFScoredItem with computed effort and score
 *
 * @example
 * ```typescript
 * const item = scoreItem({
 *   todo_path: ".planning/backlog/improve-tests.md",
 *   title: "Improve test coverage",
 *   area: "quality",
 *   business_value: 7,
 *   time_criticality: 3,
 *   risk_reduction: 5,
 *   complexity: "MODERATE",
 *   dependency_free: true,
 * });
 * // item.wsjf_score === (7 + 3 + 5) / 3 === 5
 * ```
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

  const wsjfScore = computeWSJF(wsjfInputs);

  return {
    todo_path: params.todo_path,
    title: params.title,
    area: params.area,
    wsjf_inputs: wsjfInputs,
    wsjf_score: wsjfScore,
    complexity: params.complexity,
    dependency_free: params.dependency_free,
  };
}

/* ------------------------------------------------------------------ */
/*  CLI entry point                                                   */
/* ------------------------------------------------------------------ */

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
