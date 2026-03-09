"use client";

import { EmptyState } from "~/components/shared/empty-state";

import type { TimelinePeriod } from "~/hooks/use-learning-evolution";

/**
 * Category colors for stacked bar segments.
 *
 * Maps category keys to CSS custom property names matching
 * the CATEGORY_DISPLAY convention used across the observer.
 */
const SEGMENT_COLORS: Record<string, string> = {
  pattern: "var(--color-success)",
  decision: "var(--color-info)",
  pitfall: "var(--color-warning)",
  preference: "var(--color-accent)",
  uncategorized: "var(--color-muted-foreground)",
};

/** Ordered list of categories for consistent stacking order. */
const CATEGORY_ORDER = [
  "pattern",
  "decision",
  "pitfall",
  "preference",
  "uncategorized",
];

/**
 * CSS vertical bar chart showing learning activity over time.
 *
 * Each bar represents a time period (day or week). Bars are stacked
 * by category using flexbox column direction with proportional segment
 * heights. The tallest bar fills 100% of the chart height.
 *
 * Establishes reusable CSS charting patterns:
 * - CSS custom properties for bar colors
 * - Percentage-based bar heights relative to max
 * - Flexbox column stacking for segments
 *
 * @param timeline - Array of time periods from useLearningEvolution hook
 */
export function LearningTimeline({ timeline }: { timeline: TimelinePeriod[] }) {
  if (timeline.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
            Learning Timeline
          </p>
          <p className="mt-0.5 font-mono text-xs text-muted-foreground">
            Engrams over time
          </p>
        </div>
        <div className="p-4">
          <EmptyState message="No timeline data available." />
        </div>
      </div>
    );
  }

  const maxTotal = Math.max(...timeline.map((p) => p.total), 1);

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
          Learning Timeline
        </p>
        <p className="mt-0.5 font-mono text-xs text-muted-foreground">
          Engrams over time
        </p>
      </div>

      <div className="px-4 pb-2 pt-4">
        {/* Chart area */}
        <div className="flex h-48 items-end gap-1">
          {timeline.map((period, idx) => {
            const barHeight = (period.total / maxTotal) * 100;

            return (
              <div
                key={idx}
                className="flex flex-1 flex-col justify-end"
                style={{ height: "100%" }}
                title={`${period.label}: ${period.total} engrams`}
              >
                <div
                  className="flex flex-col-reverse overflow-hidden rounded-t"
                  style={{ height: `${barHeight}%` }}
                >
                  {CATEGORY_ORDER.map((cat) => {
                    const count = period.counts[cat];
                    if (!count) return null;

                    const segmentHeight = (count / period.total) * 100;

                    return (
                      <div
                        key={cat}
                        style={{
                          height: `${segmentHeight}%`,
                          backgroundColor: SEGMENT_COLORS[cat],
                          minHeight: "2px",
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* X-axis labels */}
        <div className="mt-1 flex gap-1">
          {timeline.map((period, idx) => (
            <div
              key={idx}
              className="flex-1 overflow-hidden text-center font-mono text-xs text-muted-foreground"
            >
              <span className="block truncate">{period.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="border-t border-border px-4 py-2">
        <div className="flex flex-wrap gap-3">
          {CATEGORY_ORDER.filter((cat) =>
            timeline.some((p) => (p.counts[cat] ?? 0) > 0),
          ).map((cat) => (
            <div key={cat} className="flex items-center gap-1.5">
              <div
                className="h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: SEGMENT_COLORS[cat] }}
              />
              <span className="font-mono text-xs text-muted-foreground">
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
