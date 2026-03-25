"use client";

import { useCallback } from "react";

import { ErrorBoundary } from "~/components/shared/error-boundary";
import { LoadingSkeleton } from "~/components/shared/loading-skeleton";
import { SessionStatusHero } from "~/components/memory/session-status-hero";
import { HealthDashboard } from "~/components/memory/health-dashboard";
import { RecallEffectiveness } from "~/components/memory/recall-effectiveness";
import { MemoryTimeline } from "~/components/memory/memory-timeline";
import { EnhancedBrainTree } from "~/components/memory/enhanced-brain-tree";
import { KnowledgeGraphMini } from "~/components/memory/knowledge-graph-mini";
import { useMemory } from "~/hooks/use-memory";
import { useMemoryHealth } from "~/hooks/use-memory-health";
import { useObservations } from "~/hooks/use-observations";
import { useCheckpoint } from "~/hooks/use-checkpoint";
import { useEntityClusters } from "~/hooks/use-entity-clusters";

/**
 * Browse tab for the Memory page.
 *
 * Composes the original six-section dashboard: SessionStatusHero,
 * HealthDashboard, RecallEffectiveness, MemoryTimeline, EnhancedBrainTree,
 * and KnowledgeGraphMini. Mounts all four primary hooks plus entity clusters
 * internally so unmounted tabs do not fetch data.
 *
 * @returns The browse tab content with loading/error states
 */
export function BrowseTab({ onRefreshRef }: BrowseTabProps) {
  const memory = useMemory();
  const health = useMemoryHealth();
  const observations = useObservations();
  const checkpoint = useCheckpoint();
  const entityClusters = useEntityClusters();

  const allLoading =
    memory.loading &&
    health.loading &&
    observations.loading &&
    checkpoint.loading;

  const refreshAll = useCallback(() => {
    memory.refresh();
    health.refresh();
    observations.refresh();
    checkpoint.refresh();
  }, [memory, health, observations, checkpoint]);

  // Expose refresh to parent via mutable ref
  if (onRefreshRef) {
    onRefreshRef.current = refreshAll;
  }

  if (allLoading) {
    return (
      <div className="space-y-6">
        <LoadingSkeleton variant="card" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <LoadingSkeleton variant="card" />
          <LoadingSkeleton variant="card" />
        </div>
        <LoadingSkeleton variant="text" rows={6} />
        <LoadingSkeleton variant="text" rows={6} />
        <LoadingSkeleton variant="text" rows={4} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. Session Status Hero (full width) */}
      <ErrorBoundary name="SessionStatusHero">
        {checkpoint.loading ? (
          <LoadingSkeleton variant="card" />
        ) : (
          <SessionStatusHero data={checkpoint} />
        )}
      </ErrorBoundary>

      {/* 2-3. Health Dashboard + Recall Effectiveness (2-column grid) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ErrorBoundary name="HealthDashboard">
          {health.loading ? (
            <LoadingSkeleton variant="card" />
          ) : (
            <HealthDashboard data={health} />
          )}
        </ErrorBoundary>

        <ErrorBoundary name="RecallEffectiveness">
          {observations.loading ? (
            <LoadingSkeleton variant="card" />
          ) : (
            <RecallEffectiveness data={observations} />
          )}
        </ErrorBoundary>
      </div>

      {/* 4. Memory Timeline (full width) */}
      <ErrorBoundary name="MemoryTimeline">
        {observations.loading || checkpoint.loading ? (
          <LoadingSkeleton variant="text" rows={6} />
        ) : (
          <MemoryTimeline observations={observations} checkpoint={checkpoint} />
        )}
      </ErrorBoundary>

      {/* 5. Enhanced Brain Tree (full width) */}
      <ErrorBoundary name="EnhancedBrainTree">
        {memory.loading ? (
          <LoadingSkeleton variant="text" rows={6} />
        ) : (
          <EnhancedBrainTree items={memory.brain} />
        )}
      </ErrorBoundary>

      {/* 6. Knowledge Graph Mini (full width) */}
      <ErrorBoundary name="KnowledgeGraphMini">
        <KnowledgeGraphMini
          clusters={entityClusters.clusters}
          loading={entityClusters.loading}
          error={entityClusters.error}
        />
      </ErrorBoundary>
    </div>
  );
}

/** Props for the BrowseTab component. */
export interface BrowseTabProps {
  /** Mutable ref to expose the tab's refresh function to the parent. */
  onRefreshRef?: React.MutableRefObject<(() => void) | null>;
}
