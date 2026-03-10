"use client";

import { RefreshCw } from "lucide-react";

import { PageContainer } from "~/components/layout/page-container";
import { ErrorBoundary } from "~/components/shared/error-boundary";
import { LoadingSkeleton } from "~/components/shared/loading-skeleton";
import { Button } from "~/components/ui/button";
import { BrainPanel } from "~/components/memory/brain-panel";
import { MemoryEntries } from "~/components/memory/memory-entries";
import { WorkingSections } from "~/components/memory/working-sections";
import { ContextUsageBar } from "~/components/memory/context-usage-bar";
import { useMemory } from "~/hooks/use-memory";
import { relativeTime } from "~/lib/format";

/**
 * MuninnDB Memory Dashboard page.
 *
 * Single-column stacked layout: Stats bar -> Brain panel -> Engrams panel -> Session panel.
 * Uses the useMemory hook for structured MuninnDB data with manual refresh and
 * "Last updated" timestamp. Gracefully degrades when MuninnDB is unavailable.
 */
export default function MemoryPage() {
  const {
    brain,
    engrams,
    session,
    stats,
    loading,
    configured,
    lastUpdated,
    refresh,
  } = useMemory();

  const lastUpdatedText = lastUpdated
    ? `Last updated: ${relativeTime(lastUpdated)}`
    : null;

  return (
    <PageContainer
      title="Memory"
      subtitle="MuninnDB Memory Dashboard"
      actions={
        <div className="flex items-center gap-3">
          {/* Connection status */}
          <div className="flex items-center gap-1.5">
            <div
              className="h-2 w-2 rounded-full"
              style={{
                backgroundColor: configured
                  ? "var(--color-success)"
                  : "var(--color-muted-foreground)",
              }}
            />
            <span className="font-mono text-xs text-muted-foreground">
              {configured ? "Connected" : "Disconnected"}
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
          <LoadingSkeleton variant="text" rows={6} />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Stats bar at top */}
          <ErrorBoundary name="ContextUsageBar">
            <ContextUsageBar stats={stats} />
          </ErrorBoundary>

          {/* Brain panel */}
          <ErrorBoundary name="BrainPanel">
            <BrainPanel items={brain} />
          </ErrorBoundary>

          {/* Engrams panel */}
          <ErrorBoundary name="MemoryEntries">
            <MemoryEntries engrams={engrams} />
          </ErrorBoundary>

          {/* Session panel */}
          <ErrorBoundary name="WorkingSections">
            <WorkingSections entries={session} />
          </ErrorBoundary>
        </div>
      )}
    </PageContainer>
  );
}
