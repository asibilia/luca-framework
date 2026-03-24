import { mkdir } from "node:fs/promises";

import type { EvalReport, EvalComparison } from "../__schemas/eval.schemas";

/**
 * Output format for eval reports.
 */
export type ReportFormat = "json" | "markdown" | "console";

// ─── ANSI Color Codes ───────────────────────────────────────────────────

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

// ─── Per-Case Aggregation ───────────────────────────────────────────────

/**
 * Aggregated per-case data from trial results.
 */
interface CaseAggregate {
  caseId: string;
  trialCount: number;
  passAt1: boolean;
  avgScore: number;
  totalLatencyMs: number;
  failureReason: string | undefined;
}

/**
 * Group eval results by case_id and compute per-case aggregates.
 *
 * @param report - The eval report containing trial results
 * @returns Array of per-case aggregates
 */
function aggregateByCaseId(report: EvalReport): CaseAggregate[] {
  const caseMap = new Map<
    string,
    {
      trials: number;
      anyPassed: boolean;
      scores: number[];
      latencies: number[];
      failureReason: string | undefined;
    }
  >();

  for (const result of report.results) {
    const existing = caseMap.get(result.case_id);
    if (existing) {
      existing.trials += 1;
      existing.anyPassed = existing.anyPassed || result.passed;
      existing.scores.push(result.score);
      existing.latencies.push(result.latency_ms);
      if (!result.passed && !existing.failureReason) {
        existing.failureReason = result.grader_output.reason;
      }
    } else {
      caseMap.set(result.case_id, {
        trials: 1,
        anyPassed: result.passed,
        scores: [result.score],
        latencies: [result.latency_ms],
        failureReason: result.passed ? undefined : result.grader_output.reason,
      });
    }
  }

  const aggregates: CaseAggregate[] = [];
  for (const [caseId, data] of caseMap) {
    const avgScore =
      data.scores.reduce((a, b) => a + b, 0) / data.scores.length;
    const totalLatencyMs = data.latencies.reduce((a, b) => a + b, 0);
    aggregates.push({
      caseId,
      trialCount: data.trials,
      passAt1: data.anyPassed,
      avgScore,
      totalLatencyMs,
      failureReason: data.failureReason,
    });
  }

  return aggregates;
}

// ─── JSON Report ────────────────────────────────────────────────────────

/**
 * Write an EvalReport as a JSON file to the eval results directory.
 *
 * File path: `.planning/evals/{component}/{run_id}.json`
 * Also creates/updates a `latest.json` copy pointing to the newest run.
 *
 * Uses Bun.file() and Bun.write() for file operations.
 *
 * @param report - The eval report to persist
 * @returns Absolute path to the written JSON file
 *
 * @example
 * ```typescript
 * const path = await writeJsonReport(report);
 * // ".planning/evals/lu-router/550e8400-e29b-41d4-a716-446655440000.json"
 * ```
 */
export async function writeJsonReport(report: EvalReport): Promise<string> {
  const dirPath = `.planning/evals/${report.component}`;
  await mkdir(dirPath, { recursive: true });

  const jsonContent = JSON.stringify(report, null, 2);
  const filePath = `${dirPath}/${report.run_id}.json`;

  await Bun.write(filePath, jsonContent);

  // Update latest.json as a file copy (not symlink)
  const latestPath = `${dirPath}/latest.json`;
  await Bun.write(latestPath, jsonContent);

  return filePath;
}

// ─── Markdown Report ────────────────────────────────────────────────────

/**
 * Generate a markdown summary table from an EvalReport.
 *
 * @param report - The eval report to format
 * @param suite_cases - Map of case_id to EvalCase for descriptions (optional)
 * @returns Markdown string
 */
