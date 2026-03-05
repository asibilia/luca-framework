"use client";

import { EmptyState } from "~/components/shared/empty-state";
import type { HarnessResultSnapshot } from "~/lib/types";

/**
 * Summary banner for the latest harness run.
 *
 * Shows overall pass/fail status, duration, error/warning counts,
 * and when the harness last ran.
 *
 * @param result - The latest harness result snapshot, or null if no run exists
 */
export function HarnessSummaryBanner({
  result,
}: {
  result: HarnessResultSnapshot | null;
}) {
  if (!result) {
    return (
      <EmptyState
        title="No Harness Run"
        message="Run the verification harness to see results here."
      />
    );
  }

  const passed = result.status === "passed";
  const statusColor = passed ? "success" : "destructive";
  const durationSeconds = (result.duration / 1000).toFixed(1);

  return (
    <div
      className="rounded-lg border-2 p-4"
      style={{ borderColor: `var(--color-${statusColor})` }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span
            className="font-mono text-xl font-bold"
            style={{ color: `var(--color-${statusColor})` }}
          >
            {passed ? "PASSED" : "FAILED"}
          </span>
          <span className="font-mono text-sm text-muted-foreground">
            {result.checks.length} checks in {durationSeconds}s
          </span>
        </div>
        <div className="flex items-center gap-4">
          {result.total_errors > 0 && (
            <span
              className="font-mono text-sm"
              style={{ color: "var(--color-destructive)" }}
            >
              {result.total_errors} error
              {result.total_errors !== 1 ? "s" : ""}
            </span>
          )}
          {result.total_warnings > 0 && (
            <span
              className="font-mono text-sm"
              style={{ color: "var(--color-warning)" }}
            >
              {result.total_warnings} warning
              {result.total_warnings !== 1 ? "s" : ""}
            </span>
          )}
          {result.timestamp && (
            <span className="font-mono text-xs text-muted-foreground">
              {new Date(result.timestamp).toLocaleString()}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
