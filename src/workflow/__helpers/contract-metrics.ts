/**
 * Drift metrics for behavioral contract health reporting.
 *
 * Formats contract audit results into MuninnDB-compatible metrics and
 * generates markdown drift reports for phase summaries. Designed to feed
 * the MuninnDB memory system via `muninn_remember` with the concept prefix
 * `metric:contract-violations-{workflow}`.
 *
 * **Two functions:**
 * - `formatContractMetrics` — Single audit result to MuninnDB metric
 * - `buildContractDriftReport` — Multiple audit results to markdown summary
 *
 * @module workflow/contract-metrics
 * @see src/workflow/__schemas/contracts/contract.schemas.ts
 * @see src/workflow/__helpers/contract-evaluator.ts
 */

import isEmpty from "lodash/isEmpty";

import type { ContractAuditResult } from "../__schemas/contracts";

// ─── MuninnDB Metric Format ─────────────────────────────────────────────────

/**
 * MuninnDB-ready metric with concept and content fields.
 *
 * Matches the MuninnDB `muninn_remember` API contract:
 * - `concept`: Memory concept label (e.g., "metric:contract-violations-pr-address")
 * - `content`: JSON string with metric data
 */
export interface ContractMetric {
  /** MuninnDB concept label. */
  concept: string;

  /** JSON string with violation rate, recovery rate, and breakdown. */
  content: string;
}

// ─── Metric Payload ─────────────────────────────────────────────────────────

/**
 * Internal structure for the metric content JSON.
 */
interface MetricPayload {
  /** Ratio of violations to total invariants (0.0 to 1.0). */
  violation_rate: number;

  /** Ratio of successful recoveries to attempted recoveries (0.0 to 1.0, or null if no attempts). */
  recovery_success_rate: number | null;

  /** Breakdown of hard vs soft violations. */
  hard_vs_soft_breakdown: {
    hard: number;
    soft: number;
  };

  /** Total invariants checked. */
  total_invariants: number;

  /** Total violations detected. */
  total_violations: number;

  /** ISO timestamp of when the metric was generated. */
  generated_at: string;
}

// ─── Format Single Audit ────────────────────────────────────────────────────

/**
 * Format a contract audit result as a MuninnDB-ready metric.
 *
 * Produces a concept/content pair suitable for `muninn_remember`:
 * - Concept: `metric:contract-violations-{workflow}`
 * - Content: JSON with violation_rate, recovery_success_rate, hard_vs_soft_breakdown
 *
 * @param result - The contract audit result to format
 * @returns ContractMetric with concept and content fields
 *
 * @example
 * ```typescript
 * import { formatContractMetrics, evaluateContract, CONTRACT_REGISTRY } from "~/workflow";
 *
 * const auditResult = evaluateContract(CONTRACT_REGISTRY["pr-address"], checkpoint);
 * const metric = formatContractMetrics(auditResult);
 *
 * // Store in MuninnDB:
 * // muninn_remember(vault: "luca-framework", concept: metric.concept, content: metric.content)
 * ```
 */
export function formatContractMetrics(
  result: ContractAuditResult,
): ContractMetric {
  const totalInvariants = result.summary.total_invariants;
  const totalViolations =
    result.summary.hard_violations + result.summary.soft_violations;

  const violationRate =
    totalInvariants > 0 ? totalViolations / totalInvariants : 0;

  const recoverySuccessRate =
    result.summary.recoveries_attempted > 0
      ? result.summary.recoveries_succeeded /
        result.summary.recoveries_attempted
      : null;

  const payload: MetricPayload = {
    violation_rate: Math.round(violationRate * 1000) / 1000,
    recovery_success_rate:
      recoverySuccessRate !== null
        ? Math.round(recoverySuccessRate * 1000) / 1000
        : null,
    hard_vs_soft_breakdown: {
      hard: result.summary.hard_violations,
      soft: result.summary.soft_violations,
    },
    total_invariants: totalInvariants,
    total_violations: totalViolations,
    generated_at: new Date().toISOString(),
  };

  return {
    concept: `metric:contract-violations-${result.workflow}`,
    content: JSON.stringify(payload),
  };
}

// ─── Drift Report Builder ───────────────────────────────────────────────────

