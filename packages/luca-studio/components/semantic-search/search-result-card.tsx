"use client";

import { useCallback, useState } from "react";

import { Card, CardContent } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";

import type { SemanticSearchResult } from "~/hooks/use-semantic-search";
import { ScoreBreakdown } from "~/components/semantic-search/score-breakdown";

// -- Types -------------------------------------------------------------------

export interface SearchResultCardProps {
  result: SemanticSearchResult;
  onExplain: (engramId: string) => void;
  explainLoading: boolean;
}

// -- Component ---------------------------------------------------------------

/**
 * Individual search result card with inline explain breakdown.
 *
 * Displays concept, content preview, relevance score bar, memory type badge,
 * tags, and action links (Explain, Traverse, View). The Explain button
 * toggles an inline ScoreBreakdown section.
 */
export function SearchResultCard({
  result,
  onExplain,
  explainLoading,
}: SearchResultCardProps) {
  const [expanded, setExpanded] = useState(false);

  const handleExplainClick = useCallback(() => {
    if (expanded) {
      // Collapse -- no re-fetch needed since explain data is cached
      setExpanded(false);
      return;
    }

    // Expand: fetch explain if not already populated
    if (!result.explain) {
      onExplain(result.id);
    }
    setExpanded(true);
  }, [expanded, result.explain, result.id, onExplain]);

  // Score bar width (clamped to 0-100%)
  const scorePercent = Math.min(Math.max(result.score * 100, 1), 100);

  return (
    <Card>
      <CardContent className="space-y-2">
        {/* Header: concept + memory type badge */}
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">
            {result.concept}
          </h3>
          {result.memory_type && (
            <Badge variant="secondary" className="font-mono text-xs">
              {result.memory_type}
            </Badge>
          )}
        </div>

        {/* Content preview (truncated to 3 lines) */}
        <p className="line-clamp-3 font-mono text-xs text-muted-foreground leading-relaxed">
          {result.content}
        </p>

        {/* Relevance score bar */}
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full bg-muted">
            <div
              className="h-1.5 rounded-full bg-primary transition-all"
              style={{ width: `${scorePercent}%` }}
            />
          </div>
          <span className="font-mono text-xs text-foreground">
            {result.score.toFixed(2)}
          </span>
        </div>

        {/* Tags */}
        {result.tags && result.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {result.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Action links row */}
        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={handleExplainClick}
            disabled={explainLoading && !result.explain}
            className="font-mono text-xs text-primary hover:underline disabled:opacity-50"
          >
            {explainLoading && !result.explain ? "Loading..." : "Explain"}
          </button>

          <a
            href={`/knowledge-graph?entity=${encodeURIComponent(result.concept)}`}
            className="font-mono text-xs text-primary hover:underline"
          >
            Traverse
          </a>

          <a
            href={`/memory?entity=${encodeURIComponent(result.concept)}`}
            className="font-mono text-xs text-primary hover:underline"
          >
            View
          </a>
        </div>

        {/* Inline explain breakdown */}
        {expanded && result.explain && (
          <ScoreBreakdown explain={result.explain} />
        )}
      </CardContent>
    </Card>
  );
}
