"use client";

import { PageContainer } from "~/components/layout/page-container";
import { EmptyState } from "~/components/shared/empty-state";
import { ErrorBoundary } from "~/components/shared/error-boundary";
import { LoadingSkeleton } from "~/components/shared/loading-skeleton";
import { DecisionTimeline } from "~/components/decisions/decision-timeline";
import { useDecisionTrail } from "~/hooks/use-decision-trail";

/**
 * Decision trail page.
 *
 * Shows a chronological timeline of decisions made during sessions,
 * with decision type badges and expandable reasoning cards.
 */
export default function DecisionsPage() {
  const { decisions, loading } = useDecisionTrail();

  return (
    <PageContainer
      title="Decisions"
      subtitle="Decision audit trail with reasoning and alternatives"
    >
      {loading ? (
        <LoadingSkeleton variant="table" rows={8} columns={3} />
      ) : decisions.length === 0 ? (
        <EmptyState message="No decisions recorded yet." />
      ) : (
        <ErrorBoundary name="DecisionTimeline">
          <DecisionTimeline decisions={decisions} />
        </ErrorBoundary>
      )}
    </PageContainer>
  );
}
