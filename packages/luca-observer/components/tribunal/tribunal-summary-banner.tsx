"use client";

import { EmptyState } from "~/components/shared/empty-state";
import type { TribunalResultSnapshot } from "~/lib/types";

/**
 * Summary banner for the latest tribunal session.
 *
 * Shows overall tribunal metrics: phase, total findings,
 * disagreements, rebuttals, withdrawals, modifications,
 * debate token cost, and timestamp.
 *
 * @param result - The latest tribunal result snapshot, or null if no tribunal has run
 */
export function TribunalSummaryBanner({
  result,
}: {
  result: TribunalResultSnapshot | null;
}) {
  if (!result) {
    return (
      <EmptyState
        title="No Tribunal Run"
        message="Tribunal data will appear here when a code review with debate is triggered at MODERATE+ complexity."
      />
    );
  }

  const hasWithdrawals = result.findings_withdrawn > 0;
  const hasModifications = result.findings_modified > 0;
  const tokenCostDisplay =
    result.debate_token_cost >= 1000
      ? `${(result.debate_token_cost / 1000).toFixed(1)}k`
      : String(result.debate_token_cost);

  return (
    <div
      className="rounded-lg border-2 p-4"
      style={{ borderColor: "var(--color-info)" }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span
            className="font-mono text-xl font-bold"
            style={{ color: "var(--color-info)" }}
          >
            Phase {result.phase}
          </span>
          <span className="font-mono text-sm text-muted-foreground">
            Tribunal Session
          </span>
        </div>
        {result.timestamp && (
          <span className="font-mono text-xs text-muted-foreground">
            {new Date(result.timestamp).toLocaleString()}
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4">
        <MetricBadge
          label="Findings"
          value={result.total_findings}
          color="foreground"
        />
        <MetricBadge
          label="Disagreements"
          value={result.disagreements_detected}
          color={result.disagreements_detected > 0 ? "warning" : "foreground"}
        />
        <MetricBadge
          label="Rebuttals"
          value={result.rebuttals_conducted}
          color={result.rebuttals_conducted > 0 ? "info" : "foreground"}
        />
        <MetricBadge
          label="Withdrawn"
          value={result.findings_withdrawn}
          color={hasWithdrawals ? "destructive" : "foreground"}
        />
        <MetricBadge
          label="Modified"
          value={result.findings_modified}
          color={hasModifications ? "warning" : "foreground"}
        />
        <MetricBadge
          label="Token Cost"
          value={tokenCostDisplay}
          color="muted-foreground"
        />
      </div>
    </div>
  );
}

/**
 * Small labeled metric badge for the summary banner.
 */
function MetricBadge({
  label,
  value,
  color,
}: {
  label: string;
  value: number | string;
  color: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="font-mono text-xs text-muted-foreground">{label}:</span>
      <span
        className="font-mono text-sm font-bold"
        style={{ color: `var(--color-${color})` }}
      >
        {value}
      </span>
    </div>
  );
}
