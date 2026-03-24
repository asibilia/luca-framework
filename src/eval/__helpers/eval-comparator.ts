import type {
  EvalReport,
  EvalComparison,
  ComparisonVerdict,
  EvalDeltas,
} from "../__schemas/eval.schemas";
import { EvalComparisonSchema } from "../__schemas/eval.schemas";
import { loadLatestReport } from "./eval-reporter";

/**
 * Build a map of case_id -> pass@1 (boolean) from an eval report.
 *
 * For each case, pass@1 is true if at least one trial passed.
 *
 * @param report - The eval report to analyze
 * @returns Map of case_id to pass@1 status
 */
function buildPassAt1Map(report: EvalReport): Map<string, boolean> {
  const passMap = new Map<string, boolean>();
  for (const result of report.results) {
    const current = passMap.get(result.case_id) ?? false;
    passMap.set(result.case_id, current || result.passed);
  }
  return passMap;
}

/**
 * Build a map of case_id -> average score from an eval report.
 *
 * @param report - The eval report to analyze
 * @returns Map of case_id to average score across trials
 */
function buildAvgScoreMap(report: EvalReport): Map<string, number> {
  const scoresMap = new Map<string, number[]>();
  for (const result of report.results) {
    const scores = scoresMap.get(result.case_id) ?? [];
    scores.push(result.score);
    scoresMap.set(result.case_id, scores);
  }

  const avgMap = new Map<string, number>();
  for (const [caseId, scores] of scoresMap) {
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    avgMap.set(caseId, avg);
  }
  return avgMap;
}

/**
 * Compare two eval runs and detect regressions/improvements.
 *
 * A case is considered "regressed" if it passed in the baseline (pass@1 = true)
 * but fails in the current run (pass@1 = false). A case is "improved" if the
 * reverse is true. Cases present in only one run are excluded from comparison.
 *
 * Verdict logic:
 * - "fail": Any case regressed AND avg_score_delta < -significance_threshold
 * - "warn": Any case regressed BUT avg_score_delta >= -significance_threshold
 * - "pass": No cases regressed
 *
 * @param baseline - The baseline eval report to compare against
 * @param current - The current eval report
 * @param significanceThreshold - Minimum score delta to flag as meaningful (default 0.05)
 * @returns EvalComparison with regressions, improvements, deltas, and verdict
 *
 * @example
 * ```typescript
 * const comparison = compareEvalRuns(baselineReport, currentReport, 0.05);
 * if (comparison.verdict === "fail") {
 *   console.error(`${comparison.regressions.length} regressions detected`);
 *   process.exit(2);
 * }
 * ```
 */
export function compareEvalRuns(
  baseline: EvalReport,
  current: EvalReport,
  significanceThreshold?: number,
): EvalComparison {
  const threshold = significanceThreshold ?? 0.05;

  // Build per-case pass@1 maps
  const baselinePass = buildPassAt1Map(baseline);
  const currentPass = buildPassAt1Map(current);

  // Find common case IDs (intersection)
  const baselineCaseIds = new Set(baselinePass.keys());
  const currentCaseIds = new Set(currentPass.keys());
  const commonCaseIds = [...baselineCaseIds].filter((id) =>
    currentCaseIds.has(id),
  );

  // Classify cases
  const regressions: string[] = [];
  const improvements: string[] = [];
  const unchanged: string[] = [];

  for (const caseId of commonCaseIds) {
    const baselinePassed = baselinePass.get(caseId) ?? false;
    const currentPassed = currentPass.get(caseId) ?? false;

    if (baselinePassed && !currentPassed) {
      regressions.push(caseId);
    } else if (!baselinePassed && currentPassed) {
      improvements.push(caseId);
    } else {
      unchanged.push(caseId);
    }
  }

  // Compute deltas
  const deltas: EvalDeltas = {
    pass_at_1_delta: current.pass_at_1 - baseline.pass_at_1,
    pass_at_k_delta: current.pass_at_k - baseline.pass_at_k,
    avg_score_delta: current.avg_score - baseline.avg_score,
    cost_delta: current.total_cost_usd - baseline.total_cost_usd,
    latency_delta: current.total_latency_ms - baseline.total_latency_ms,
  };

  // Determine verdict
  let verdict: ComparisonVerdict;
  if (regressions.length > 0 && deltas.avg_score_delta < -threshold) {
    verdict = "fail";
  } else if (regressions.length > 0) {
    verdict = "warn";
  } else {
    verdict = "pass";
  }

  // Build result
  const result: EvalComparison = {
    regressions,
    improvements,
    unchanged,
    deltas,
    verdict,
    significance_threshold: threshold,
  };

  // Validate with schema
  const parseResult = EvalComparisonSchema.safeParse(result);
  if (!parseResult.success) {
    console.warn(
      "EvalComparison validation warning:",
      parseResult.error.message,
    );
  }

  return result;
}

/**
 * Load the latest baseline for a component and compare against a current run.
 *
 * Convenience function that combines loadLatestReport + compareEvalRuns.
 * Returns null if no baseline exists for the component.
 *
 * @param current - The current eval report to compare
 * @param significanceThreshold - Minimum score delta to flag as meaningful (default 0.05)
 * @returns EvalComparison or null if no baseline exists
 *
 * @example
 * ```typescript
 * const comparison = await compareWithLatestBaseline(currentReport);
 * if (comparison === null) {
 *   console.log("No baseline found, saving current as baseline");
 * } else if (comparison.verdict === "fail") {
 *   console.error("Regressions detected!");
 * }
 * ```
 */
export async function compareWithLatestBaseline(
  current: EvalReport,
  significanceThreshold?: number,
): Promise<EvalComparison | null> {
  const baseline = await loadLatestReport(current.component);
  if (!baseline) return null;
  return compareEvalRuns(baseline, current, significanceThreshold);
}
