"use client";

import { RefreshCw } from "lucide-react";

import { PageContainer } from "~/components/layout/page-container";
import { Button } from "~/components/ui/button";
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
