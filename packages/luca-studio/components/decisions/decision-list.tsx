"use client";

import { useState } from "react";

import { EmptyState } from "~/components/shared/empty-state";
import { ErrorBoundary } from "~/components/shared/error-boundary";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
} from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Input } from "~/components/ui/input";
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
    <Card role="region" aria-label="Decision trail" className="flex flex-col">
      {/* Header */}
      <CardHeader className="border-b">
        <CardTitle className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
          Decisions
        </CardTitle>
        <CardDescription className="font-mono text-xs">
          Decision Audit Trail
        </CardDescription>
        <CardAction>
          <Badge variant="outline" className="font-mono text-xs">
            {count} {count === 1 ? "decision" : "decisions"}
          </Badge>
        </CardAction>
      </CardHeader>

      {/* Filter input */}
      <div className="border-b border-border px-4 py-2">
        <Input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter decisions by name or content..."
          aria-label="Filter decisions"
          className="font-mono text-xs"
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
    </Card>
  );
}
