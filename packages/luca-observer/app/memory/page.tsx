"use client";

import { PageContainer } from "~/components/layout/page-container";
import { ErrorBoundary } from "~/components/shared/error-boundary";
import { LoadingSkeleton } from "~/components/shared/loading-skeleton";
import { BrainPanel } from "~/components/memory/brain-panel";
import { MemoryEntries } from "~/components/memory/memory-entries";
import { WorkingSections } from "~/components/memory/working-sections";
import { ContextUsageBar } from "~/components/memory/context-usage-bar";
import { useMemory } from "~/hooks/use-memory";

/**
 * Format a relative "time ago" string from a Date.
 */
function timeAgo(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return "just now";

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

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
    ? `Last updated: ${timeAgo(lastUpdated)}`
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

          {/* Refresh button */}
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
