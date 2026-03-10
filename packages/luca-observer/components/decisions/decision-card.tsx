"use client";

import { useState } from "react";

import { ChevronDown, ChevronRight } from "lucide-react";

import { relativeTime } from "~/lib/format";

import type { DecisionInfo } from "~/hooks/use-decision-trail";
import type { MuninnEntityEngram } from "~/lib/muninn-types";

/**
 * Collapsible card displaying a single MuninnDB decision engram.
 *
 * Collapsed view shows: decision name, confidence badge, tags,
 * and relative timestamp. Expanding fetches and displays full
 * decision content and related engrams.
 *
 * Follows the SessionCard collapsible pattern: ChevronDown/ChevronRight,
 * aria-expanded, card styling with border-border.
 *
 * @param decision - Parsed decision metadata
 * @param onFetchDetail - Callback to fetch detail engrams for expansion
 */
export function DecisionCard({
  decision,
  onFetchDetail,
}: {
  decision: DecisionInfo;
  onFetchDetail: (concept: string) => Promise<MuninnEntityEngram[]>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [details, setDetails] = useState<MuninnEntityEngram[] | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const timestamp = relativeTime(decision.created_at);

  async function handleToggle() {
    if (!expanded && details === null) {
      setDetailLoading(true);
      try {
        const result = await onFetchDetail(decision.concept);
        setDetails(result);
      } catch {
        setDetails([]);
      } finally {
        setDetailLoading(false);
      }
    }
    setExpanded(!expanded);
  }

  return (
    <div className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-muted/30 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
          )}

          {/* Decision name */}
          <span className="font-mono text-xs font-semibold text-foreground">
            {decision.decision_id}
          </span>

          {/* Confidence badge */}
          <span
            className="rounded-full px-2 py-0.5 font-mono text-xs font-medium"
            style={{
              color: "var(--color-info)",
              backgroundColor:
                "color-mix(in oklab, var(--color-info) 15%, transparent)",
            }}
          >
            {decision.confidence.toFixed(2)}
          </span>

          {/* Tags */}
          {decision.tags.length > 0 &&
            decision.tags.map((tag) => (
              <span
                key={tag}
                className="rounded px-1.5 py-0.5 font-mono text-xs text-muted-foreground"
                style={{
                  backgroundColor:
                    "color-mix(in oklab, var(--color-muted-foreground) 10%, transparent)",
                }}
              >
                {tag}
              </span>
            ))}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/* Relative timestamp */}
          {timestamp && (
            <span className="font-mono text-xs text-muted-foreground/60">
              {timestamp}
            </span>
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border/30 px-4 py-2.5">
          {/* Decision content */}
          <pre className="mb-3 whitespace-pre-wrap font-mono text-xs text-muted-foreground">
            {decision.content}
          </pre>

          {/* Related engrams */}
          {detailLoading && (
            <p className="font-mono text-xs text-muted-foreground/60">
              Loading decision details...
            </p>
          )}

          {!detailLoading && details !== null && details.length > 0 && (
            <div className="space-y-1.5 border-t border-border/30 pt-2.5">
              <p className="font-mono text-xs font-medium text-muted-foreground">
                Related engrams ({details.length})
              </p>
              {details.map((engram) => (
                <div
                  key={engram.id}
                  className="flex items-start justify-between gap-2 rounded px-2 py-1.5 hover:bg-muted/20"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-xs font-semibold text-foreground">
                      {engram.concept}
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground line-clamp-2">
                      {engram.summary}
                    </p>
                  </div>
                  {engram.state && (
                    <span className="shrink-0 font-mono text-xs text-muted-foreground/60">
                      {engram.state}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {!detailLoading && details !== null && details.length === 0 && (
            <p className="font-mono text-xs text-muted-foreground/60">
              No related engrams found.
            </p>
          )}

          {/* Metadata footer */}
          <div className="mt-2 flex items-center gap-3 font-mono text-xs text-muted-foreground/60">
            <span>Type: {decision.memory_type}</span>
          </div>
        </div>
      )}
    </div>
  );
}
