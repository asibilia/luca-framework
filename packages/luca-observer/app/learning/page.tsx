"use client";

import { PageContainer } from "~/components/layout/page-container";
import { ErrorBoundary } from "~/components/shared/error-boundary";
import { LoadingSkeleton } from "~/components/shared/loading-skeleton";
import { LearningStats } from "~/components/learning/learning-stats";
import { LearningTimeline } from "~/components/learning/learning-timeline";
import { CategoryBreakdown } from "~/components/learning/category-breakdown";
import { RecentLearnings } from "~/components/learning/recent-learnings";
import { useLearningEvolution } from "~/hooks/use-learning-evolution";
import { relativeTime } from "~/lib/format";

/**
 * Learning Evolution page.
 *
 * Visualizes how knowledge accumulates over time in MuninnDB.
 * Shows summary statistics, a timeline bar chart, category breakdown,
 * and recent learnings list. Follows the Session Explorer page pattern:
 * PageContainer with actions bar (last updated + refresh), loading
 * skeletons, and ErrorBoundary wrappers.
 */
export default function LearningPage() {
  const {
    stats,
    timeline,
    categoryBreakdown,
    recentLearnings,
    loading,
    lastUpdated,
    refresh,
  } = useLearningEvolution();

  const lastUpdatedText = lastUpdated
    ? `Last updated: ${relativeTime(lastUpdated)}`
    : null;

  return (
    <PageContainer
      title="Learning"
      subtitle="Learning Evolution"
      actions={
        <div className="flex items-center gap-3">
          {lastUpdatedText && (
            <span className="font-mono text-xs text-muted-foreground/60">
              {lastUpdatedText}
            </span>
          )}

          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      }
    >
      {loading ? (
        <div className="space-y-6">
          <LoadingSkeleton variant="card" />
          <LoadingSkeleton variant="chart" />
          <LoadingSkeleton variant="text" rows={6} />
        </div>
      ) : (
        <div className="space-y-6">
          <ErrorBoundary name="LearningStats">
            <LearningStats stats={stats} />
          </ErrorBoundary>

          <ErrorBoundary name="LearningTimeline">
            <LearningTimeline timeline={timeline} />
          </ErrorBoundary>

          <ErrorBoundary name="CategoryBreakdown">
            <CategoryBreakdown breakdown={categoryBreakdown} />
          </ErrorBoundary>

          <ErrorBoundary name="RecentLearnings">
            <RecentLearnings engrams={recentLearnings} />
          </ErrorBoundary>
        </div>
      )}
    </PageContainer>
  );
}
