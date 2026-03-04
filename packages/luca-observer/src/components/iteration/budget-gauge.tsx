"use client";

/**
 * Horizontal progress bar showing iteration budget consumption.
 *
 * Shows current_iteration / max_iterations with a soft-stop threshold
 * marker and color transitions based on budget usage percentage.
 *
 * @param currentIteration - Number of iterations completed
 * @param maxIterations - Maximum allowed iterations
 * @param softStopPercent - Soft-stop threshold percentage (default 80)
 * @param status - Budget status: under_budget, soft_stop, or exceeded
 */
export function BudgetGauge({
  currentIteration,
  maxIterations,
  softStopPercent = 80,
  status,
}: {
  currentIteration: number;
  maxIterations: number;
  softStopPercent?: number;
  status: string;
}) {
  const usagePercent = Math.min(
    (currentIteration / Math.max(maxIterations, 1)) * 100,
    100,
  );

  const barColor =
    usagePercent > 80
      ? "destructive"
      : usagePercent > 50
        ? "warning"
        : "success";

  const defaultConfig = { label: "Under Budget", color: "success" } as const;

  const statusConfig: Record<string, { label: string; color: string }> = {
    under_budget: defaultConfig,
    soft_stop: { label: "Soft Stop", color: "warning" },
    exceeded: { label: "Exceeded", color: "destructive" },
  };

  const config = statusConfig[status] ?? defaultConfig;

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-mono text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Iteration Budget
        </h3>
        <span
          className="rounded px-2 py-0.5 font-mono text-xs font-medium"
          style={{
            color: `var(--color-${config.color})`,
            backgroundColor: `color-mix(in srgb, var(--color-${config.color}) 15%, transparent)`,
          }}
        >
          {config.label}
        </span>
      </div>

      {/* Progress bar container */}
      <div className="relative mt-4">
        <div className="h-6 w-full rounded bg-muted/50">
          {/* Fill bar */}
          <div
            className="h-full rounded transition-all duration-300"
            style={{
              width: `${usagePercent}%`,
              backgroundColor: `var(--color-${barColor})`,
              opacity: 0.8,
            }}
          />

          {/* Soft-stop threshold line */}
          <div
            className="absolute top-0 h-full border-l-2 border-dashed"
            style={{
              left: `${softStopPercent}%`,
              borderColor: "var(--color-warning)",
            }}
            title={`Soft stop at ${softStopPercent}%`}
          />
        </div>
      </div>

      {/* Labels */}
      <div className="mt-2 flex items-center justify-between">
        <span className="font-mono text-sm text-foreground">
          {currentIteration} of {maxIterations} iterations used
        </span>
        <span className="font-mono text-xs text-muted-foreground">
          {usagePercent.toFixed(0)}%
        </span>
      </div>
    </div>
  );
}
