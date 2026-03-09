"use client";

import type { MuninnTimelineEntry } from "~/lib/muninn-types";
import { formatDateTime } from "~/lib/format";
import { EmptyState } from "~/components/shared/empty-state";

/**
 * Vertical timeline list for an entity's chronological engram history.
 *
 * Displays each timeline entry with timestamp, concept, summary snippet,
 * and engram ID along a left-side timeline rail.
 *
 * @param timeline - Array of MuninnTimelineEntry objects
 */
export function EntityTimeline({
  timeline,
}: {
  timeline: MuninnTimelineEntry[];
}) {
  if (timeline.length === 0) {
    return <EmptyState message="No timeline entries found" />;
  }

  return (
    <div className="space-y-0">
      {timeline.map((entry) => (
        <div
          key={entry.engram_id}
          className="border-l-2 border-accent/30 pl-4 py-2"
        >
          <p className="font-mono text-xs text-muted-foreground">
            {formatDateTime(entry.created_at)}
          </p>
          <p className="font-mono text-sm font-medium text-foreground mt-0.5">
            {entry.concept}
          </p>
          {entry.summary && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {entry.summary.length > 200
                ? entry.summary.slice(0, 200) + "..."
                : entry.summary}
            </p>
          )}
          <p className="font-mono text-xs text-muted-foreground/60 mt-0.5">
            {entry.engram_id}
          </p>
        </div>
      ))}
    </div>
  );
}
