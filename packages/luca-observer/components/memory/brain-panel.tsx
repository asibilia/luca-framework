"use client";

import { useState } from "react";

import { EmptyState } from "~/components/shared/empty-state";

import type { ActivationItem } from "~/hooks/use-memory";

/**
 * Panel rendering MuninnDB brain tree engrams as structured key-value cards.
 *
 * Displays brain activation items with concept, content, and relevance
 * score badges. Preserves mono-font styling with collapsible content.
 *
 * @param items - Array of ActivationItem objects from MuninnDB semantic recall
 */
export function BrainPanel({ items }: { items: ActivationItem[] }) {
  if (items.length === 0) {
    return (
      <EmptyState
        title="No Brain Engrams"
        message="No brain engrams found. Use MuninnDB to store project identity."
      />
    );
  }

  return (
    <div
      role="region"
      aria-label="Brain tree engrams"
      className="flex flex-col rounded-lg border border-border bg-card"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
            Brain Tree
          </p>
          <p className="mt-0.5 font-mono text-xs text-muted-foreground">
            Project Identity
          </p>
        </div>
        <span className="rounded-sm border border-border px-2 py-0.5 font-mono text-xs text-muted-foreground">
          {items.length} {items.length === 1 ? "engram" : "engrams"}
        </span>
      </div>
      <div className="max-h-[28rem] overflow-y-auto">
        {items.map((item) => (
          <BrainEngram key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}

/**
 * Single brain engram card with relevance score badge.
 *
 * Shows concept name, relevance score, and content. Content is
 * collapsible to keep the panel compact when many engrams exist.
 */
function BrainEngram({ item }: { item: ActivationItem }) {
  const [expanded, setExpanded] = useState(true);
  const relevancePercent = Math.round(item.score * 100);

  return (
    <div className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-muted/30 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
      >
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">
            {expanded ? "\u25BC" : "\u25B6"}
          </span>
          <span className="font-mono text-xs font-semibold text-foreground">
            {item.concept}
          </span>
        </div>
        <span
          className="rounded-full px-1.5 py-0.5 font-mono text-xs font-medium"
          style={{
            color: "var(--color-info)",
            backgroundColor:
              "color-mix(in oklab, var(--color-info) 15%, transparent)",
          }}
        >
          {relevancePercent}%
        </span>
      </button>
      {expanded && (
        <div className="border-t border-border px-4 py-2.5">
          <pre className="whitespace-pre-wrap font-mono text-xs text-muted-foreground">
            {item.content}
          </pre>
          {item.tags && item.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {item.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-sm px-1.5 py-0.5 font-mono text-xs text-muted-foreground"
                  style={{
                    backgroundColor:
                      "color-mix(in oklab, var(--color-muted-foreground) 10%, transparent)",
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
          {item.why && (
            <p className="mt-1.5 font-mono text-xs italic text-muted-foreground/60">
              {item.why}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
