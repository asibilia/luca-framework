"use client";

import { useState } from "react";
import { useParams } from "next/navigation";

import { PageContainer } from "~/components/layout/page-container";
import { ErrorBoundary } from "~/components/shared/error-boundary";
import { LoadingSkeleton } from "~/components/shared/loading-skeleton";
import { EmptyState } from "~/components/shared/empty-state";
import { EntityHeader } from "~/components/entities/entity-header";
import { EntityTabBar, type TabId } from "~/components/entities/entity-tab-bar";
import { EntityTimeline } from "~/components/entities/entity-timeline";
import { EntityRelationships } from "~/components/entities/entity-relationships";
import { EntityEngrams } from "~/components/entities/entity-engrams";
import { EntityCoOccurrences } from "~/components/entities/entity-co-occurrences";
import { useEntityDeepDive } from "~/hooks/use-entity-deep-dive";
import { relativeTime } from "~/lib/format";

/**
 * Entity Deep Dive page.
 *
 * Dynamic route `/entities/[name]` that displays the full deep-dive view
 * for a single MuninnDB entity: header, tab bar, and tab content panels
 * (timeline, relationships, engrams, co-occurrences).
 *
 * Follows the Decisions page pattern: PageContainer with actions bar
 * (last updated + refresh), loading skeletons, and ErrorBoundary.
 */
export default function EntityDeepDivePage() {
  const params = useParams<{ name: string }>();
  const entityName = decodeURIComponent(params.name ?? "");

  const {
    entity,
    timeline,
    coOccurrences,
    loading,
    error,
    refresh,
    lastUpdated,
  } = useEntityDeepDive(entityName);

  const [activeTab, setActiveTab] = useState<TabId>("timeline");

  const lastUpdatedText = lastUpdated
    ? `Last updated: ${relativeTime(lastUpdated)}`
    : null;

  return (
    <PageContainer
      title="Entity"
      subtitle={entityName}
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
          <LoadingSkeleton variant="text" rows={6} />
        </div>
      ) : error ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <p className="font-mono text-sm text-destructive">{error}</p>
        </div>
      ) : !entity ? (
        <EmptyState
          title="Entity not found"
          message={`No entity data found for "${entityName}".`}
        />
      ) : (
        <div className="space-y-4">
          <ErrorBoundary name="EntityHeader">
            <EntityHeader entity={entity} />
          </ErrorBoundary>

          <EntityTabBar activeTab={activeTab} onTabChange={setActiveTab} />

          <ErrorBoundary name="EntityTabContent">
            {activeTab === "timeline" && <EntityTimeline timeline={timeline} />}
            {activeTab === "relationships" && (
              <EntityRelationships
                relationships={entity.relationships}
                entityName={entityName}
              />
            )}
            {activeTab === "engrams" && (
              <EntityEngrams engrams={entity.engrams} />
            )}
            {activeTab === "co-occurrences" && (
              <EntityCoOccurrences coOccurrences={coOccurrences} />
            )}
          </ErrorBoundary>
        </div>
      )}
    </PageContainer>
  );
}
