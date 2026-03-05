"use client";

import { formatDateTime } from "~/lib/format";
import { EmptyState } from "~/components/shared/empty-state";
import type { SessionPlanSnapshot } from "~/lib/types";

/**
 * Summary card showing the current session plan metadata.
 *
 * Displays total effort points, session cap in minutes, number of items
 * planned, generation timestamp, and the plan rationale as a blockquote.
 * Shows a "No Plan" empty state when plan is null.
 *
 * @param plan - The session plan snapshot, or null if no plan exists
 *
 * @example
 * ```tsx
 * <SessionPlanOverview plan={planData} />
 * ```
 */
export function SessionPlanOverview({
  plan,
}: {
  plan: SessionPlanSnapshot | null;
}) {
  if (!plan) {
    return (
      <EmptyState
        title="No Plan"
        message="No session plan has been generated yet."
      />
    );
  }

  const stats = [
    {
      label: "Effort Points",
      value: plan.total_effort_points.toString(),
      color: "accent",
    },
    {
      label: "Session Cap",
      value: `${plan.session_cap_minutes}m`,
      color: "info",
    },
    {
      label: "Items Planned",
      value: plan.items.length.toString(),
      color: "accent",
    },
  ];

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
          Session Plan
        </p>
        <span className="font-mono text-xs text-muted-foreground">
          {formatDateTime(plan.generated_at)}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3">
        {stats.map((stat) => (
          <div key={stat.label}>
            <p className="font-mono text-xs text-muted-foreground">
              {stat.label}
            </p>
            <p
              className="mt-0.5 font-mono text-lg font-bold"
              style={{ color: `var(--color-${stat.color})` }}
            >
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {plan.rationale && (
        <blockquote className="mt-4 border-l-2 border-muted-foreground/30 pl-3">
          <p className="font-mono text-xs italic text-muted-foreground">
            {plan.rationale}
          </p>
        </blockquote>
      )}
    </div>
  );
}
