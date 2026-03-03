import { getArg } from "~/shared/__helpers/cli-utils";

import type {
  LoopResult,
  LoopConfig,
  ConvergenceResult,
} from "../__schemas/iteration.schemas";
import {
  iterationMetricsSchema,
  planQualityMetricsSchema,
  reviewMetricsSchema,
  convergenceMetricsSchema,
  metricsFileSchema,
} from "../__schemas/metrics.schemas";
import type {
  IterationMetrics,
  PlanQualityMetrics,
  ReviewMetrics,
  ConvergenceMetrics,
  MetricsFile,
} from "../__schemas/metrics.schemas";

/** Default metrics file path */
const DEFAULT_METRICS_PATH = ".planning/metrics.json";

/** Valid metric categories for append operations */
const METRIC_CATEGORIES = [
  "iteration_metrics",
  "plan_quality_metrics",
  "review_metrics",
  "convergence_metrics",
] as const;

type MetricCategory = (typeof METRIC_CATEGORIES)[number];

/**
 * Build iteration metrics from a completed loop result.
 *
 * Extracts relevant fields from LoopResult and LoopConfig
 * to produce a schema-conformant IterationMetrics entry.
 *
 * @param loopResult - The completed loop result
 * @param config - The loop configuration used
 * @param debateChangedOutcome - Whether debate altered the outcome
 * @returns A validated IterationMetrics entry
 *
 * @example
 * ```typescript
 * const metrics = buildIterationMetrics(loopResult, loopConfig, false);
 * // { phase: 91, loop: "harness", actual_iteration_count: 3, ... }
 * ```
 */
