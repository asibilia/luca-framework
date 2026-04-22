import { SearchResultCard } from '~/components/semantic-search/search-result-card'
import { EmptyState } from '~/components/shared/empty-state'
import type { SemanticSearchResult } from '~/hooks/use-semantic-search'

// -- Types -------------------------------------------------------------------

export interface SearchResultsProps {
    results: SemanticSearchResult[]
    totalFound: number
    onExplain: (engramId: string) => void
    explainLoadingId: string | null
}

// -- Component ---------------------------------------------------------------

/**
 * Container component that renders a vertical list of SearchResultCards.
 *
 * Shows a result count summary at the top and an EmptyState when the search
 * returned no matches.
 */
export function SearchResults({
    results,
    totalFound,
    onExplain,
    explainLoadingId,
}: SearchResultsProps) {
    if (results.length === 0) {
        return (
            <EmptyState message="No results found. Try different search terms or adjust advanced options." />
        )
    }

    return (
        <div className="space-y-3">
            {/* Summary line */}
            <p className="font-mono text-sm text-muted-foreground">
                {totalFound} {totalFound === 1 ? 'result' : 'results'} found
            </p>

            {/* Result cards */}
            {results.map((result) => (
                <SearchResultCard
                    key={result.id}
                    result={result}
                    onExplain={onExplain}
                    explainLoading={explainLoadingId === result.id}
                />
            ))}
        </div>
    )
}
