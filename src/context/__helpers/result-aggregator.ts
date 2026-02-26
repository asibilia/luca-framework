/**
 * Result aggregation for multi-agent phase execution.
 *
 * Combines multiple sub-agent ResultEnvelopes into a single
 * AggregatedResult that the orchestrator can use for decision-making.
 *
 * Aggregation logic:
 * - Overall status: "failed" if any agent failed, "partial" if any
 *   partial/timeout, "success" only if all succeeded
 * - Summaries: concatenated with agent headers
 * - Artifacts: merged with source_agent attribution
 * - Issues: deduplicated by file:line:message key
 * - Issue counts: tallied by severity
 * - Duration: summed across all agents
 *
 * Uses snake_case for API compatibility.
 */
import { z } from "zod";

import type { ResultEnvelope } from "./result-envelope";
import {
  resultStatusSchema,
  resultArtifactSchema,
  resultIssueSchema,
} from "./result-envelope";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

/**
 * Schema for an aggregated result from multiple sub-agent invocations.
 *
 * Provides a unified view of all agent outputs including merged artifacts,
 * deduplicated issues, per-agent status tracking, and severity counts.
 *
 * Uses snake_case for API compatibility.
 */
export const aggregatedResultSchema = z.object({
  /** Overall status across all agents */
  overall_status: resultStatusSchema,
  /** Combined summary from all agents (markdown with headers) */
  summary: z.string(),
  /** Merged artifacts with source agent attribution */
  artifacts: z.array(
    resultArtifactSchema.extend({
      /** The agent that produced this artifact */
      source_agent: z.string(),
    }),
  ),
  /** Deduplicated issues from all agents */
  issues: z.array(resultIssueSchema),
  /** Per-agent status summary */
  agent_statuses: z.array(
    z.object({
      /** Agent name */
      agent_name: z.string(),
      /** Agent's individual result status */
      status: resultStatusSchema,
      /** Agent's execution duration in milliseconds */
      duration_ms: z.number().optional(),
    }),
  ),
  /** Issue counts by severity */
  issue_counts: z.object({
    critical: z.number(),
    high: z.number(),
    medium: z.number(),
    low: z.number(),
    info: z.number(),
  }),
  /** Total execution duration across all agents in milliseconds */
  total_duration_ms: z.number(),
});

/** Aggregated result type derived from schema */
export type AggregatedResult = z.infer<typeof aggregatedResultSchema>;

// ---------------------------------------------------------------------------
// Aggregator
// ---------------------------------------------------------------------------

/**
 * Aggregate multiple sub-agent ResultEnvelopes into a single result.
 *
 * Combines status, summaries, artifacts, and issues from all agents
 * into a unified view. Issues are deduplicated by a composite key of
 * file path, line number, and message text.
 *
 * @param results - Array of ResultEnvelope objects from sub-agent invocations
 * @returns An AggregatedResult with merged and deduplicated data
 *
 * @example
 * ```typescript
 * const envelopes: ResultEnvelope[] = [
 *   { status: "success", summary: "Executed plan A", artifacts: [...], issues: [], metadata: { agent_name: "lu-executor", context_tier: "T2" } },
 *   { status: "partial", summary: "Partial plan B", artifacts: [...], issues: [...], metadata: { agent_name: "lu-executor", context_tier: "T2", duration_ms: 5000 } },
 * ];
 *
 * const aggregated = aggregateResults(envelopes);
 * // aggregated.overall_status === "partial"
 * // aggregated.agent_statuses.length === 2
 * ```
 */
export function aggregateResults(results: ResultEnvelope[]): AggregatedResult {
  // 1. Determine overall status (worst wins)
  let overallStatus: "success" | "partial" | "failed" | "timeout" = "success";
  for (const r of results) {
    if (r.status === "failed") {
      overallStatus = "failed";
      break;
    }
    if (r.status === "partial" || r.status === "timeout") {
      overallStatus = "partial";
    }
  }

  // 2. Concatenate summaries with agent headers
  const summaryParts = results.map((r) => {
    const agentName = r.metadata.agent_name;
    return `### ${agentName}\n${r.summary}`;
  });

  // 3. Merge artifacts with source agent attribution
  const artifacts = results.flatMap((r) => {
    const agentName = r.metadata.agent_name;
    return r.artifacts.map((a) => ({ ...a, source_agent: agentName }));
  });

  // 4. Merge all issues (already have source_agent from ResultIssue schema)
  const allIssues = results.flatMap((r) => r.issues);

  // 5. Deduplicate by file:line:message composite key
  const seenKeys = new Set<string>();
  const uniqueIssues = allIssues.filter((issue) => {
    const key = `${issue.file ?? ""}:${issue.line ?? ""}:${issue.message}`;
    if (seenKeys.has(key)) return false;
    seenKeys.add(key);
    return true;
  });

  // 6. Count issues by severity
  const issueCounts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const issue of uniqueIssues) {
    const sev = issue.severity.toLowerCase() as keyof typeof issueCounts;
    if (sev in issueCounts) {
      issueCounts[sev]++;
    }
  }

  // 7. Build per-agent status list
  const agentStatuses = results.map((r) => ({
    agent_name: r.metadata.agent_name,
    status: r.status,
    duration_ms: r.metadata.duration_ms,
  }));

  // 8. Sum total duration
  const totalDuration = results.reduce(
    (sum, r) => sum + (r.metadata.duration_ms ?? 0),
    0,
  );

  return {
    overall_status: overallStatus,
    summary: summaryParts.join("\n\n"),
    artifacts,
    issues: uniqueIssues,
    agent_statuses: agentStatuses,
    issue_counts: issueCounts,
    total_duration_ms: totalDuration,
  };
}
