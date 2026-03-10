"use client";

import Link from "next/link";

import type { EntityType } from "~/lib/graph-types";
import { resolveEntityType, TYPE_COLORS } from "~/lib/graph-types";
import { EmptyState } from "~/components/shared/empty-state";

/**
 * Entity co-occurrences list component.
 *
 * Displays entities that frequently appear alongside the current entity,
 * sorted by co-occurrence count (desc). Each entity name links to its
 * own deep-dive page.
 *
 * @param coOccurrences - Array of { entity_name, count } pairs
 */
export function EntityCoOccurrences({
  coOccurrences,
}: {
  coOccurrences: Array<{ entity_name: string; count: number }>;
}) {
  if (coOccurrences.length === 0) {
    return <EmptyState message="No co-occurring entities found" />;
  }

  return (
    <div>
      <p className="font-mono text-xs text-muted-foreground mb-3">
        {coOccurrences.length} co-occurring entit
        {coOccurrences.length !== 1 ? "ies" : "y"}
      </p>
      <div className="space-y-0">
        {coOccurrences.map((coOcc) => {
          const type = resolveEntityType(undefined, coOcc.entity_name);
          const color = TYPE_COLORS[type as EntityType] ?? TYPE_COLORS.other;

          return (
            <div
              key={coOcc.entity_name}
              className="flex items-center justify-between py-2 border-b border-border last:border-b-0"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <Link
                  href={`/entities/${encodeURIComponent(coOcc.entity_name)}`}
                  className="font-mono text-sm text-primary hover:underline truncate"
                >
                  {coOcc.entity_name}
                </Link>
              </div>
              <span className="font-mono text-xs bg-muted rounded-full px-2 py-0.5 shrink-0 ml-2">
                {coOcc.count}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
