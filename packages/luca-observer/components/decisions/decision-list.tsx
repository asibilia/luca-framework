"use client";

import { useState } from "react";

import { EmptyState } from "~/components/shared/empty-state";
import { ErrorBoundary } from "~/components/shared/error-boundary";
import { DecisionCard } from "~/components/decisions/decision-card";

import type { DecisionInfo } from "~/hooks/use-decision-trail";
import type { MuninnEntityEngram } from "~/lib/muninn-types";

/**
 * Renders a filterable list of decisions as collapsible cards.
 *
 * Displays a count header with subtitle, a text filter input for
 * client-side filtering by name or content, and a scrollable card list.
 * Each DecisionCard is wrapped in an ErrorBoundary for resilience.
 * Shows EmptyState when no decisions exist, or a filter-no-match
 * message when the active filter produces zero results.
 *
 * Follows the SessionList pattern with an added text filter.
 *
 * @param decisions - Array of parsed decision metadata objects
 * @param onFetchDetail - Callback passed to each card for detail expansion
 */
export function DecisionList({
  decisions,
  onFetchDetail,
}: {
  decisions: DecisionInfo[];
  onFetchDetail: (concept: string) => Promise<MuninnEntityEngram[]>;
}) {
  const [filter, setFilter] = useState("");

  if (decisions.length === 0) {
    return (
      <EmptyState
        title="No Decisions"
        message="MuninnDB decision data will appear here once decisions are stored."
      />
    );
  }

  const lowerFilter = filter.toLowerCase();
  const filtered = lowerFilter
    ? decisions.filter(
        (d) =>
          d.name.toLowerCase().includes(lowerFilter) ||
          d.content.toLowerCase().includes(lowerFilter),
      )
    : decisions;

  const count = decisions.length;

  return (
    <div
      role="region"
      aria-label="Decision trail"
      className="flex flex-col rounded-lg border border-border bg-card"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
            Decisions
          </p>
          <p className="mt-0.5 font-mono text-xs text-muted-foreground">
            Decision Audit Trail
          </p>
        </div>
        <span className="rounded-sm border border-border px-2 py-0.5 font-mono text-xs text-muted-foreground">
          {count} {count === 1 ? "decision" : "decisions"}
        </span>
      </div>

      {/* Filter input */}
      <div className="border-b border-border px-4 py-2">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter decisions by name or content..."
          aria-label="Filter decisions"
          className="w-full rounded border border-border bg-background px-3 py-1.5 font-mono text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        />
      </div>

      {/* Card list */}
      <div className="max-h-[36rem] overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="px-4 py-6 text-center font-mono text-xs text-muted-foreground">
            No decisions match your filter.
          </p>
        ) : (
          filtered.map((decision) => (
            <ErrorBoundary
              key={decision.concept}
              name={`Decision:${decision.decision_id}`}
            >
              <DecisionCard decision={decision} onFetchDetail={onFetchDetail} />
            </ErrorBoundary>
          ))
        )}
      </div>
    </div>
  );
}
