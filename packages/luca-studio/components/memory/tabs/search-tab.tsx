"use client";

import { useCallback, useState } from "react";

import type { MutableRefObject } from "react";

import { ErrorBoundary } from "~/components/shared/error-boundary";
import { EmptyState } from "~/components/shared/empty-state";
import { LoadingSkeleton } from "~/components/shared/loading-skeleton";
import { SearchBar } from "~/components/semantic-search/search-bar";
import { SearchResults } from "~/components/semantic-search/search-results";
import { useSemanticSearch } from "~/hooks/use-semantic-search";

import type { SearchOptions } from "~/hooks/use-semantic-search";

/**
 * Search tab for the Memory page.
 *
 * Renders the Semantic Search interface (absorbed from the standalone
 * semantic-search page). Mounts useSemanticSearch internally so search
 * data is only fetched when this tab is active.
 *
 * @returns The search tab content with search bar and results
 */
export function SearchTab({ onRefreshRef }: SearchTabProps) {
  const {
    results,
    loading,
    error,
    configured,
    lastQuery,
    totalFound,
    search,
    explainResult,
    refresh,
  } = useSemanticSearch();

  const [explainLoadingId, setExplainLoadingId] = useState<string | null>(null);

  // Expose refresh to parent via mutable ref
  if (onRefreshRef) {
    onRefreshRef.current = refresh;
  }

  const handleSearch = useCallback(
    (query: string, options: SearchOptions) => {
      search(query, options);
    },
    [search],
  );

  const handleExplain = useCallback(
    async (engramId: string) => {
      setExplainLoadingId(engramId);
      await explainResult(engramId);
      setExplainLoadingId(null);
    },
    [explainResult],
  );

  return (
    <div className="space-y-6">
      {/* Search bar is always visible */}
      <SearchBar onSearch={handleSearch} loading={loading} />

      {/* Content area: loading / not configured / error / empty / results */}
      {loading ? (
        <div className="space-y-3">
          <LoadingSkeleton variant="card" />
          <LoadingSkeleton variant="card" />
          <LoadingSkeleton variant="card" />
        </div>
      ) : !configured ? (
        <EmptyState
          title="Not Configured"
          message="MuninnDB not configured. Set up MuninnDB to use semantic search."
        />
      ) : error ? (
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="font-mono text-sm text-destructive">{error}</p>
        </div>
      ) : lastQuery === null ? (
        <EmptyState message="Enter a search query to explore your knowledge base." />
      ) : (
        <ErrorBoundary name="SearchResults">
          <SearchResults
            results={results}
            totalFound={totalFound}
            onExplain={handleExplain}
            explainLoadingId={explainLoadingId}
          />
        </ErrorBoundary>
      )}
    </div>
  );
}

/** Props for the SearchTab component. */
export interface SearchTabProps {
  /** Mutable ref to expose the tab's refresh function to the parent. */
  onRefreshRef?: MutableRefObject<(() => void) | null>;
}