export function buildIterationMetrics(
  loopResult: LoopResult,
  config: LoopConfig,
  debateChangedOutcome: boolean = false,
): IterationMetrics {
  const stallEvents = loopResult.history.iterations.filter(
    (r) => r.convergence_status === "stalled",
  ).length;

  return iterationMetricsSchema.parse({
    phase: config.phase,
    loop: config.loop_type,
    predicted_stall_point: 0,
    actual_iteration_count: loopResult.iterations_completed,
    outcome: loopResult.outcome,
    stall_events: stallEvents,
    debate_changed_outcome: debateChangedOutcome,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Build plan quality metrics from plan execution data.
 *
 * Constructs a valid PlanQualityMetrics entry from plan
 * identification, scoring, and outcome data.
 *
 * @param planId - Plan identifier (e.g., "91-A")
 * @param phase - Phase number
 * @param wsjfScore - WSJF priority score
 * @param complexity - Complexity classification string
 * @param executionDurationMs - Execution time in milliseconds
 * @param outcome - Outcome string (e.g., "success", "partial")
 * @param gapCount - Number of verification gaps found
 * @returns A validated PlanQualityMetrics entry
 *
 * @example
 * ```typescript
 * const metrics = buildPlanQualityMetrics("91-A", 91, 8.5, "MODERATE", 120000, "success", 0);
 * ```
 */
export function buildPlanQualityMetrics(
  planId: string,
  phase: number,
  wsjfScore: number,
  complexity: string,
  executionDurationMs: number,
  outcome: string,
  gapCount: number,
): PlanQualityMetrics {
  return planQualityMetricsSchema.parse({
    plan_id: planId,
    phase,
    wsjf_score: wsjfScore,
    complexity,
    execution_duration_ms: executionDurationMs,
    outcome,
    gap_count: gapCount,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Reviewer finding structure for buildReviewMetrics input.
 *
 * Matches the YAML output format from code review agents.
 */
interface ReviewerFinding {
  severity: string;
  source_agent: string;
}

/**
 * Build review metrics from aggregated reviewer results.
 *
 * Aggregates findings by severity and source agent,
 * producing a schema-conformant ReviewMetrics entry.
 *
 * @param phase - Phase number
 * @param findings - Array of findings from all reviewers
 * @param debateEnabled - Whether tribunal/debate was enabled
 * @param disagreementsDetected - Number of inter-reviewer disagreements
 * @returns A validated ReviewMetrics entry
 *
 * @example
 * ```typescript
 * const metrics = buildReviewMetrics(91, [
 *   { severity: "HIGH", source_agent: "dx-advocate" },
 *   { severity: "MEDIUM", source_agent: "code-simplifier" },
 * ]);
 * ```
 */
export function buildReviewMetrics(
  phase: number,
  findings: ReviewerFinding[],
  debateEnabled: boolean = false,
  disagreementsDetected: number = 0,
): ReviewMetrics {
  const issuesBySeverity: Record<string, number> = {};
  const issuesByAgent: Record<string, number> = {};
  const agentNames = new Set<string>();

  for (const finding of findings) {
    const sev = finding.severity.toUpperCase();
    issuesBySeverity[sev] = (issuesBySeverity[sev] ?? 0) + 1;

    const agent = finding.source_agent;
    issuesByAgent[agent] = (issuesByAgent[agent] ?? 0) + 1;
    agentNames.add(agent);
  }

  return reviewMetricsSchema.parse({
    phase,
    reviewer_count: agentNames.size,
    total_issues: findings.length,
    issues_by_severity: issuesBySeverity,
    issues_by_agent: issuesByAgent,
    debate_enabled: debateEnabled,
    disagreements_detected: disagreementsDetected,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Build convergence metrics from a convergence assessment.
 *
 * Maps convergence result fields to the metrics schema,
 * including debate override tracking.
 *
 * @param phase - Phase number
 * @param convergenceResult - The convergence assessment result
 * @param loop - Loop type ("harness" or "verify")
 * @param debateOverride - Whether debate overrode the halt decision
 * @returns A validated ConvergenceMetrics entry
 *
 * @example
 * ```typescript
 * const metrics = buildConvergenceMetrics(91, convergenceResult, "harness", false);
 * ```
 */
export function buildConvergenceMetrics(
  phase: number,
  convergenceResult: ConvergenceResult,
  loop: "harness" | "verify",
  debateOverride: boolean = false,
): ConvergenceMetrics {
  return convergenceMetricsSchema.parse({
    phase,
    loop,
    premature_halt: convergenceResult.should_halt,
    halt_iteration: convergenceResult.should_halt
      ? convergenceResult.consecutive_stale
      : 0,
    total_stale_count: convergenceResult.consecutive_stale,
    signals_at_halt: convergenceResult.should_halt
      ? convergenceResult.signals
      : undefined,
    debate_override: debateOverride,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Read the metrics file from disk, initializing if absent.
 *
 * @param metricsPath - Path to the metrics JSON file
 * @returns Parsed and validated MetricsFile
 */
async function readMetricsFile(metricsPath: string): Promise<MetricsFile> {
  const file = Bun.file(metricsPath);
  if (!(await file.exists())) {
    return {
      version: "1.0",
      iteration_metrics: [],
      plan_quality_metrics: [],
      review_metrics: [],
      convergence_metrics: [],
    };
  }

  const raw = await file.text();
  const parsed = JSON.parse(raw);
  return metricsFileSchema.parse(parsed);
}

/**
 * Append a metrics entry to the file on disk.
 *
 * Reads the existing file (or creates a new one), appends
 * the entry to the appropriate category array, validates
 * the result, and writes back atomically.
 *
 * @param metricsPath - Path to the metrics JSON file
 * @param entry - The metrics entry to append (must match category schema)
 * @param category - Which metrics array to append to
 *
 * @example
 * ```typescript
 * appendMetrics(".planning/metrics.json", iterationEntry, "iteration_metrics");
 * ```
 */
export async function appendMetrics(
  metricsPath: string,
  entry: unknown,
  category: MetricCategory,
): Promise<void> {
  const metricsFile = await readMetricsFile(metricsPath);

  // Validate and append to the correct category
  switch (category) {
    case "iteration_metrics":
      metricsFile.iteration_metrics.push(iterationMetricsSchema.parse(entry));
      break;
    case "plan_quality_metrics":
      metricsFile.plan_quality_metrics.push(
        planQualityMetricsSchema.parse(entry),
      );
      break;
    case "review_metrics":
      metricsFile.review_metrics.push(reviewMetricsSchema.parse(entry));
      break;
    case "convergence_metrics":
      metricsFile.convergence_metrics.push(
        convergenceMetricsSchema.parse(entry),
      );
      break;
  }

  // Validate the entire file before writing
  metricsFileSchema.parse(metricsFile);
  await Bun.write(metricsPath, JSON.stringify(metricsFile, null, 2) + "\n");
}

/**
 * CLI entry point for metrics collection.
 *
 * Usage:
 *   bun run src/iteration/__helpers/metrics-collector.ts append \
 *     --category=iteration_metrics \
 *     --data='{"phase":91,"loop":"harness",...}' \
 *     [--path=.planning/metrics.json]
 *
 * Outputs confirmation to stdout. Exits 0 on success, 1 on error.
 */
if (import.meta.main) {
  const args = Bun.argv.slice(2);
  const command = args[0];

  if (command === "append") {
    try {
      const category = getArg(args, "category") as MetricCategory;
      const dataRaw = getArg(args, "data");
      const metricsPath = getArg(args, "path", DEFAULT_METRICS_PATH);

      if (!category || !dataRaw) {
        console.error("Usage: append --category=<category> --data='<json>'");
        process.exit(1);
      }

      if (!METRIC_CATEGORIES.includes(category)) {
        console.error(
          `Invalid category: ${category}. Must be one of: ${METRIC_CATEGORIES.join(", ")}`,
        );
        process.exit(1);
      }

      const entry = JSON.parse(dataRaw);
      await appendMetrics(metricsPath, entry, category);
      console.log(
        JSON.stringify({ success: true, category, path: metricsPath }),
      );
      process.exit(0);
    } catch (err) {
      console.error("Error:", err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  } else {
    console.error("Unknown command. Usage: append --category=... --data=...");
    process.exit(1);
  }
}
