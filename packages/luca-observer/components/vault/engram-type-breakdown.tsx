"use client";

import { EmptyState } from "~/components/shared/empty-state";

import type { EngramTypeItem } from "~/hooks/use-vault-health";

/**
 * CSS horizontal bar chart showing engram type distribution.
 *
 * Reuses the Phase 06 category-breakdown.tsx pattern: each row displays
 * a type label, a proportional horizontal bar, and a count value.
 * Rows are pre-sorted by count descending (from the hook).
 * Bar widths use percentage values with a 2% minimum for visibility.
 *
 * @param breakdown - Array of engram type items from useVaultHealth hook
 */
export function EngramTypeBreakdown({
  breakdown,
}: {
  breakdown: EngramTypeItem[];
}) {
  if (breakdown.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
            Engram Type Breakdown
          </p>
        </div>
        <div className="p-4">
          <EmptyState message="No engram type data available." />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
          Engram Type Breakdown
        </p>
      </div>

      <div className="flex flex-col gap-3 p-4">
        {breakdown.map((item) => {
          const barWidth = Math.max(item.percentage, 2);

          return (
            <div key={item.type} className="flex items-center gap-3">
              {/* Type label */}
              <span className="w-28 shrink-0 font-mono text-xs text-muted-foreground">
                {item.label}
              </span>

              {/* Bar track */}
              <div className="h-4 flex-1 rounded-full bg-muted">
                <div
                  className="h-4 rounded-full transition-all"
                  style={{
                    width: `${barWidth}%`,
                    backgroundColor: `var(--color-${item.color})`,
                  }}
                />
              </div>

              {/* Count */}
              <span className="w-10 shrink-0 text-right font-mono text-xs font-medium">
                {item.count}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
