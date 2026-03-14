"use client";

import { useState, useMemo } from "react";

import { ChevronDown, ChevronRight } from "lucide-react";

import { EmptyState } from "~/components/shared/empty-state";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
} from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";

import type { ActivationItem } from "~/hooks/use-memory";

/** Available filter tabs for concept prefix navigation. */
const FILTER_TABS = [
  { key: "all", label: "All" },
  { key: "brain:", label: "Brain" },
  { key: "session:", label: "Session" },
  { key: "pattern:", label: "Patterns" },
  { key: "decision:", label: "Decisions" },
  { key: "pitfall:", label: "Pitfalls" },
] as const;

/**
 * Enhanced Brain Tree section for the memory page.
 *
 * Extends the existing BrainPanel with type-grouped navigation (tabs)
 * and search filtering. The existing BrainPanel is preserved unchanged.
 *
 * @param items - Array of ActivationItem objects from MuninnDB semantic recall
 */
export function EnhancedBrainTree({ items }: { items: ActivationItem[] }) {
  const [activeFilter, setActiveFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredItems = useMemo(() => {
    let result = items;

    // Filter by tab (concept prefix)
    if (activeFilter !== "all") {
      result = result.filter((item) =>
        item.concept.toLowerCase().startsWith(activeFilter.toLowerCase()),
      );
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (item) =>
          item.concept.toLowerCase().includes(query) ||
          item.content.toLowerCase().includes(query),
      );
    }

    return result;
  }, [items, activeFilter, searchQuery]);

  // Count items per tab for badges
  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = { all: items.length };
    for (const tab of FILTER_TABS) {
      if (tab.key === "all") continue;
      counts[tab.key] = items.filter((item) =>
        item.concept.toLowerCase().startsWith(tab.key.toLowerCase()),
      ).length;
    }
    return counts;
  }, [items]);

  if (items.length === 0) {
    return (
      <EmptyState
        title="No Brain Engrams"
        message="No brain engrams found. Use MuninnDB to store project identity."
      />
    );
  }

  return (
    <Card role="region" aria-label="Enhanced brain tree">
      <CardHeader className="border-b">
        <CardTitle className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
          Brain Tree
        </CardTitle>
        <CardDescription className="font-mono text-xs">
          Project Identity & Knowledge
        </CardDescription>
        <CardAction>
          <Badge variant="outline" className="font-mono text-xs">
            {filteredItems.length} / {items.length}
          </Badge>
        </CardAction>
      </CardHeader>

      <CardContent className="pt-3">
        {/* Filter tabs */}
        <div className="flex flex-wrap gap-1">
          {FILTER_TABS.map((tab) => {
            const count = tabCounts[tab.key] ?? 0;
            const isActive = activeFilter === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveFilter(tab.key)}
                className={`rounded-sm px-2 py-1 font-mono text-xs transition-colors ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {tab.label}
                {count > 0 && <span className="ml-1 opacity-60">{count}</span>}
              </button>
            );
          })}
        </div>

        {/* Search input */}
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search concepts..."
          aria-label="Search brain engrams"
          className="mt-2 w-full rounded border border-border bg-background px-2 py-1 font-mono text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        />
      </CardContent>

      {/* Engram list */}
      <div className="max-h-[28rem] overflow-y-auto">
        {filteredItems.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <p className="font-mono text-xs text-muted-foreground">
              No engrams match the current filter.
            </p>
          </div>
        ) : (
          filteredItems.map((item) => <BrainEngram key={item.id} item={item} />)
        )}
      </div>
    </Card>
  );
}

/**
 * Single brain engram card with relevance score badge.
 *
 * Copied from brain-panel.tsx BrainEngram (not exported).
 * Shows concept name, relevance score, and collapsible content.
 */
function BrainEngram({ item }: { item: ActivationItem }) {
  const [expanded, setExpanded] = useState(false);
  const relevancePercent = Math.round(item.score * 100);

  return (
    <div className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-muted/30 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
          )}
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
