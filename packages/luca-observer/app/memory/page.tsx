"use client";

import { RefreshCw } from "lucide-react";

import { PageContainer } from "~/components/layout/page-container";
import { ErrorBoundary } from "~/components/shared/error-boundary";
import { LoadingSkeleton } from "~/components/shared/loading-skeleton";
import { Button } from "~/components/ui/button";
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
import { relativeTime } from "~/lib/format";

/**
 * MuninnDB Memory Observability page.
 *
 * Six-section dashboard covering session status, memory health,
 * recall effectiveness, memory timeline, brain tree drill-down,
 * and knowledge graph mini. Uses a 2-column grid for the middle
 * sections and full-width for hero, timeline, brain, and graph.
 *
 * All four hooks are wired at the page level and data is passed
 * down to section components. Each section is independently
 * error-bounded for fault isolation.
 */
export default function MemoryPage() {
  const memory = useMemory();
  const health = useMemoryHealth();
  const observations = useObservations();
  const checkpoint = useCheckpoint();
  const entityClusters = useEntityClusters();

  // Aggregate loading state: show skeleton if ALL hooks are loading
  const allLoading =
    memory.loading &&
    health.loading &&
    observations.loading &&
    checkpoint.loading;

  // Aggregate refresh: trigger all hooks
  const refreshAll = () => {
    memory.refresh();
    health.refresh();
    observations.refresh();
    checkpoint.refresh();
  };

  // Use the most recent lastUpdated across all hooks
  const lastUpdated =
    [
      memory.lastUpdated,
      health.lastUpdated,
      observations.lastUpdated,
      checkpoint.lastUpdated,
    ]
      .filter((d): d is Date => d !== null)
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

  const lastUpdatedText = lastUpdated
    ? `Last updated: ${relativeTime(lastUpdated)}`
    : null;

  const isLoading =
    memory.loading ||
    health.loading ||
    observations.loading ||
    checkpoint.loading;

  return (
    <PageContainer
      title="Memory"
      subtitle="MuninnDB Memory Observability"
      actions={
        <div className="flex items-center gap-3">
          {/* Connection status */}
          <div className="flex items-center gap-1.5">
            <div
              className="h-2 w-2 rounded-full"
              style={{
                backgroundColor: health.configured
                  ? "var(--color-success)"
                  : "var(--color-muted-foreground)",
              }}
            />
            <span className="font-mono text-xs text-muted-foreground">
              {health.configured ? "Connected" : "Disconnected"}
            </span>
          </div>

          {/* Last updated timestamp */}
          {lastUpdatedText && (
            <span className="font-mono text-xs text-muted-foreground/60">
              {lastUpdatedText}
            </span>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={refreshAll}
            disabled={isLoading}
          >
            <RefreshCw className={isLoading ? "animate-spin" : undefined} />
            {isLoading ? "Loading..." : "Refresh"}
          </Button>
        </div>
      }
    >
      {allLoading ? (
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
      ) : (
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
              <MemoryTimeline
                observations={observations}
                checkpoint={checkpoint}
              />
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
      )}
    </PageContainer>
  );
}
