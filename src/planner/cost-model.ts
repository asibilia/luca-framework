/**
 * Token Cost Model for the Luca usage-aware sprint planning system.
 *
 * Provides pure-function utilities for estimating, calibrating, and
 * formatting context-percentage costs per complexity level. Cold-start
 * costs provide initial guesses; calibration refines estimates over
 * time using a rolling average of actual observations.
 *
 * Functions:
 * - getColdStartCost: Lookup cold-start context percentage for a complexity
 * - createCostEstimate: Build a validated TokenCostEstimate from inputs
 * - calibrateCost: Rolling-average update of an existing estimate
 * - buildCostTable: Full table of estimates for all 5 complexity levels
 * - formatCostTableForMemory: Render the table as markdown for MEMORY.md
 *
 * @module planner/cost-model
 */

import type { ComplexityLevel } from "~/complexity/complexity.schemas";
import type { TokenCostEstimate } from "./planner.schemas";
import { tokenCostEstimateSchema } from "./planner.schemas";
import { COLD_START_COSTS } from "./defaults";

/**
 * Look up the cold-start context percentage for a given complexity level.
 *
 * Returns the pre-configured cost from COLD_START_COSTS. Unknown or
 * unrecognised complexity strings fall back to the MODERATE cost (20%).
 *
 * @param complexity - Complexity level string (e.g., "COMPLEX", "TRIVIAL")
 * @returns Estimated context percentage consumed (cold-start default)
 *
 * @example
 * ```typescript
 * getColdStartCost("COMPLEX");  // => 35
 * getColdStartCost("UNKNOWN");  // => 20 (MODERATE fallback)
 * ```
 */
export function getColdStartCost(complexity: string): number {
  const costs = COLD_START_COSTS as Record<string, number>;
  return costs[complexity] ?? costs["MODERATE"] ?? 20;
}

/**
 * Create a validated TokenCostEstimate for a complexity level.
 *
 * When `estimatedPercent` is provided, the estimate source is "calibrated"
 * (the caller has a known value). When omitted, the cold-start default is
 * used and source is "cold_start".
 *
 * The result is parsed through tokenCostEstimateSchema to ensure all
 * fields satisfy Zod constraints and defaults are applied.
 *
 * @param complexity - Complexity level string
 * @param estimatedPercent - Optional override for the estimated context percentage
 * @returns A validated TokenCostEstimate object
 *
 * @example
 * ```typescript
 * // Cold-start estimate
 * const est = createCostEstimate("COMPLEX");
 * // est.estimated_context_percent === 35, est.source === "cold_start"
 *
 * // Calibrated estimate
 * const cal = createCostEstimate("COMPLEX", 28);
 * // cal.estimated_context_percent === 28, cal.source === "calibrated"
 * ```
 */
export function createCostEstimate(
  complexity: string,
  estimatedPercent?: number,
): TokenCostEstimate {
  const hasCalibration = estimatedPercent !== undefined;
  const percent = hasCalibration
    ? estimatedPercent
    : getColdStartCost(complexity);
  const source = hasCalibration ? "calibrated" : "cold_start";

  return tokenCostEstimateSchema.parse({
    complexity,
    estimated_context_percent: percent,
    sample_count: hasCalibration ? 1 : 0,
    source,
  });
}

/**
 * Calibrate an existing TokenCostEstimate with a new actual observation.
 *
 * Uses a rolling average formula:
 *   new_estimate = (estimated * sample_count + actual) / (sample_count + 1)
 *
 * The result is rounded to 1 decimal place for readability. The sample
 * count is incremented, source set to "calibrated", and a NEW object is
 * returned (the input is not mutated).
 *
 * @param existing - The current estimate to update
 * @param actualPercent - The actual context percentage observed
 * @returns A new TokenCostEstimate with the updated rolling average
 *
 * @example
 * ```typescript
 * const cold = createCostEstimate("COMPLEX"); // est=35, samples=0
 * const cal1 = calibrateCost(cold, 30);       // est=30, samples=1
 * const cal2 = calibrateCost(cal1, 28);       // est=29, samples=2
 * ```
 */
export function calibrateCost(
  existing: TokenCostEstimate,
  actualPercent: number,
): TokenCostEstimate {
  const newEstimate =
    (existing.estimated_context_percent * existing.sample_count +
      actualPercent) /
    (existing.sample_count + 1);

  const rounded = Math.round(newEstimate * 10) / 10;

  return tokenCostEstimateSchema.parse({
    complexity: existing.complexity,
    estimated_context_percent: rounded,
    actual_context_percent: actualPercent,
    sample_count: existing.sample_count + 1,
    source: "calibrated",
  });
}

/**
 * Build a complete cost table with entries for all 5 complexity levels.
 *
 * Starts with cold-start defaults for each level, then merges any
 * provided calibrations on top. This allows incremental calibration --
 * levels without observations keep their cold-start estimates.
 *
 * @param calibrations - Optional map of complexity level to calibrated estimate
 * @returns Complete map of all 5 complexity levels to their TokenCostEstimate
 *
 * @example
 * ```typescript
 * // All cold-start
 * const table = buildCostTable();
 *
 * // With some calibrations
 * const table = buildCostTable({
 *   COMPLEX: calibrateCost(createCostEstimate("COMPLEX"), 28),
 * });
 * ```
 */
export function buildCostTable(
  calibrations?: Record<string, TokenCostEstimate>,
): Record<string, TokenCostEstimate> {
  const levels: ComplexityLevel[] = [
    "TRIVIAL",
    "SIMPLE",
    "MODERATE",
    "COMPLEX",
    "CRITICAL",
  ];

  const table: Record<string, TokenCostEstimate> = {};

  for (const level of levels) {
    table[level] = calibrations?.[level] ?? createCostEstimate(level);
  }

  return table;
}

/**
 * Format a cost table as a markdown table suitable for MEMORY.md storage.
 *
 * Produces a human-readable markdown table with columns for complexity,
 * estimated %, actual %, samples, and source. Actual percentage shows
 * "N/A" when no observation has been recorded.
 *
 * @param table - Map of complexity level to TokenCostEstimate
 * @returns Markdown-formatted table string
 *
 * @example
 * ```typescript
 * const md = formatCostTableForMemory(buildCostTable());
 * // | Complexity | Estimated % | Actual % | Samples | Source     |
 * // |------------|-------------|----------|---------|------------|
 * // | TRIVIAL    | 5.0         | N/A      | 0       | cold_start |
 * // ...
 * ```
 */
export function formatCostTableForMemory(
  table: Record<string, TokenCostEstimate>,
): string {
  const levels: ComplexityLevel[] = [
    "TRIVIAL",
    "SIMPLE",
    "MODERATE",
    "COMPLEX",
    "CRITICAL",
  ];

  const header =
    "| Complexity | Estimated % | Actual % | Samples | Source     |";
  const separator =
    "|------------|-------------|----------|---------|------------|";

  const rows = levels
    .filter((level) => table[level] !== undefined)
    .map((level) => {
      const entry = table[level]!;
      const actual =
        entry.actual_context_percent !== undefined
          ? entry.actual_context_percent.toFixed(1)
          : "N/A";
      return `| ${level.padEnd(10)} | ${entry.estimated_context_percent.toFixed(1).padStart(11)} | ${actual.padStart(8)} | ${String(entry.sample_count).padStart(7)} | ${entry.source.padEnd(10)} |`;
    });

  return [header, separator, ...rows].join("\n");
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
