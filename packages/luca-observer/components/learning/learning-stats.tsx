"use client";

import { EmptyState } from "~/components/shared/empty-state";

import type { LearningStats as LearningStatsType } from "~/hooks/use-learning-evolution";

/**
 * Category card configuration for stat display.
 *
 * Maps each category to its CSS color token for the count value.
 * "Total" uses default foreground color (no style override).
 */
const STAT_CARDS: Array<{
  key: keyof LearningStatsType;
  label: string;
  colorVar: string | null;
}> = [
  { key: "total", label: "Total", colorVar: null },
  { key: "patterns", label: "Patterns", colorVar: "var(--color-success)" },
  { key: "decisions", label: "Decisions", colorVar: "var(--color-info)" },
  { key: "pitfalls", label: "Pitfalls", colorVar: "var(--color-warning)" },
  { key: "preferences", label: "Preferences", colorVar: "var(--color-accent)" },
];

/**
 * Summary stat cards for the Learning Evolution page.
 *
 * Renders 5 cards in a responsive grid showing total, patterns,
 * decisions, pitfalls, and preferences counts. If all counts are 0,
 * renders an EmptyState instead.
 *
 * @param stats - Category counts from useLearningEvolution hook
 */
export function LearningStats({ stats }: { stats: LearningStatsType }) {
  if (stats.total === 0) {
    return (
      <EmptyState
        title="No Learnings"
        message="MuninnDB learning engrams will appear here once stored."
      />
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {STAT_CARDS.map((card) => (
        <div
          key={card.key}
          className="rounded-lg border border-border bg-card p-4"
        >
          <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
            {card.label}
          </p>
          <p
            className="mt-1 font-mono text-2xl font-bold"
            style={card.colorVar ? { color: card.colorVar } : undefined}
          >
            {stats[card.key]}
          </p>
        </div>
      ))}
    </div>
  );
}
