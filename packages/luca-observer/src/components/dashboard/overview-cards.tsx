"use client";

import { useWorkflowState } from "~/hooks/use-workflow-state";
import { WORKFLOW_STATES, COMPLEXITY_LEVELS } from "~/lib/constants";

import type { StoredEvent } from "~/lib/types";

/**
 * Dashboard overview cards showing key metrics.
 *
 * Displays workflow state, complexity, event count, and phase.
 */
export function OverviewCards({ events }: { events: StoredEvent[] }) {
  const { data } = useWorkflowState();

  const stateKey = data?.workflow_state ?? "idle";
  const complexityKey = data?.complexity ?? "MODERATE";
  const phase = data?.current_phase ?? 0;
  const oversight = data?.oversight ?? "milestone";

  const stateConfig =
    WORKFLOW_STATES[stateKey as keyof typeof WORKFLOW_STATES] ??
    WORKFLOW_STATES.idle;
  const complexityConfig =
    COMPLEXITY_LEVELS[complexityKey as keyof typeof COMPLEXITY_LEVELS] ??
    COMPLEXITY_LEVELS.MODERATE;

  const cards = [
    {
      title: "Workflow State",
      value: stateConfig.label,
      color: stateConfig.color,
    },
    {
      title: "Complexity",
      value: complexityConfig.label,
      subtitle: complexityConfig.tier,
      color: complexityConfig.color,
    },
    {
      title: "Events",
      value: events.length.toString(),
      color: "accent",
    },
    {
      title: "Phase",
      value: phase > 0 ? `Phase ${phase}` : "None",
      subtitle: oversight,
      color: "info",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.title}
          className="rounded-lg border border-border bg-card p-4"
        >
          <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
            {card.title}
          </p>
          <p
            className="mt-1 font-mono text-lg font-bold"
            style={{ color: `var(--color-${card.color})` }}
          >
            {card.value}
          </p>
          {card.subtitle && (
            <p className="mt-0.5 font-mono text-xs text-muted-foreground">
              {card.subtitle}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
