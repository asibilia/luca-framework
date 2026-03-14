"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAtomValue } from "jotai";

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
} from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { EmptyState } from "~/components/shared/empty-state";

import { vaultAtom } from "~/stores/vault";

/** Entity cluster pair from the entity-clusters API. */
interface ClusterPair {
  entity_a: string;
  entity_b: string;
  count: number;
}

/**
 * Knowledge Graph Mini section for the memory page.
 *
 * Simplified entity relationship visualization using CSS only (no force
 * graph library). Shows top 15 entity cluster pairs as a sorted list
 * with co-occurrence counts and relative width bars.
 *
 * Fetches its own data from /api/muninn/entity-clusters.
 */
export function KnowledgeGraphMini() {
  const vault = useAtomValue(vaultAtom);
  const [clusters, setClusters] = useState<ClusterPair[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchingRef = useRef(false);

  const fetchClusters = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    try {
      const v = encodeURIComponent(vault);
      const res = await fetch(
        `/api/muninn/entity-clusters?vault=${v}&top_n=15&min_count=2`,
      );
      if (!res.ok) {
        setError(`Failed to fetch clusters (${res.status})`);
        return;
      }
      const data = (await res.json()) as {
        clusters?: ClusterPair[];
        count?: number;
      };
      setClusters(data.clusters ?? []);
      setError(null);
    } catch {
      setError("Failed to fetch entity clusters");
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [vault]);

  useEffect(() => {
    void fetchClusters();
  }, [fetchClusters]);

  if (loading) {
    return (
      <Card>
        <CardContent>
          <div className="flex flex-col gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-6 animate-pulse rounded bg-muted"
                style={{ width: `${85 - i * 10}%` }}
              />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || clusters.length === 0) {
    return (
      <EmptyState
        title="No Entity Co-occurrences"
        message="No entity cluster pairs found. Store more engrams with entity tags to see co-occurrences."
      />
    );
  }

  // Find max count for relative bar widths
  const maxCount = Math.max(...clusters.map((c) => c.count), 1);

  return (
    <Card role="region" aria-label="Entity co-occurrences">
      <CardHeader className="border-b">
        <CardTitle className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
          Entity Co-occurrences
        </CardTitle>
        <CardDescription className="font-mono text-xs">
          Top entity pairs by co-occurrence
        </CardDescription>
        <CardAction>
          <Badge variant="outline" className="font-mono text-xs">
            {clusters.length} pairs
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="pt-3">
        <div className="space-y-1.5">
          {clusters.map((cluster) => {
            const widthPercent = Math.round((cluster.count / maxCount) * 100);
            return (
              <div
                key={`${cluster.entity_a}-${cluster.entity_b}`}
                className="flex items-center gap-2"
              >
                {/* Entity pair labels */}
                <div className="flex min-w-0 flex-1 items-center gap-1 truncate">
                  <span className="truncate font-mono text-xs text-foreground">
                    {cluster.entity_a}
                  </span>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground/50">
                    &harr;
                  </span>
                  <span className="truncate font-mono text-xs text-foreground">
                    {cluster.entity_b}
                  </span>
                </div>

                {/* CSS bar */}
                <div className="relative h-1 w-20 shrink-0 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${widthPercent}%`,
                      backgroundColor: "var(--color-info)",
                    }}
                  />
                </div>

                {/* Count badge */}
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  {cluster.count}
                </span>
              </div>
            );
          })}
        </div>

        {/* Link to full graph */}
        <div className="mt-3 text-right">
          <a
            href="/knowledge-graph"
            className="font-mono text-xs text-primary underline-offset-2 hover:underline"
          >
            View full graph &rarr;
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
