"use client";

/**
 * Rebuttal timeline showing debate round statistics and outcomes.
 *
 * Displays the number of rebuttals conducted, the resolution breakdown
 * (upheld, withdrawn, modified) as visual bars, and the total debate
 * token cost.
 *
 * @param rebuttalsConducted - Number of debate rebuttals conducted
 * @param findingsWithdrawn - Number of findings withdrawn after debate
 * @param findingsModified - Number of findings modified after debate
 * @param debateTokenCost - Total token cost of debate rounds
 */
export function RebuttalTimeline({
  rebuttalsConducted,
  findingsWithdrawn,
  findingsModified,
  debateTokenCost,
}: {
  rebuttalsConducted: number;
  findingsWithdrawn: number;
  findingsModified: number;
  debateTokenCost: number;
}) {
  const findingsUpheld =
    rebuttalsConducted - findingsWithdrawn - findingsModified;
  const safeUpheld = Math.max(0, findingsUpheld);

  const upheldPercent =
    rebuttalsConducted > 0
      ? Math.round((safeUpheld / rebuttalsConducted) * 100)
      : 0;
  const withdrawnPercent =
    rebuttalsConducted > 0
      ? Math.round((findingsWithdrawn / rebuttalsConducted) * 100)
      : 0;
  const modifiedPercent =
    rebuttalsConducted > 0
      ? Math.round((findingsModified / rebuttalsConducted) * 100)
      : 0;

  const tokenCostDisplay =
    debateTokenCost >= 1000
      ? `${(debateTokenCost / 1000).toFixed(1)}k`
      : String(debateTokenCost);

  const resolutions = [
    {
      label: "Upheld",
      count: safeUpheld,
      percent: upheldPercent,
      color: "info",
    },
    {
      label: "Modified",
      count: findingsModified,
      percent: modifiedPercent,
      color: "warning",
    },
    {
      label: "Withdrawn",
      count: findingsWithdrawn,
      percent: withdrawnPercent,
      color: "destructive",
    },
  ] as const;

  return (
    <div className="rounded-lg border border-border">
      <div className="border-b border-border px-4 py-3">
        <h3 className="font-mono text-sm font-medium text-foreground">
          Rebuttals
        </h3>
        <p className="mt-0.5 font-mono text-xs text-muted-foreground">
          Debate rounds and resolution outcomes
        </p>
      </div>

      <div className="px-4 py-3">
        <div className="flex items-center gap-6">
          <div>
            <span className="font-mono text-xs text-muted-foreground">
              Rounds
            </span>
            <p
              className="font-mono text-2xl font-bold"
              style={{ color: "var(--color-info)" }}
            >
              {rebuttalsConducted}
            </p>
          </div>
          <div>
            <span className="font-mono text-xs text-muted-foreground">
              Token Cost
            </span>
            <p className="font-mono text-2xl font-bold text-muted-foreground">
              {tokenCostDisplay}
            </p>
          </div>
        </div>
      </div>

      {/* Resolution breakdown */}
      {rebuttalsConducted > 0 && (
        <div className="border-t border-border px-4 py-3">
          <p className="mb-2 font-mono text-xs font-medium text-muted-foreground">
            Resolution Breakdown
          </p>

          {/* Distribution bar */}
          <div className="mb-3 flex h-3 w-full overflow-hidden rounded-full">
            {resolutions.map(
              (r) =>
                r.count > 0 && (
                  <div
                    key={r.label}
                    className="h-full"
                    style={{
                      width: `${r.percent}%`,
                      backgroundColor: `var(--color-${r.color})`,
                    }}
                    title={`${r.count} ${r.label.toLowerCase()} (${r.percent}%)`}
                  />
                ),
            )}
          </div>

          {/* Resolution rows */}
          <div className="space-y-2">
            {resolutions.map((r) => (
              <div key={r.label} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="rounded px-2 py-0.5 font-mono text-xs font-medium"
                    style={{
                      color: `var(--color-${r.color})`,
                      backgroundColor: `color-mix(in srgb, var(--color-${r.color}) 15%, transparent)`,
                    }}
                  >
                    {r.label}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold text-foreground">
                    {r.count}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    ({r.percent}%)
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
