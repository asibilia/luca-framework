"use client";

/**
 * Quality zone configuration.
 *
 * Each zone maps to a context usage range. Color names correspond
 * to CSS variable color tokens in the observer design system.
 */
const QUALITY_ZONES = [
  {
    key: "peak",
    label: "Peak",
    color: "success",
    description: "Thorough, comprehensive work",
    start: 0,
    end: 30,
  },
  {
    key: "good",
    label: "Good",
    color: "info",
    description: "Confident, solid work",
    start: 30,
    end: 50,
  },
  {
    key: "degrading",
    label: "Degrading",
    color: "warning",
    description: "Efficiency mode begins",
    start: 50,
    end: 70,
  },
  {
    key: "stop",
    label: "Stop",
    color: "destructive",
    description: "Rushed, minimal quality",
    start: 70,
    end: 100,
  },
] as const;

/**
 * Visual bar showing the four quality zones with the current zone highlighted.
 *
 * Displays peak, good, degrading, and stop zones as horizontal segments
 * with percentage labels at boundaries. The current zone is visually
 * highlighted with a ring and opacity contrast.
 *
 * @param currentZone - The currently active zone key (peak/good/degrading/stop)
 *
 * @example
 * ```tsx
 * <QualityZoneIndicator currentZone="good" />
 * ```
 */
export function QualityZoneIndicator({
  currentZone,
}: {
  currentZone?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
        Quality Zone
      </p>

      {/* Zone bar */}
      <div className="mt-3 flex overflow-hidden rounded-md">
        {QUALITY_ZONES.map((zone) => {
          const isActive = currentZone === zone.key;
          const widthPercent = zone.end - zone.start;

          return (
            <div
              key={zone.key}
              className="relative flex items-center justify-center py-2 font-mono text-xs font-bold transition-opacity"
              style={{
                width: `${widthPercent}%`,
                backgroundColor: `color-mix(in oklab, var(--color-${zone.color}) ${isActive ? "30%" : "12%"}, transparent)`,
                color: `var(--color-${zone.color})`,
                opacity: isActive ? 1 : 0.5,
                outline: isActive
                  ? `2px solid var(--color-${zone.color})`
                  : "none",
                outlineOffset: "-2px",
              }}
            >
              {zone.label}
            </div>
          );
        })}
      </div>

      {/* Percentage boundary labels */}
      <div className="mt-1 flex justify-between font-mono text-xs text-muted-foreground">
        <span>0%</span>
        <span style={{ marginLeft: "calc(30% - 1ch)" }}>30%</span>
        <span>50%</span>
        <span>70%</span>
        <span>100%</span>
      </div>

      {/* Zone descriptions */}
      <div className="mt-3 space-y-1.5">
        {QUALITY_ZONES.map((zone) => {
          const isActive = currentZone === zone.key;

          return (
            <div
              key={zone.key}
              className="flex items-center gap-2"
              style={{ opacity: isActive ? 1 : 0.5 }}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: `var(--color-${zone.color})` }}
              />
              <span
                className="font-mono text-xs font-medium"
                style={{ color: `var(--color-${zone.color})` }}
              >
                {zone.label}
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                {zone.description}
              </span>
              {isActive && (
                <span
                  className="ml-auto rounded px-1.5 py-0.5 font-mono text-xs font-bold"
                  style={{
                    color: `var(--color-${zone.color})`,
                    backgroundColor: `color-mix(in oklab, var(--color-${zone.color}) 15%, transparent)`,
                  }}
                >
                  ACTIVE
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
