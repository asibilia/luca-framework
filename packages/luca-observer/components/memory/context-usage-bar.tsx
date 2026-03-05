"use client";

import { useMemo } from "react";

import { formatChars } from "~/lib/format";

/**
 * Segment definition for the context usage bar.
 */
interface Segment {
  label: string;
  chars: number;
  color: string;
  percentage: number;
}

/**
 * Estimated max context window in characters.
 *
 * Claude models support ~200k tokens. Using chars/4 heuristic,
 * that is ~800k characters. We use a conservative estimate of
 * 200k characters for the context budget (memory files are only
 * one part of the total context).
 */
const ESTIMATED_CONTEXT_BUDGET = 200_000;

/**
 * Resolve the zone color based on total usage percentage.
 *
 * - Under 30%: green (healthy)
 * - 30-50%: info/blue (good)
 * - 50-70%: warning/yellow (degrading)
 * - 70%+: destructive/red (critical)
 */
function zoneColor(percentage: number): string {
  if (percentage < 30) return "success";
  if (percentage < 50) return "info";
  if (percentage < 70) return "warning";
  return "destructive";
}

/**
 * Visual bar showing estimated context usage across all memory files.
 *
 * Displays a horizontal bar segmented by file: BRAIN (blue),
 * MEMORY (green), WORKING (orange). Each segment is proportional
 * to its content size. Shows total size in characters and estimated
 * tokens (chars/4 heuristic). Color-coded by usage zone.
 *
 * @param brain - Raw BRAIN.md content
 * @param memory - Raw MEMORY.md content
 * @param working - Raw WORKING.md content
 */
export function ContextUsageBar({
  brain,
  memory,
  working,
}: {
  brain: string;
  memory: string;
  working: string;
}) {
  const segments = useMemo((): Segment[] => {
    const brainChars = brain.length;
    const memoryChars = memory.length;
    const workingChars = working.length;
    const total = brainChars + memoryChars + workingChars;

    if (total === 0) {
      return [
        { label: "BRAIN", chars: 0, color: "info", percentage: 0 },
        { label: "MEMORY", chars: 0, color: "success", percentage: 0 },
        { label: "WORKING", chars: 0, color: "warning", percentage: 0 },
      ];
    }

    return [
      {
        label: "BRAIN",
        chars: brainChars,
        color: "info",
        percentage: (brainChars / ESTIMATED_CONTEXT_BUDGET) * 100,
      },
      {
        label: "MEMORY",
        chars: memoryChars,
        color: "success",
        percentage: (memoryChars / ESTIMATED_CONTEXT_BUDGET) * 100,
      },
      {
        label: "WORKING",
        chars: workingChars,
        color: "warning",
        percentage: (workingChars / ESTIMATED_CONTEXT_BUDGET) * 100,
      },
    ];
  }, [brain, memory, working]);

  const totalChars = segments.reduce((sum, s) => sum + s.chars, 0);
  const totalPercentage = (totalChars / ESTIMATED_CONTEXT_BUDGET) * 100;
  const estimatedTokens = Math.round(totalChars / 4);
  const zone = zoneColor(totalPercentage);

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
          Context Usage
        </p>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-muted-foreground">
            {formatChars(totalChars)} chars
          </span>
          <span className="font-mono text-xs text-muted-foreground">
            ~{estimatedTokens.toLocaleString()} tokens
          </span>
          <span
            className="rounded-sm px-1.5 py-0.5 font-mono text-xs font-medium"
            style={{
              color: `var(--color-${zone})`,
              backgroundColor: `color-mix(in oklab, var(--color-${zone}) 15%, transparent)`,
            }}
          >
            {totalPercentage.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Bar */}
      <div className="mt-3 h-3 overflow-hidden rounded-full bg-muted/50">
        <div className="flex h-full">
          {segments.map((seg) => (
            <div
              key={seg.label}
              className="h-full transition-all duration-300"
              style={{
                width: `${Math.max(seg.percentage, seg.chars > 0 ? 0.5 : 0)}%`,
                backgroundColor: `var(--color-${seg.color})`,
                opacity: seg.chars > 0 ? 0.8 : 0,
              }}
            />
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-4">
        {segments.map((seg) => (
          <div key={seg.label} className="flex items-center gap-1.5">
            <div
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: `var(--color-${seg.color})` }}
            />
            <span className="font-mono text-xs text-muted-foreground">
              {seg.label}
            </span>
            <span className="font-mono text-xs text-foreground">
              {formatChars(seg.chars)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
