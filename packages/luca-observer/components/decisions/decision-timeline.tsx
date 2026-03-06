"use client";

import { useState } from "react";

/**
 * Decision entry shape from the use-decision-trail hook.
 */
interface Decision {
  id: number;
  session_id: string;
  decision_type: string;
  chosen_approach: string;
  alternatives: string[];
  reasoning: string;
  timestamp: number;
}

/**
 * Decision type badge color mapping.
 */
const DECISION_TYPE_COLORS: Record<string, string> = {
  routing: "info",
  planning: "accent",
  execution: "warning",
  verification: "success",
  recovery: "destructive",
};

/**
 * Chronological timeline of decisions with expandable reasoning cards.
 *
 * Each decision shows a type badge, the chosen approach, and an expandable
 * section with reasoning and alternatives considered.
 *
 * @param decisions - Array of decision entries from the decision trail hook
 */
export function DecisionTimeline({ decisions }: { decisions: Decision[] }) {
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  const toggleExpanded = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="space-y-3">
      {decisions.map((decision) => {
        const isExpanded = expandedIds.has(decision.id);
        const color =
          DECISION_TYPE_COLORS[decision.decision_type] ?? "muted-foreground";
        const timestamp = decision.timestamp
          ? new Date(decision.timestamp).toLocaleTimeString()
          : "";

        return (
          <div
            key={decision.id}
            className="rounded-lg border border-border bg-card"
          >
            {/* Header row */}
            <button
              type="button"
              className="flex w-full items-center gap-3 px-4 py-3 text-left focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
              onClick={() => toggleExpanded(decision.id)}
              aria-expanded={isExpanded}
            >
              {/* Timeline dot */}
              <div
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: `var(--color-${color})` }}
              />

              {/* Type badge */}
              <span
                className="shrink-0 rounded px-2 py-0.5 font-mono text-xs font-medium"
                style={{
                  color: `var(--color-${color})`,
                  backgroundColor: `color-mix(in oklab, var(--color-${color}) 15%, transparent)`,
                }}
              >
                {decision.decision_type}
              </span>

              {/* Chosen approach */}
              <span className="flex-1 truncate font-mono text-sm text-foreground">
                {decision.chosen_approach}
              </span>

              {/* Timestamp */}
              {timestamp && (
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  {timestamp}
                </span>
              )}

              {/* Expand indicator */}
              <span className="shrink-0 font-mono text-xs text-muted-foreground">
                {isExpanded ? "−" : "+"}
              </span>
            </button>

            {/* Expanded detail */}
            {isExpanded && (
              <div className="border-t border-border px-4 py-3">
                {/* Reasoning */}
                {decision.reasoning && (
                  <div className="mb-3">
                    <p className="mb-1 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                      Reasoning
                    </p>
                    <p className="font-mono text-sm text-foreground/80">
                      {decision.reasoning}
                    </p>
                  </div>
                )}

                {/* Alternatives */}
                {decision.alternatives.length > 0 && (
                  <div>
                    <p className="mb-1 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                      Alternatives Considered
                    </p>
                    <ul className="space-y-1">
                      {decision.alternatives.map((alt, idx) => (
                        <li
                          key={idx}
                          className="flex items-start gap-2 font-mono text-sm text-muted-foreground"
                        >
                          <span className="mt-1 shrink-0 text-xs">-</span>
                          <span>{alt}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Session ID */}
                <div className="mt-3 border-t border-border pt-2">
                  <span className="font-mono text-xs text-muted-foreground">
                    Session: {decision.session_id.slice(0, 12)}
                  </span>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
