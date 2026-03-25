"use client";

import { RefreshCw } from "lucide-react";

import { PageContainer } from "~/components/layout/page-container";
import { ErrorBoundary } from "~/components/shared/error-boundary";
import { LoadingSkeleton } from "~/components/shared/loading-skeleton";
import { Button } from "~/components/ui/button";
import { Separator } from "~/components/ui/separator";
import {
  DashboardStatCards,
  DashboardCategoryCards,
} from "~/components/dashboard/stat-cards";
import { RecentEngrams } from "~/components/dashboard/recent-engrams";
import { TodoTracker } from "~/components/dashboard/todo-tracker";
import { QuickLinks } from "~/components/dashboard/quick-links";
import { ConnectionStatus } from "~/components/dashboard/connection-status";
import { useDashboard } from "~/hooks/use-dashboard";
import { relativeTime } from "~/lib/format";

/**
 * Dashboard overview page.
 *
 * Aggregates data from MuninnDB, todos, and knowledge graph into
 * a single overview with stat cards, recent memories, backlog,
 * and quick navigation links.
 */
export default function DashboardPage() {
  const { stats, recentEngrams, configured, loading, lastUpdated, refresh } =
    useDashboard();

  const lastUpdatedText = lastUpdated
    ? `Updated ${relativeTime(lastUpdated)}`
    : null;

  return (
    <PageContainer
      title="Dashboard"
      subtitle="Luca workflow observability"
      actions={
        <div className="flex items-center gap-3">
          <ConnectionStatus configured={configured} />
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
          <LoadingSkeleton variant="text" rows={4} />
          <LoadingSkeleton variant="card" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Overview stat cards */}
          <ErrorBoundary name="DashboardStatCards">
            <DashboardStatCards stats={stats} />
          </ErrorBoundary>

          {/* Learning categories */}
          <ErrorBoundary name="DashboardCategoryCards">
            <DashboardCategoryCards stats={stats} />
          </ErrorBoundary>

          <Separator />

          {/* Two-column layout: Recent memories + Backlog */}
          <div className="grid gap-6 lg:grid-cols-2">
            <ErrorBoundary name="RecentEngrams">
              <RecentEngrams engrams={recentEngrams} />
            </ErrorBoundary>
            <ErrorBoundary name="TodoTracker">
              <TodoTracker />
            </ErrorBoundary>
          </div>

          <Separator />

          {/* Quick navigation links */}
          <div>
            <h2 className="mb-3 font-mono text-sm font-medium text-muted-foreground">
              Quick Navigation
            </h2>
            <ErrorBoundary name="QuickLinks">
              <QuickLinks />
            </ErrorBoundary>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
