"use client";

import { RefreshCw } from "lucide-react";

import { PageContainer } from "~/components/layout/page-container";
import { Button } from "~/components/ui/button";
import { ErrorBoundary } from "~/components/shared/error-boundary";
import { LoadingSkeleton } from "~/components/shared/loading-skeleton";
import { DecisionList } from "~/components/decisions/decision-list";
import { useDecisionTrail } from "~/hooks/use-decision-trail";
import { relativeTime } from "~/lib/format";

/**
 * Decision Trail page.
 *
 * Displays MuninnDB decision engrams as a filterable, expandable list.
 * Follows the Session Explorer page pattern: PageContainer with actions
 * bar (last updated + refresh), loading skeletons, and ErrorBoundary.
 */
export default function DecisionsPage() {
  const { decisions, loading, lastUpdated, refresh, fetchDecisionDetail } =
    useDecisionTrail();

  const lastUpdatedText = lastUpdated
    ? `Last updated: ${relativeTime(lastUpdated)}`
    : null;

  return (
    <PageContainer
      title="Decisions"
      subtitle="Decision Trail"
      actions={
        <div className="flex items-center gap-3">
          {/* Last updated timestamp */}
          {lastUpdatedText && (
            <span className="font-mono text-xs text-muted-foreground/60">
              {lastUpdatedText}
            </span>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={refresh}
            disabled={loading}
          >
            <RefreshCw className={loading ? "animate-spin" : undefined} />
            {loading ? "Loading..." : "Refresh"}
          </Button>
        </div>
      }
    >
      {loading ? (
        <div className="space-y-6">
          <LoadingSkeleton variant="card" />
          <LoadingSkeleton variant="card" />
          <LoadingSkeleton variant="text" rows={6} />
        </div>
      ) : (
        <div className="space-y-6">
          <ErrorBoundary name="DecisionList">
            <DecisionList
              decisions={decisions}
              onFetchDetail={fetchDecisionDetail}
            />
          </ErrorBoundary>
        </div>
      )}
    </PageContainer>
  );
}
