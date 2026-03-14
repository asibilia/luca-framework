"use client";

import { Brain } from "lucide-react";

import { useContextMetrics } from "~/hooks/use-context-metrics";

/**
 * Resolve context zone to a CSS custom property color name.
 *
 * Maps the four quality degradation zones to the project's
 * existing CSS custom property color system:
 * - peak: success (green)
 * - good: info (blue)
 * - degrading: warning (amber)
 * - stop: destructive (red)
 */
function zoneColor(zone: string): string {
  switch (zone) {
    case "peak":
      return "success";
    case "good":
      return "info";
    case "degrading":
      return "warning";
    case "stop":
      return "destructive";
    default:
      return "muted-foreground";
  }
}

/**
 * Resolve zone to a human-readable label for display and tooltips.
 */
function zoneLabel(zone: string): string {
  switch (zone) {
    case "peak":
      return "Peak";
    case "good":
      return "Good";
    case "degrading":
      return "Degrading";
    case "stop":
      return "Critical";
    default:
      return zone;
  }
}

/**
 * Compact context window usage bar for the observer header.
 *
 * Shows a progress bar with zone-based coloring, percentage,
 * and a Brain icon. Hides when no metrics are available (no active session).
 * Polls every 10s via the useContextMetrics hook.
 *
 * Renders as a single compact line using text-xs and h-1 progress bar,
 * designed to sit unobtrusively in the header alongside vault/theme controls.
 */
export function ContextWindowBar() {
  const { metrics } = useContextMetrics();

  if (!metrics) return null;

  const color = zoneColor(metrics.zone);

  return (
    <div
      className="flex items-center gap-1.5"
      title={`Context: ${zoneLabel(metrics.zone)} · ${metrics.transcript_bytes.toLocaleString()} bytes`}
    >
      <Brain
        className="size-3.5"
        style={{ color: `var(--color-${color})` }}
        aria-hidden="true"
      />
      <div className="relative h-1 w-20 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${Math.min(metrics.usage_percent, 100)}%`,
            backgroundColor: `var(--color-${color})`,
          }}
        />
      </div>
      <span
        className="font-mono text-xs"
        style={{ color: `var(--color-${color})` }}
      >
        {metrics.usage_percent}%
      </span>
    </div>
  );
}
