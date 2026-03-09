"use client";

import { PageContainer } from "~/components/layout/page-container";
import { ErrorBoundary } from "~/components/shared/error-boundary";
import { LoadingSkeleton } from "~/components/shared/loading-skeleton";
import { SessionList } from "~/components/sessions/session-list";
import { useSessionExplorer } from "~/hooks/use-session-explorer";
import { relativeTime } from "~/lib/format";

/**
 * Session Explorer page.
 *
 * Displays past workflow sessions fetched from MuninnDB as a filterable,
 * expandable list. Follows the Memory page pattern: PageContainer with
 * actions bar (last updated + refresh), loading skeletons, and ErrorBoundary.
 */
export default function SessionsPage() {
  const { sessions, loading, lastUpdated, refresh, fetchSessionDetail } =
    useSessionExplorer();

  const lastUpdatedText = lastUpdated
    ? `Last updated: ${relativeTime(lastUpdated)}`
    : null;

  return (
    <PageContainer
      title="Sessions"
      subtitle="Session Explorer"
      actions={
        <div className="flex items-center gap-3">
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
        </div>
      ) : (
        <div className="space-y-6">
          <ErrorBoundary name="SessionList">
            <SessionList
              sessions={sessions}
              onFetchDetail={fetchSessionDetail}
            />
          </ErrorBoundary>
        </div>
      )}
    </PageContainer>
  );
}
