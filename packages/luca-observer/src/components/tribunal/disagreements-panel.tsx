"use client";

/**
 * Panel showing disagreement metrics and debate resolution rate.
 *
 * Displays the total number of disagreements detected between reviewers,
 * the number of rebuttals conducted, and the debate resolution rate.
 * Also shows descriptions of the three conflict types that can trigger
 * a debate: contradictory, severity_mismatch, and scope_overlap.
 *
 * @param disagreementsDetected - Number of disagreements found between reviewers
 * @param rebuttalsConducted - Number of debate rebuttals conducted
 */
export function DisagreementsPanel({
  disagreementsDetected,
  rebuttalsConducted,
}: {
  disagreementsDetected: number;
  rebuttalsConducted: number;
}) {
  const resolutionRate =
    disagreementsDetected > 0
      ? Math.round((rebuttalsConducted / disagreementsDetected) * 100)
      : 0;

  const conflictTypes = [
    {
      type: "Contradictory",
      description: "Reviewers gave opposing recommendations",
      color: "destructive",
    },
    {
      type: "Severity Mismatch",
      description: "Same issue classified at different severity levels",
      color: "warning",
    },
    {
      type: "Scope Overlap",
      description: "Multiple reviewers flagged overlapping concerns",
      color: "info",
    },
  ] as const;

  return (
    <div className="rounded-lg border border-border">
      <div className="border-b border-border px-4 py-3">
        <h3 className="font-mono text-sm font-medium text-foreground">
          Disagreements
        </h3>
        <p className="mt-0.5 font-mono text-xs text-muted-foreground">
          Conflicts detected between reviewer findings
        </p>
      </div>

      <div className="px-4 py-3">
        <div className="flex items-center gap-6">
          <div>
            <span className="font-mono text-xs text-muted-foreground">
              Detected
            </span>
            <p
              className="font-mono text-2xl font-bold"
              style={{
                color:
                  disagreementsDetected > 0
                    ? "var(--color-warning)"
                    : "var(--color-foreground)",
              }}
            >
              {disagreementsDetected}
            </p>
          </div>
          <div>
            <span className="font-mono text-xs text-muted-foreground">
              Debated
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
              Resolution Rate
            </span>
            <p className="font-mono text-2xl font-bold text-foreground">
              {resolutionRate}%
            </p>
          </div>
        </div>

        {/* Resolution rate bar */}
        {disagreementsDetected > 0 && (
          <div className="mt-3">
            <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${resolutionRate}%`,
                  backgroundColor: "var(--color-info)",
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Conflict type descriptions */}
      <div className="border-t border-border px-4 py-3">
        <p className="mb-2 font-mono text-xs font-medium text-muted-foreground">
          Conflict Types
        </p>
        <div className="space-y-2">
          {conflictTypes.map((ct) => (
            <div key={ct.type} className="flex items-start gap-2">
              <span
                className="mt-0.5 rounded px-1.5 py-0.5 font-mono text-xs font-medium"
                style={{
                  color: `var(--color-${ct.color})`,
                  backgroundColor: `color-mix(in srgb, var(--color-${ct.color}) 15%, transparent)`,
                }}
              >
                {ct.type}
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                {ct.description}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
