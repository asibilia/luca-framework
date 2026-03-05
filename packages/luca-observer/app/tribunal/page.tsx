"use client";

import { PageContainer } from "~/components/layout/page-container";
import { EmptyState } from "~/components/shared/empty-state";
import { TribunalSummaryBanner } from "~/components/tribunal/tribunal-summary-banner";
import { FindingsTable } from "~/components/tribunal/findings-table";
import { DisagreementsPanel } from "~/components/tribunal/disagreements-panel";
import { RebuttalTimeline } from "~/components/tribunal/rebuttal-timeline";
import { useTribunal } from "~/hooks/use-tribunal";

/**
 * Tribunal debate results page.
 *
 * Shows tribunal session data including summary metrics, findings
 * overview, disagreements between reviewers, and rebuttal outcomes.
 * Handles loading state and empty state when no tribunal has run.
 */
export default function TribunalPage() {
  const { result, hasResult, loading } = useTribunal();

  return (
    <PageContainer
      title="Tribunal"
      subtitle="Debate results, findings, and rebuttals"
    >
      {loading ? (
        <EmptyState message="Loading tribunal data..." />
      ) : !hasResult ? (
        <EmptyState
          title="No Tribunal Run"
          message="Tribunal data will appear here when a code review with debate is triggered at MODERATE+ complexity."
        />
      ) : (
        <div className="space-y-6">
          <TribunalSummaryBanner result={result} />
          <div className="grid gap-6 lg:grid-cols-2">
            <DisagreementsPanel
              disagreementsDetected={result?.disagreements_detected ?? 0}
              rebuttalsConducted={result?.rebuttals_conducted ?? 0}
            />
            <RebuttalTimeline
              rebuttalsConducted={result?.rebuttals_conducted ?? 0}
              findingsWithdrawn={result?.findings_withdrawn ?? 0}
              findingsModified={result?.findings_modified ?? 0}
              debateTokenCost={result?.debate_token_cost ?? 0}
            />
          </div>
          <FindingsTable
            totalFindings={result?.total_findings ?? 0}
            findingsWithdrawn={result?.findings_withdrawn ?? 0}
            findingsModified={result?.findings_modified ?? 0}
          />
        </div>
      )}
    </PageContainer>
  );
}
