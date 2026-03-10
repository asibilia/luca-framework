"use client";

import { useCallback, useState } from "react";

import { PageContainer } from "~/components/layout/page-container";
import { ErrorBoundary } from "~/components/shared/error-boundary";
import { LoadingSkeleton } from "~/components/shared/loading-skeleton";
import { EmptyState } from "~/components/shared/empty-state";
import { SearchBar } from "~/components/semantic-search/search-bar";
import { SearchResults } from "~/components/semantic-search/search-results";
import { useSemanticSearch } from "~/hooks/use-semantic-search";
import { relativeTime } from "~/lib/format";

import type { SearchOptions } from "~/hooks/use-semantic-search";

/**
 * Semantic Search page.
 *
 * Provides on-demand MuninnDB knowledge search with progressive disclosure
 * of advanced options (mode, profile, threshold). Results display inline
 * explain breakdowns and cross-view navigation links.
 *
 * Follows the Decisions/Vault page pattern: PageContainer with actions bar
 * (last updated + refresh), loading skeletons, and ErrorBoundary.
 */
export default function SemanticSearchPage() {
  const {
    results,
    loading,
    error,
    configured,
    lastQuery,
    lastUpdated,
    totalFound,
    search,
    explainResult,
    refresh,
  } = useSemanticSearch();

  const [explainLoadingId, setExplainLoadingId] = useState<string | null>(null);

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

  const lastUpdatedText = lastUpdated
    ? `Last updated: ${relativeTime(lastUpdated)}`
    : null;

  return (
    <PageContainer
      title="Semantic Search"
      subtitle="MuninnDB Knowledge Search"
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
            disabled={loading || !lastQuery}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      }
    >
      {/* Search bar is always visible */}
      <div className="mb-6">
        <SearchBar onSearch={handleSearch} loading={loading} />
      </div>

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
    </PageContainer>
  );
}
