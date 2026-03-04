"use client";

import { useState } from "react";

import { COMPLEXITY_LEVELS } from "~/lib/constants";
import type { WSJFScoredItemSnapshot } from "~/lib/types";

/**
 * Color mapping for quality zone badges.
 *
 * Maps WSJF assigned_zone values to CSS variable color names
 * used across the observer design system.
 */
const ZONE_COLORS: Record<string, string> = {
  peak: "success",
  good: "info",
  degrading: "warning",
  stop: "destructive",
};

type SortField = "wsjf_score" | "title" | "area" | "complexity";
type SortDirection = "asc" | "desc";

/**
 * Sortable table showing WSJF-scored items from the session plan.
 *
 * Displays each item with title, area, WSJF score, complexity badge,
 * quality zone badge, and dependency status. The Big Rock item
 * (first priority item) is visually distinguished with a left border accent.
 *
 * Columns are sortable by clicking the header. Default sort is WSJF score
 * descending.
 *
 * @param items - Array of WSJF scored items to display
 * @param bigRockIndex - Index of the Big Rock item (usually 0)
 *
 * @example
 * ```tsx
 * <WSJFScoreTable items={plan.items} bigRockIndex={plan.big_rock_index} />
 * ```
 */
export function WSJFScoreTable({
  items,
  bigRockIndex,
}: {
  items: WSJFScoredItemSnapshot[];
  bigRockIndex?: number;
}) {
  const [sortField, setSortField] = useState<SortField>("wsjf_score");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center">
        <p className="font-mono text-sm text-muted-foreground">
          No WSJF-scored items in this plan
        </p>
      </div>
    );
  }

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection(field === "wsjf_score" ? "desc" : "asc");
    }
  };

  const sorted = [...items].sort((a, b) => {
    const mul = sortDirection === "asc" ? 1 : -1;
    if (sortField === "wsjf_score") return mul * (a.wsjf_score - b.wsjf_score);
    if (sortField === "title") return mul * a.title.localeCompare(b.title);
    if (sortField === "area") return mul * a.area.localeCompare(b.area);
    if (sortField === "complexity")
      return mul * a.complexity.localeCompare(b.complexity);
    return 0;
  });

  const sortIndicator = (field: SortField) => {
    if (sortField !== field) return "";
    return sortDirection === "asc" ? " \u25B2" : " \u25BC";
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full">
        <thead className="bg-card">
          <tr className="border-b border-border font-mono text-xs uppercase tracking-wider text-muted-foreground">
            <th
              className="cursor-pointer px-3 py-2 text-left hover:text-foreground"
              onClick={() => handleSort("title")}
            >
              Title{sortIndicator("title")}
            </th>
            <th
              className="cursor-pointer px-3 py-2 text-left hover:text-foreground"
              onClick={() => handleSort("area")}
            >
              Area{sortIndicator("area")}
            </th>
            <th
              className="cursor-pointer px-3 py-2 text-right hover:text-foreground"
              onClick={() => handleSort("wsjf_score")}
            >
              WSJF{sortIndicator("wsjf_score")}
            </th>
            <th
              className="cursor-pointer px-3 py-2 text-left hover:text-foreground"
              onClick={() => handleSort("complexity")}
            >
              Complexity{sortIndicator("complexity")}
            </th>
            <th className="px-3 py-2 text-left">Zone</th>
            <th className="px-3 py-2 text-left">Deps</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((item, idx) => {
            const isBigRock =
              bigRockIndex !== undefined &&
              items.indexOf(item) === bigRockIndex;

            const complexityConfig =
              COMPLEXITY_LEVELS[
                item.complexity as keyof typeof COMPLEXITY_LEVELS
              ] ?? null;
            const complexityColor =
              complexityConfig?.color ?? "muted-foreground";

            const zoneColor = item.assigned_zone
              ? (ZONE_COLORS[item.assigned_zone] ?? "muted-foreground")
              : "muted-foreground";

            return (
              <tr
                key={`${item.todo_path}-${idx}`}
                className={`border-b border-border last:border-b-0 hover:bg-muted/50 ${
                  isBigRock ? "border-l-2" : ""
                }`}
                style={
                  isBigRock
                    ? { borderLeftColor: "var(--color-warning)" }
                    : undefined
                }
              >
                <td className="px-3 py-2 font-mono text-sm text-foreground">
                  <div className="flex items-center gap-2">
                    {isBigRock && (
                      <span
                        className="rounded px-1.5 py-0.5 font-mono text-xs font-bold"
                        style={{
                          color: "var(--color-warning)",
                          backgroundColor:
                            "color-mix(in srgb, var(--color-warning) 15%, transparent)",
                        }}
                      >
                        BIG ROCK
                      </span>
                    )}
                    <span>{item.title}</span>
                  </div>
                </td>
                <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                  {item.area}
                </td>
                <td className="px-3 py-2 text-right font-mono text-sm font-bold text-foreground">
                  {item.wsjf_score.toFixed(1)}
                </td>
                <td className="px-3 py-2">
                  <span
                    className="rounded px-2 py-0.5 font-mono text-xs font-medium"
                    style={{
                      color: `var(--color-${complexityColor})`,
                      backgroundColor: `color-mix(in srgb, var(--color-${complexityColor}) 15%, transparent)`,
                    }}
                  >
                    {complexityConfig?.label ?? item.complexity}
                  </span>
                </td>
                <td className="px-3 py-2">
                  {item.assigned_zone ? (
                    <span
                      className="rounded px-2 py-0.5 font-mono text-xs font-medium"
                      style={{
                        color: `var(--color-${zoneColor})`,
                        backgroundColor: `color-mix(in srgb, var(--color-${zoneColor}) 15%, transparent)`,
                      }}
                    >
                      {item.assigned_zone}
                    </span>
                  ) : (
                    <span className="font-mono text-xs text-muted-foreground">
                      --
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <span
                    className="font-mono text-xs font-medium"
                    style={{
                      color: item.dependency_free
                        ? "var(--color-success)"
                        : "var(--color-warning)",
                    }}
                  >
                    {item.dependency_free ? "Free" : "Blocked"}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
