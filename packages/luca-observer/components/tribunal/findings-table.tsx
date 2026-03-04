"use client";

/**
 * Findings table showing aggregate tribunal finding metrics.
 *
 * Displays total findings count with a breakdown of withdrawn
 * and modified findings. When full findings data becomes available
 * in the API response, this component can be enhanced to show
 * individual findings with severity, file:line, issue, and source agent.
 *
 * @param totalFindings - Total number of review findings
 * @param findingsWithdrawn - Number of findings withdrawn after debate
 * @param findingsModified - Number of findings modified after debate
 */
export function FindingsTable({
  totalFindings,
  findingsWithdrawn,
  findingsModified,
}: {
  totalFindings: number;
  findingsWithdrawn: number;
  findingsModified: number;
}) {
  if (totalFindings === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center">
        <p className="font-mono text-sm text-muted-foreground">
          No findings recorded in this tribunal session.
        </p>
      </div>
    );
  }

  const findingsUpheld = totalFindings - findingsWithdrawn - findingsModified;
  const upheldPercent =
    totalFindings > 0 ? Math.round((findingsUpheld / totalFindings) * 100) : 0;
  const withdrawnPercent =
    totalFindings > 0
      ? Math.round((findingsWithdrawn / totalFindings) * 100)
      : 0;
  const modifiedPercent =
    totalFindings > 0
      ? Math.round((findingsModified / totalFindings) * 100)
      : 0;

  return (
    <div className="rounded-lg border border-border">
      <div className="border-b border-border px-4 py-3">
        <h3 className="font-mono text-sm font-medium text-foreground">
          Findings Overview
        </h3>
        <p className="mt-0.5 font-mono text-xs text-muted-foreground">
          {totalFindings} total finding{totalFindings !== 1 ? "s" : ""} across
          all reviewers
        </p>
      </div>

      {/* Resolution distribution bar */}
      <div className="px-4 py-3">
        <div className="flex h-3 w-full overflow-hidden rounded-full">
          {findingsUpheld > 0 && (
            <div
              className="h-full"
              style={{
                width: `${upheldPercent}%`,
                backgroundColor: "var(--color-info)",
              }}
              title={`${findingsUpheld} upheld (${upheldPercent}%)`}
            />
          )}
          {findingsModified > 0 && (
            <div
              className="h-full"
              style={{
                width: `${modifiedPercent}%`,
                backgroundColor: "var(--color-warning)",
              }}
              title={`${findingsModified} modified (${modifiedPercent}%)`}
            />
          )}
          {findingsWithdrawn > 0 && (
            <div
              className="h-full"
              style={{
                width: `${withdrawnPercent}%`,
                backgroundColor: "var(--color-destructive)",
              }}
              title={`${findingsWithdrawn} withdrawn (${withdrawnPercent}%)`}
            />
          )}
        </div>
      </div>

      {/* Breakdown table */}
      <div className="px-4 pb-3">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <th className="py-2 text-left">Resolution</th>
              <th className="py-2 text-right">Count</th>
              <th className="py-2 text-right">Percent</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border/50">
              <td className="py-2">
                <span
                  className="rounded px-2 py-0.5 font-mono text-xs font-medium"
                  style={{
                    color: "var(--color-info)",
                    backgroundColor:
                      "color-mix(in oklab, var(--color-info) 15%, transparent)",
                  }}
                >
                  Upheld
                </span>
              </td>
              <td className="py-2 text-right font-mono text-sm text-foreground">
                {findingsUpheld}
              </td>
              <td className="py-2 text-right font-mono text-xs text-muted-foreground">
                {upheldPercent}%
              </td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-2">
                <span
                  className="rounded px-2 py-0.5 font-mono text-xs font-medium"
                  style={{
                    color: "var(--color-warning)",
                    backgroundColor:
                      "color-mix(in oklab, var(--color-warning) 15%, transparent)",
                  }}
                >
                  Modified
                </span>
              </td>
              <td className="py-2 text-right font-mono text-sm text-foreground">
                {findingsModified}
              </td>
              <td className="py-2 text-right font-mono text-xs text-muted-foreground">
                {modifiedPercent}%
              </td>
            </tr>
            <tr>
              <td className="py-2">
                <span
                  className="rounded px-2 py-0.5 font-mono text-xs font-medium"
                  style={{
                    color: "var(--color-destructive)",
                    backgroundColor:
                      "color-mix(in oklab, var(--color-destructive) 15%, transparent)",
                  }}
                >
                  Withdrawn
                </span>
              </td>
              <td className="py-2 text-right font-mono text-sm text-foreground">
                {findingsWithdrawn}
              </td>
              <td className="py-2 text-right font-mono text-xs text-muted-foreground">
                {withdrawnPercent}%
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
