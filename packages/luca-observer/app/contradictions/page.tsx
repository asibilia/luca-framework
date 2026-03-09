"use client";

import { PageContainer } from "~/components/layout/page-container";
import { ErrorBoundary } from "~/components/shared/error-boundary";
import { LoadingSkeleton } from "~/components/shared/loading-skeleton";
import { EmptyState } from "~/components/shared/empty-state";
import { ContradictionList } from "~/components/contradictions/contradiction-list";
import { useContradictions } from "~/hooks/use-contradictions";
import { relativeTime } from "~/lib/format";

/**
 * Contradictions page.
 *
 * Displays MuninnDB contradiction pairs as side-by-side cards with
 * forget actions and cross-view navigation to the Memory page.
 * Follows the Decisions page pattern: PageContainer with actions bar
 * (last updated + refresh), loading skeletons, and ErrorBoundary.
 */
export default function ContradictionsPage() {
  const {
    contradictions,
    loading,
    error,
    configured,
    lastUpdated,
    refresh,
    forgetEngram,
  } = useContradictions();

  const lastUpdatedText = lastUpdated
    ? `Last updated: ${relativeTime(lastUpdated)}`
    : null;

  return (
    <PageContainer
      title="Contradictions"
      subtitle="Knowledge Conflicts"
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
          <LoadingSkeleton variant="card" />
          <LoadingSkeleton variant="card" />
        </div>
      ) : !configured ? (
        <EmptyState message="MuninnDB not configured. Connect MuninnDB to detect contradictions." />
      ) : error ? (
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="font-mono text-sm text-destructive">{error}</p>
        </div>
      ) : (
        <ErrorBoundary name="ContradictionList">
          <ContradictionList
            contradictions={contradictions}
            onForget={forgetEngram}
          />
        </ErrorBoundary>
      )}
    </PageContainer>
  );
}
