"use client";

import { useState, useMemo } from "react";

import { EmptyState } from "~/components/shared/empty-state";

import type { Engram } from "~/hooks/use-memory";

/**
 * Known memory categories with display metadata.
 *
 * Category resolution uses the hybrid mapping strategy:
 * 1. `memory_type` field (primary key)
 * 2. Concept prefix before first `:` (fallback)
 * 3. "uncategorized" (default)
 */
const KNOWN_CATEGORIES = new Set([
  "pattern",
  "decision",
  "pitfall",
  "preference",
]);

const CATEGORY_DISPLAY: Record<string, { label: string; color: string }> = {
  pattern: { label: "Patterns", color: "success" },
  decision: { label: "Decisions", color: "info" },
  pitfall: { label: "Pitfalls", color: "warning" },
  preference: { label: "Preferences", color: "accent" },
  uncategorized: { label: "Uncategorized", color: "muted-foreground" },
};

/**
 * Resolve engram category using the hybrid mapping strategy.
 *
 * Order of precedence:
 * 1. memory_type field if it matches a known category
 * 2. Concept prefix (text before first `:`) if it matches a known category
 * 3. "uncategorized" as fallback
 */
function resolveCategory(engram: Engram): string {
  // Primary: memory_type field
  if (engram.memory_type && KNOWN_CATEGORIES.has(engram.memory_type)) {
    return engram.memory_type;
  }

  // Fallback: concept prefix (split on first `:`)
  const colonIndex = engram.concept.indexOf(":");
  if (colonIndex > 0) {
    const prefix = engram.concept.slice(0, colonIndex).toLowerCase().trim();
    if (KNOWN_CATEGORIES.has(prefix)) {
      return prefix;
    }
  }

  return "uncategorized";
}

/**
 * Strip the category prefix from a concept name for display.
 *
 * If the concept starts with "category:" (matching a known category),
 * returns the remainder. Otherwise returns the full concept.
 */
function displayConcept(concept: string, category: string): string {
  const colonIndex = concept.indexOf(":");
  if (colonIndex > 0) {
    const prefix = concept.slice(0, colonIndex).toLowerCase().trim();
    if (prefix === category) {
      return concept.slice(colonIndex + 1).trim();
    }
  }
  return concept;
}

/**
 * Format a relative timestamp from a Unix epoch (seconds or ms).
 */
