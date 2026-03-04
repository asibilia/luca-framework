"use client";

import { useContextHealth } from "~/hooks/use-context-health";

/**
 * Quality zone band colors matching the QualityZoneIndicator.
 */
const ZONE_BANDS = [
  { label: "Peak", color: "success", start: 0, end: 30 },
  { label: "Good", color: "info", start: 30, end: 50 },
  { label: "Degrading", color: "warning", start: 50, end: 70 },
  { label: "Stop", color: "destructive", start: 70, end: 100 },
] as const;

/**
 * Context pressure timeline with quality zone bands.
 *
 * Shows context usage percentage over time as a line plot overlaid
 * on colored quality zone bands. Helps visualize when the context
 * window enters degrading or critical zones.
 */
export function ContextPressureTimeline() {
  const { snapshots, loading } = useContextHealth();

  if (loading) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center">
        <p className="font-mono text-sm text-muted-foreground">
          Loading context data...
        </p>
      </div>
    );
  }

  if (snapshots.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center">
        <p className="font-mono text-sm text-muted-foreground">
          No context snapshot data
        </p>
      </div>
    );
  }

  // Chronological order
  const chronological = [...snapshots].reverse();
  const chartHeight = 160;

  return (
    <div className="rounded-lg border border-border p-4">
      <h3 className="font-mono text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Context Pressure Timeline
      </h3>

      <div className="relative mt-4" style={{ height: `${chartHeight}px` }}>
        {/* Quality zone background bands */}
        {ZONE_BANDS.map((zone) => {
          const topPercent = 100 - zone.end;
          const heightPercent = zone.end - zone.start;
          return (
            <div
              key={zone.label}
              className="absolute left-0 right-0"
              style={{
                top: `${topPercent}%`,
                height: `${heightPercent}%`,
                backgroundColor: `color-mix(in oklab, var(--color-${zone.color}) 8%, transparent)`,
              }}
            >
              <span
                className="absolute left-1 top-0.5 font-mono text-xs"
                style={{
                  color: `var(--color-${zone.color})`,
                  opacity: 0.6,
                }}
              >
                {zone.label}
              </span>
            </div>
          );
        })}

        {/* Data points */}
        <div className="absolute inset-0 flex items-end gap-px">
          {chronological.map((snapshot, idx) => {
            const heightPercent = Math.min(snapshot.context_percent, 100);
            const zone: (typeof ZONE_BANDS)[number] =
              ZONE_BANDS.find(
                (z) =>
                  snapshot.context_percent >= z.start &&
                  snapshot.context_percent < z.end,
              ) ?? ZONE_BANDS[3];

            return (
              <div
                key={`${snapshot.id}-${idx}`}
                className="flex flex-1 flex-col justify-end"
                style={{ height: "100%" }}
              >
                <div
                  className="w-full min-w-0.5 rounded-t"
                  style={{
                    height: `${Math.max(heightPercent, 2)}%`,
                    backgroundColor: `var(--color-${zone.color})`,
                    opacity: 0.7,
                  }}
                  title={`${snapshot.context_percent}% — ${snapshot.phase ?? "unknown"}`}
                />
              </div>
            );
          })}
        </div>

        {/* Y-axis zone boundary lines */}
        {[30, 50, 70].map((pct) => (
          <div
            key={`line-${pct}`}
            className="pointer-events-none absolute left-0 right-0 border-t border-dashed"
            style={{
              top: `${100 - pct}%`,
              borderColor: "var(--color-muted-foreground)",
              opacity: 0.2,
            }}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="mt-3 flex items-center gap-4 border-t border-border pt-2">
        {ZONE_BANDS.map((zone) => (
          <span
            key={zone.label}
            className="flex items-center gap-1 font-mono text-xs"
          >
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: `var(--color-${zone.color})` }}
            />
            <span className="text-muted-foreground">
              {zone.label} ({zone.start}-{zone.end}%)
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