/**
 * Build a markdown drift report from multiple contract audit results.
 *
 * Aggregates across multiple workflow audits and produces a markdown summary
 * suitable for inclusion in phase summaries. Includes total violations,
 * per-workflow breakdown, and an overall health assessment.
 *
 * @param results - Array of contract audit results to aggregate
 * @returns Markdown string with drift report
 *
 * @example
 * ```typescript
 * import { buildContractDriftReport, evaluateContract, CONTRACT_REGISTRY } from "~/workflow";
 *
 * const results = Object.values(CONTRACT_REGISTRY).map(
 *   (contract) => evaluateContract(contract, checkpoint),
 * );
 * const report = buildContractDriftReport(results);
 * // Insert into SUMMARY.md
 * ```
 */
export function buildContractDriftReport(
  results: ContractAuditResult[],
): string {
  if (isEmpty(results)) {
    return "## Contract Drift Report\n\nNo contract audits to report.\n";
  }

  // Aggregate totals
  let totalInvariants = 0;
  let totalHardViolations = 0;
  let totalSoftViolations = 0;
  let totalRecoveriesAttempted = 0;
  let totalRecoveriesSucceeded = 0;
  let cleanWorkflows = 0;
  let violationWorkflows = 0;

  for (const result of results) {
    totalInvariants += result.summary.total_invariants;
    totalHardViolations += result.summary.hard_violations;
    totalSoftViolations += result.summary.soft_violations;
    totalRecoveriesAttempted += result.summary.recoveries_attempted;
    totalRecoveriesSucceeded += result.summary.recoveries_succeeded;

    if (result.status === "clean") {
      cleanWorkflows++;
    } else {
      violationWorkflows++;
    }
  }

  const totalViolations = totalHardViolations + totalSoftViolations;

  // Determine overall health
  let healthIndicator: string;
  if (totalViolations === 0) {
    healthIndicator = "HEALTHY";
  } else if (totalHardViolations === 0) {
    healthIndicator = "DEGRADED (soft violations only)";
  } else {
    healthIndicator = "CRITICAL (hard violations detected)";
  }

  // Build markdown
  const lines: string[] = [
    "## Contract Drift Report",
    "",
    `**Overall Health:** ${healthIndicator}`,
    `**Workflows Audited:** ${results.length} (${cleanWorkflows} clean, ${violationWorkflows} with violations)`,
    `**Total Invariants Checked:** ${totalInvariants}`,
    `**Total Violations:** ${totalViolations} (${totalHardViolations} hard, ${totalSoftViolations} soft)`,
  ];

  if (totalRecoveriesAttempted > 0) {
    const recoveryRate = Math.round(
      (totalRecoveriesSucceeded / totalRecoveriesAttempted) * 100,
    );
    lines.push(
      `**Recovery Rate:** ${totalRecoveriesSucceeded}/${totalRecoveriesAttempted} (${recoveryRate}%)`,
    );
  }

  lines.push("");

  // Per-workflow breakdown
  if (violationWorkflows > 0) {
    lines.push("### Per-Workflow Breakdown");
    lines.push("");
    lines.push("| Workflow | Status | Hard | Soft | Recoveries |");
    lines.push("|----------|--------|------|------|------------|");

    for (const result of results) {
      const violations =
        result.summary.hard_violations + result.summary.soft_violations;
      const statusLabel = result.status === "clean" ? "Clean" : "Violations";
      const recoveryLabel =
        result.summary.recoveries_attempted > 0
          ? `${result.summary.recoveries_succeeded}/${result.summary.recoveries_attempted}`
          : "-";

      if (violations > 0) {
        lines.push(
          `| ${result.workflow} | ${statusLabel} | ${result.summary.hard_violations} | ${result.summary.soft_violations} | ${recoveryLabel} |`,
        );
      }
    }

    lines.push("");
  }

  // Violation details
  const allViolations = results.flatMap((r) => r.violations);
  if (!isEmpty(allViolations)) {
    lines.push("### Violation Details");
    lines.push("");

    for (const violation of allViolations) {
      const kindLabel = violation.kind === "hard" ? "[HARD]" : "[SOFT]";
      lines.push(
        `- ${kindLabel} \`${violation.invariant_id}\`: Step "${violation.postcondition_attempted}" ` +
          `ran without precondition "${violation.precondition_missing}"`,
      );
    }

    lines.push("");
  }

  return lines.join("\n");
}
