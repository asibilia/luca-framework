"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { PageContainer } from "~/components/layout/page-container";
import { EmptyState } from "~/components/shared/empty-state";
import { LoadingSkeleton } from "~/components/shared/loading-skeleton";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { useEntities } from "~/hooks/use-entities";
import { relativeTime } from "~/lib/format";
import { TYPE_COLORS } from "~/lib/graph-types";

import type { EntitySummary } from "~/hooks/use-entities";
import type { EntityType } from "~/lib/graph-types";

/**
 * Entities index page.
 *
 * Lists all MuninnDB entities in a searchable card grid. Each card shows
 * the entity name, type badge, engram count, and relationship count,
 * and links to the entity deep-dive page at `/entities/[name]`.
 *
 * Follows the Vault/Learning page pattern: PageContainer with actions bar
 * (last updated + refresh), loading skeletons, and search/filter input.
 */
export default function EntitiesPage() {
  const {
    entities,
    totalCount,
    loading,
    error,
    lastUpdated,
    configured,
    refresh,
  } = useEntities();

  const [searchQuery, setSearchQuery] = useState("");

  // Filter entities by search query (name or type label)
  const filteredEntities = useMemo(() => {
    if (!searchQuery.trim()) return entities;

    const query = searchQuery.toLowerCase().trim();
    return entities.filter(
      (entity) =>
        entity.name.toLowerCase().includes(query) ||
        entity.typeLabel.toLowerCase().includes(query) ||
        entity.type.toLowerCase().includes(query),
    );
  }, [entities, searchQuery]);

  const lastUpdatedText = lastUpdated
    ? `Last updated: ${relativeTime(lastUpdated)}`
    : null;

  return (
    <PageContainer
      title="Entities"
      subtitle="Entity Browser"
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
          <LoadingSkeleton variant="text" rows={4} />
        </div>
      ) : error ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <p className="font-mono text-sm text-destructive">{error}</p>
        </div>
      ) : !configured ? (
        <EmptyState
          title="Not Configured"
          message="MuninnDB is not configured. Connect MuninnDB to browse entities."
        />
      ) : totalCount === 0 ? (
        <EmptyState
          title="No Entities"
          message="No entities found in MuninnDB. Entities are created as knowledge is stored."
        />
      ) : (
        <div className="space-y-4">
          {/* Search input and count */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Input
                type="text"
                placeholder="Search entities..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="font-mono text-sm"
              />
            </div>
            <span className="font-mono text-xs text-muted-foreground">
              {filteredEntities.length === totalCount
                ? `${totalCount} entities`
                : `${filteredEntities.length} of ${totalCount} entities`}
            </span>
          </div>

          {/* Entity cards grid */}
          {filteredEntities.length === 0 ? (
            <EmptyState message={`No entities matching "${searchQuery}".`} />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredEntities.map((entity) => (
                <EntityCard key={entity.name} entity={entity} />
              ))}
            </div>
          )}
        </div>
      )}
    </PageContainer>
  );
}

// -- Entity Card Component ---------------------------------------------------

/**
 * A single entity card in the entity list grid.
 *
 * Shows entity name, type badge (color-coded), engram count,
 * relationship count, and last seen timestamp. Links to the
 * entity deep-dive page.
 */
function EntityCard({ entity }: { entity: EntitySummary }) {
  const typeColor = TYPE_COLORS[entity.type as EntityType] ?? TYPE_COLORS.other;
  const lastSeenText = entity.lastSeen ? relativeTime(entity.lastSeen) : null;

  return (
    <Link
      href={`/entities/${encodeURIComponent(entity.name)}`}
      className="group block"
    >
      <Card
        size="sm"
        className="transition-colors hover:ring-foreground/20 group-hover:bg-muted/30"
      >
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="font-mono text-sm leading-snug break-all">
              {entity.name}
            </CardTitle>
            <Badge
              variant="outline"
              className="shrink-0 font-mono text-[10px]"
              style={{
                borderColor: typeColor,
                color: typeColor,
              }}
            >
              {entity.typeLabel}
            </Badge>
          </div>
        </CardHeader>

        <CardContent>
          <div className="flex items-center gap-4 font-mono text-xs text-muted-foreground">
            <span>
              <span className="text-foreground">{entity.engramCount}</span>{" "}
              {entity.engramCount === 1 ? "engram" : "engrams"}
            </span>
            <span>
              <span className="text-foreground">
                {entity.relationshipCount}
              </span>{" "}
              {entity.relationshipCount === 1 ? "link" : "links"}
            </span>
            {lastSeenText && (
              <span className="ml-auto text-muted-foreground/60">
                {lastSeenText}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
