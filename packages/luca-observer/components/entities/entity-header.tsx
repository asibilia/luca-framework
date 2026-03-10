"use client";

import { Card, CardContent } from "~/components/ui/card";

import type { MuninnEntity } from "~/lib/muninn-types";
import type { EntityType } from "~/lib/graph-types";
import { resolveEntityType, TYPE_COLORS } from "~/lib/graph-types";
import { relativeTime } from "~/lib/format";

/**
 * Entity deep-dive header component.
 *
 * Displays entity name, type badge, state badge, and metadata row
 * (first seen, mention count, confidence).
 *
 * @param entity - The MuninnDB entity aggregate
 */
export function EntityHeader({ entity }: { entity: MuninnEntity }) {
  const type = resolveEntityType(undefined, entity.name);
  const typeColor = TYPE_COLORS[type as EntityType] ?? TYPE_COLORS.other;

  return (
    <Card>
      <CardContent>
        {/* Name + badges row */}
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-2xl font-bold font-mono text-foreground">
            {entity.name}
          </h2>

          {/* Type badge */}
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-xs font-medium"
            style={{
              backgroundColor: typeColor + "1a",
              color: typeColor,
              border: `1px solid ${typeColor}33`,
            }}
          >
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: typeColor }}
            />
            {type}
          </span>

          {/* State badge */}
          <StateBadge state={entity.state} />
        </div>

        {/* Metadata row */}
        <div className="mt-3 flex flex-wrap items-center gap-4 font-mono text-xs text-muted-foreground">
          {entity.first_seen && (
            <span>
              First seen: {relativeTime(new Date(entity.first_seen).getTime())}
            </span>
          )}
          <span>Mentions: {entity.mention_count}</span>
          <span>Confidence: {(entity.confidence * 100).toFixed(0)}%</span>
        </div>
      </CardContent>
    </Card>
  );
}

// -- State badge --------------------------------------------------------------

const STATE_COLORS: Record<string, string> = {
  active: "#22c55e",
  deprecated: "#f97316",
  merged: "#3b82f6",
  resolved: "#6b7280",
};

function StateBadge({ state }: { state: string }) {
  const color = STATE_COLORS[state] ?? "#6b7280";

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-xs font-medium"
      style={{
        backgroundColor: color + "1a",
        color,
        border: `1px solid ${color}33`,
      }}
    >
      <span
        className="inline-block h-2 w-2 rounded-full"
        style={{ backgroundColor: color }}
      />
      {state}
    </span>
  );
}
