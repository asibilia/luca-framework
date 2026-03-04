"use client";

import { PageContainer } from "~/components/layout/page-container";
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
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="font-mono text-sm text-muted-foreground">
            Loading decisions...
          </p>
        </div>
      ) : decisions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="font-mono text-sm text-muted-foreground">
            No decisions recorded yet.
          </p>
        </div>
      ) : (
        <DecisionTimeline decisions={decisions} />
      )}
    </PageContainer>
  );
}
