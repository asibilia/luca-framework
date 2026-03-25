"use client";

import { ErrorBoundary } from "~/components/shared/error-boundary";
import { LoadingSkeleton } from "~/components/shared/loading-skeleton";
import { LearningStats } from "~/components/learning/learning-stats";
import { LearningTimeline } from "~/components/learning/learning-timeline";
import { CategoryBreakdown } from "~/components/learning/category-breakdown";
import { RecentLearnings } from "~/components/learning/recent-learnings";
import { useLearningEvolution } from "~/hooks/use-learning-evolution";

/**
 * Learning tab for the Memory page.
 *
 * Renders pattern/decision/pitfall tracking (absorbed from the standalone
 * learning page). Mounts useLearningEvolution internally so learning data
 * is only fetched when this tab is active.
 *
 * @returns The learning tab content with stats, timeline, breakdown, and recent items
 */
export function LearningTab({ onRefreshRef }: LearningTabProps) {
  const {
    stats,
    timeline,
    categoryBreakdown,
    recentLearnings,
    loading,
    refresh,
  } = useLearningEvolution();

  // Expose refresh to parent via mutable ref
  if (onRefreshRef) {
    onRefreshRef.current = refresh;
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <LoadingSkeleton variant="card" />
        <LoadingSkeleton variant="chart" />
        <LoadingSkeleton variant="text" rows={6} />
      </div>
    );
  }

  return (
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
  );
}

/** Props for the LearningTab component. */
export interface LearningTabProps {
  /** Mutable ref to expose the tab's refresh function to the parent. */
  onRefreshRef?: React.MutableRefObject<(() => void) | null>;
}