export function formatMarkdownReport(
  report: EvalReport,
  suite_cases?: Map<string, { description: string }>,
): string {
  const aggregates = aggregateByCaseId(report);
  const lines: string[] = [];

  lines.push(`# Eval Report: ${report.component}`);
  lines.push("");
  lines.push(`**Suite:** ${report.suite_id}`);
  lines.push(`**Run ID:** ${report.run_id}`);
  lines.push(`**Date:** ${report.timestamp}`);
  lines.push(`**Model:** ${report.metadata.agent_model}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("|--------|-------|");
  lines.push(
    `| Cases (total / executed) | ${report.total_cases} / ${report.executed_cases} |`,
  );
  lines.push(
    `| pass@1 (capability) | ${(report.pass_at_1 * 100).toFixed(1)}% |`,
  );
  lines.push(
    `| pass@k (reliability) | ${(report.pass_at_k * 100).toFixed(1)}% |`,
  );
  lines.push(`| Average Score | ${(report.avg_score * 100).toFixed(1)}% |`);
  lines.push(`| Total Cost | $${report.total_cost_usd.toFixed(4)} |`);
  lines.push(`| Total Latency | ${report.total_latency_ms}ms |`);
  lines.push("");
  lines.push("## Per-Case Results");
  lines.push("");
  lines.push("| Case | Trials | pass@1 | Avg Score | Latency | Status |");
  lines.push("|------|--------|--------|-----------|---------|--------|");

  for (const agg of aggregates) {
    const status = agg.passAt1 ? "PASS" : "FAIL";
    lines.push(
      `| ${agg.caseId} | ${agg.trialCount} | ${agg.passAt1 ? "yes" : "no"} | ${(agg.avgScore * 100).toFixed(1)}% | ${Math.round(agg.totalLatencyMs)}ms | ${status} |`,
    );
  }

  // Failures section
  const failures = aggregates.filter((a) => !a.passAt1);
  if (failures.length > 0) {
    lines.push("");
    lines.push("## Failures");
    lines.push("");

    for (const fail of failures) {
      lines.push(`### ${fail.caseId}`);
      const description = suite_cases?.get(fail.caseId)?.description;
      if (description) {
        lines.push(`- **Description:** ${description}`);
      }
      lines.push(`- **Grader:** ${fail.failureReason ?? "No reason provided"}`);
      lines.push(`- **Score:** ${fail.avgScore.toFixed(2)}`);
      lines.push("");
    }
  }

  lines.push("---");
  lines.push("_Generated by Luca Eval Framework_");

  return lines.join("\n");
}

// ─── Console Report ─────────────────────────────────────────────────────

/**
 * Print a colorized console summary of an EvalReport.
 *
 * Uses ANSI escape codes for colors:
 * - Green for pass, red for fail, yellow for warnings
 * - Bold for headers and key metrics
 *
 * @param report - The eval report to display
 * @param verbose - If true, show all cases. If false, show only failures (default false).
 */
export function printConsoleReport(
  report: EvalReport,
  verbose?: boolean,
): void {
  const showAll = verbose ?? false;
  const aggregates = aggregateByCaseId(report);

  // Header box
  const title = `  Eval: ${report.suite_id}  `;
  const boxWidth = Math.max(title.length + 2, 46);
  const padTitle = title.padEnd(boxWidth - 2);

  console.log(`${BOLD}\u2554${"═".repeat(boxWidth)}\u2557${RESET}`);
  console.log(`${BOLD}\u2551 ${padTitle} \u2551${RESET}`);
  console.log(`${BOLD}\u255A${"═".repeat(boxWidth)}\u255D${RESET}`);
  console.log("");

  // Summary metrics
  const passedCases = aggregates.filter((a) => a.passAt1).length;
  const totalCases = aggregates.length;
  const passColor =
    report.pass_at_1 >= 0.9 ? GREEN : report.pass_at_1 >= 0.7 ? YELLOW : RED;

  console.log(
    `  ${BOLD}pass@1:${RESET}  ${passColor}${(report.pass_at_1 * 100).toFixed(1)}%${RESET}  (${passedCases}/${totalCases} cases)`,
  );
  console.log(
    `  ${BOLD}pass@k:${RESET}  ${(report.pass_at_k * 100).toFixed(1)}%`,
  );
  console.log(`  ${BOLD}Score:${RESET}   ${report.avg_score.toFixed(2)}`);
  console.log(`  ${BOLD}Cost:${RESET}    $${report.total_cost_usd.toFixed(4)}`);
  console.log(`  ${BOLD}Latency:${RESET} ${report.total_latency_ms}ms`);
  console.log("");

  // Per-case lines
  for (const agg of aggregates) {
    if (!showAll && agg.passAt1) continue;

    const icon = agg.passAt1
      ? `${GREEN}\u2713${RESET}`
      : `${RED}\u2717${RESET}`;
    const status = agg.passAt1 ? `${GREEN}PASS${RESET}` : `${RED}FAIL${RESET}`;
    const failReason =
      !agg.passAt1 && agg.failureReason ? `  "${agg.failureReason}"` : "";

    console.log(
      `  ${icon} ${agg.caseId.padEnd(24)} ${agg.avgScore.toFixed(2)}  ${status}${failReason}`,
    );
  }
}

// ─── Comparison Report ──────────────────────────────────────────────────

/**
 * Print a colorized console summary for an EvalComparison.
 *
 * @param comparison - The comparison result to display
 * @param baseline - The baseline report (for per-case details)
 * @param current - The current report (for per-case details)
 */
