"use client";

import { PageContainer } from "~/components/layout/page-container";
import { ErrorBoundary } from "~/components/shared/error-boundary";
import { LoadingSkeleton } from "~/components/shared/loading-skeleton";
import { useKnowledgeGraph } from "~/hooks/use-knowledge-graph";
import { relativeTime } from "~/lib/format";

/**
 * Knowledge Graph Explorer page.
 *
 * Displays a force-directed graph visualization of MuninnDB entities
 * and their relationships. Supports cluster expand/collapse, node
 * selection, and time range filtering.
 *
 * Follows the Vault page pattern: PageContainer with actions bar
 * (last updated + refresh), loading skeletons, and ErrorBoundary.
 */
export default function KnowledgeGraphPage() {
  const {
    graphData,
    loading,
    error,
    lastUpdated,
    configured,
    totalNodes,
    totalLinks,
    refresh,
    resetView,
  } = useKnowledgeGraph();

  const lastUpdatedText = lastUpdated
    ? `Last updated: ${relativeTime(lastUpdated)}`
    : null;

  return (
    <PageContainer
      title="Knowledge Graph"
      subtitle="MuninnDB Entity Explorer"
      actions={
        <div className="flex items-center gap-3">
          {lastUpdatedText && (
            <span className="font-mono text-xs text-muted-foreground/60">
              {lastUpdatedText}
            </span>
          )}

          <button
            type="button"
            onClick={resetView}
            disabled={loading}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            Reset
          </button>

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
        </div>
      ) : !configured ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">
            MuninnDB is not configured. Start MuninnDB to see the knowledge
            graph.
          </p>
        </div>
      ) : error ? (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-8 text-center">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Stats bar */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>
              {totalNodes} entities, {totalLinks} relationships
            </span>
            <span>
              Showing {graphData.nodes.length} nodes, {graphData.links.length}{" "}
              links
            </span>
          </div>

          {/* Graph canvas placeholder -- visual component comes in Plan 2 */}
          <ErrorBoundary name="KnowledgeGraphCanvas">
            <div className="flex h-[600px] items-center justify-center rounded-lg border border-border bg-card">
              <p className="text-sm text-muted-foreground">
                Graph canvas will render here
              </p>
            </div>
          </ErrorBoundary>
        </div>
      )}
    </PageContainer>
  );
}