function relativeTime(epochOrMs: number | undefined): string {
  if (!epochOrMs) return "";
  // Normalize: if value looks like seconds (< 1e12), convert to ms
  const ms = epochOrMs < 1e12 ? epochOrMs * 1000 : epochOrMs;
  const now = Date.now();
  const diffMs = now - ms;

  if (diffMs < 0) return "just now";

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

/** Grouped engrams by category for rendering. */
interface CategoryGroup {
  category: string;
  label: string;
  color: string;
  engrams: Engram[];
}

/**
 * Group engrams by resolved category.
 *
 * Returns known categories first (in display order),
 * then uncategorized at the end.
 */
function groupByCategory(engrams: Engram[]): CategoryGroup[] {
  const buckets = new Map<string, Engram[]>();

  for (const engram of engrams) {
    const cat = resolveCategory(engram);
    const list = buckets.get(cat) ?? [];
    list.push(engram);
    buckets.set(cat, list);
  }

  const groups: CategoryGroup[] = [];
  const displayOrder = [
    "pattern",
    "decision",
    "pitfall",
    "preference",
    "uncategorized",
  ];

  for (const cat of displayOrder) {
    const items = buckets.get(cat);
    if (items && items.length > 0) {
      const display = CATEGORY_DISPLAY[cat] ?? CATEGORY_DISPLAY.uncategorized;
      groups.push({
        category: cat,
        label: display.label,
        color: display.color,
        engrams: items,
      });
    }
  }

  return groups;
}

/**
 * Component rendering MuninnDB engrams organized by hybrid category mapping.
 *
 * Categories are resolved from memory_type field, then concept prefix,
 * then "Uncategorized". Known categories are always visible. Uncategorized
 * engrams are hidden by default with a "Show all" toggle.
 *
 * Each engram renders as a medium-density card: concept name, truncated
 * content (~100 chars), confidence badge, tag pills, and relative timestamp.
 * Click/expand reveals full content.
 *
 * @param engrams - Array of MuninnDB Engram objects
 */
export function MemoryEntries({ engrams }: { engrams: Engram[] }) {
  const [showUncategorized, setShowUncategorized] = useState(false);

  const groups = useMemo(() => groupByCategory(engrams), [engrams]);

  const knownGroups = groups.filter((g) => g.category !== "uncategorized");
  const uncategorizedGroup = groups.find((g) => g.category === "uncategorized");
  const totalEntries = engrams.length;

  if (engrams.length === 0) {
    return (
      <EmptyState
        title="No Engrams"
        message="MuninnDB engrams will appear here once stored."
      />
    );
  }

  return (
    <div className="flex flex-col rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
            Engrams
          </p>
          <p className="mt-0.5 font-mono text-xs text-muted-foreground">
            Long-term Learning
          </p>
        </div>
        <span className="rounded-sm border border-border px-2 py-0.5 font-mono text-xs text-muted-foreground">
          {totalEntries} {totalEntries === 1 ? "engram" : "engrams"}
        </span>
      </div>
      <div className="max-h-[36rem] overflow-y-auto">
        {knownGroups.map((group) => (
          <CategorySection key={group.category} group={group} />
        ))}

        {uncategorizedGroup && uncategorizedGroup.engrams.length > 0 && (
          <>
            {showUncategorized && (
              <CategorySection group={uncategorizedGroup} />
            )}
            <div className="border-t border-border px-4 py-2.5">
              <button
                type="button"
                onClick={() => setShowUncategorized(!showUncategorized)}
                className="font-mono text-xs text-muted-foreground underline-offset-2 hover:underline"
              >
                {showUncategorized
                  ? "Hide uncategorized"
                  : `Show all (${uncategorizedGroup.engrams.length} uncategorized)`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Collapsible section for a single engram category.
 */
function CategorySection({ group }: { group: CategoryGroup }) {
  const [expanded, setExpanded] = useState(true);

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
          <span
            className="rounded px-2 py-0.5 font-mono text-xs font-medium"
            style={{
              color: `var(--color-${group.color})`,
              backgroundColor: `color-mix(in oklab, var(--color-${group.color}) 15%, transparent)`,
            }}
          >
            {group.label}
          </span>
        </div>
        <span className="font-mono text-xs text-muted-foreground">
          {group.engrams.length}
        </span>
      </button>
      {expanded && (
        <div className="border-t border-border">
          {group.engrams.map((engram) => (
            <EngramCard
              key={engram.id}
              engram={engram}
              category={group.category}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Medium-density engram card.
 *
 * Shows concept name, truncated content (~100 chars), confidence badge,
 * tag pills, and relative timestamp. Expands on click to show full content.
 */
function EngramCard({
  engram,
  category,
}: {
  engram: Engram;
  category: string;
}) {
  const [expanded, setExpanded] = useState(false);

  const conceptLabel = displayConcept(engram.concept, category);
  const truncatedContent =
    engram.content.length > 100
      ? `${engram.content.slice(0, 100)}...`
      : engram.content;
  const confidencePercent = Math.round(engram.confidence * 100);
  const visibleTags = engram.tags.slice(0, 3);
  const overflowCount = engram.tags.length - 3;
  const timestamp = relativeTime(engram.updated_at ?? engram.created_at);

  return (
    <div className="border-b border-border/50 last:border-b-0">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-2.5 text-left hover:bg-muted/20"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-xs font-semibold text-foreground">
              {conceptLabel}
            </p>
            <p className="mt-0.5 font-mono text-xs text-muted-foreground line-clamp-2">
              {truncatedContent}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {timestamp && (
              <span className="font-mono text-xs text-muted-foreground/60">
                {timestamp}
              </span>
            )}
            <span
              className="rounded-full px-1.5 py-0.5 font-mono text-xs font-medium"
              style={{
                color: "var(--color-foreground)",
                backgroundColor:
                  "color-mix(in oklab, var(--color-muted-foreground) 15%, transparent)",
              }}
            >
              {confidencePercent}%
            </span>
          </div>
        </div>
        {visibleTags.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {visibleTags.map((tag) => (
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
            {overflowCount > 0 && (
              <span className="font-mono text-xs text-muted-foreground/60">
                +{overflowCount} more
              </span>
            )}
          </div>
        )}
      </button>
      {expanded && (
        <div className="border-t border-border/30 px-4 py-2.5">
          <pre className="whitespace-pre-wrap font-mono text-xs text-muted-foreground">
            {engram.content}
          </pre>
          <div className="mt-2 flex items-center gap-3 font-mono text-xs text-muted-foreground/60">
            <span>ID: {engram.id.slice(0, 8)}</span>
            {engram.state && <span>State: {engram.state}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