export function printComparisonReport(
  comparison: EvalComparison,
  baseline: EvalReport,
  current: EvalReport,
): void {
  // Header box
  const title = `  Comparison: ${current.suite_id}  `;
  const boxWidth = Math.max(title.length + 2, 46);
  const padTitle = title.padEnd(boxWidth - 2);

  console.log(`${BOLD}\u2554${"═".repeat(boxWidth)}\u2557${RESET}`);
  console.log(`${BOLD}\u2551 ${padTitle} \u2551${RESET}`);
  console.log(`${BOLD}\u255A${"═".repeat(boxWidth)}\u255D${RESET}`);
  console.log("");

  // Verdict
  const verdictColor =
    comparison.verdict === "pass"
      ? GREEN
      : comparison.verdict === "warn"
        ? YELLOW
        : RED;
  console.log(
    `  ${BOLD}Verdict:${RESET} ${verdictColor}${comparison.verdict.toUpperCase()}${RESET}`,
  );
  console.log("");

  // Delta table
  const deltas = comparison.deltas;
  const formatDelta = (
    val: number,
    suffix: string,
    invert?: boolean,
  ): string => {
    const sign = val > 0 ? "+" : "";
    const arrow =
      val > 0
        ? invert
          ? "\u2193"
          : "\u2191"
        : val < 0
          ? invert
            ? "\u2191"
            : "\u2193"
          : "\u2192";
    return `${sign}${val.toFixed(suffix === "%" ? 1 : suffix === "ms" ? 0 : 4)}${suffix}  ${arrow}`;
  };

  console.log(
    `  ${"Metric".padEnd(12)}${"Baseline".padEnd(12)}${"Current".padEnd(12)}Delta`,
  );
  console.log(
    `  ${"pass@1".padEnd(12)}${(baseline.pass_at_1 * 100).toFixed(1).padStart(5)}%${" ".repeat(6)}${(current.pass_at_1 * 100).toFixed(1).padStart(5)}%${" ".repeat(6)}${formatDelta(deltas.pass_at_1_delta * 100, "%")}`,
  );
  console.log(
    `  ${"pass@k".padEnd(12)}${(baseline.pass_at_k * 100).toFixed(1).padStart(5)}%${" ".repeat(6)}${(current.pass_at_k * 100).toFixed(1).padStart(5)}%${" ".repeat(6)}${formatDelta(deltas.pass_at_k_delta * 100, "%")}`,
  );
  console.log(
    `  ${"Score".padEnd(12)}${baseline.avg_score.toFixed(2).padStart(6)}${" ".repeat(6)}${current.avg_score.toFixed(2).padStart(6)}${" ".repeat(6)}${formatDelta(deltas.avg_score_delta, "")}`,
  );
  console.log(
    `  ${"Cost".padEnd(12)}${"$" + baseline.total_cost_usd.toFixed(4)}${" ".repeat(Math.max(1, 7 - baseline.total_cost_usd.toFixed(4).length))}${"$" + current.total_cost_usd.toFixed(4)}${" ".repeat(Math.max(1, 7 - current.total_cost_usd.toFixed(4).length))}${"$" + formatDelta(deltas.cost_delta, "", true)}`,
  );
  console.log(
    `  ${"Latency".padEnd(12)}${baseline.total_latency_ms + "ms"}${" ".repeat(Math.max(1, 9 - String(baseline.total_latency_ms).length))}${current.total_latency_ms + "ms"}${" ".repeat(Math.max(1, 9 - String(current.total_latency_ms).length))}${formatDelta(deltas.latency_delta, "ms", true)}`,
  );
  console.log("");

  // Regressions
  console.log(
    `  ${RED}Regressions (${comparison.regressions.length}):${RESET}`,
  );
  if (comparison.regressions.length === 0) {
    console.log("    (none)");
  } else {
    for (const caseId of comparison.regressions) {
      console.log(`    ${RED}-${RESET} ${caseId}     was PASS, now FAIL`);
    }
  }
  console.log("");

  // Improvements
  console.log(
    `  ${GREEN}Improvements (${comparison.improvements.length}):${RESET}`,
  );
  if (comparison.improvements.length === 0) {
    console.log("    (none)");
  } else {
    for (const caseId of comparison.improvements) {
      console.log(`    ${GREEN}+${RESET} ${caseId}     was FAIL, now PASS`);
    }
  }
}

// ─── Report Loading ─────────────────────────────────────────────────────

/**
 * Load the latest eval report for a component.
 *
 * Reads `.planning/evals/{component}/latest.json`.
 * Returns null if no report exists.
 *
 * @param component - Component name (e.g., "lu-router")
 * @returns The latest EvalReport or null
 */
export async function loadLatestReport(
  component: string,
): Promise<EvalReport | null> {
  try {
    const filePath = `.planning/evals/${component}/latest.json`;
    const file = Bun.file(filePath);
    const exists = await file.exists();
    if (!exists) return null;
    return (await file.json()) as EvalReport;
  } catch {
    return null;
  }
}

/**
 * Load a specific eval report by run ID.
 *
 * Reads `.planning/evals/{component}/{run_id}.json`.
 *
 * @param component - Component name
 * @param run_id - Run UUID
 * @returns The EvalReport or null if not found
 */
export async function loadReport(
  component: string,
  run_id: string,
): Promise<EvalReport | null> {
  try {
    const filePath = `.planning/evals/${component}/${run_id}.json`;
    const file = Bun.file(filePath);
    const exists = await file.exists();
    if (!exists) return null;
    return (await file.json()) as EvalReport;
  } catch {
    return null;
  }
}
