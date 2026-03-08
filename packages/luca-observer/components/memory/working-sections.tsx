"use client";

import { useState, useMemo } from "react";

import orderBy from "lodash/orderBy";
import { ChevronDown, ChevronRight } from "lucide-react";

import { EmptyState } from "~/components/shared/empty-state";
import { relativeTime } from "~/lib/format";

import type { SessionEntry } from "~/hooks/use-memory";

/**
 * Date group label for session entries.
 */
type DateGroupLabel = "Today" | "Yesterday" | "Earlier";

/**
 * A group of session entries sharing the same date bucket.
 */
interface DateGroup {
  label: DateGroupLabel;
  entries: SessionEntry[];
}

/**
 * Classify a Unix epoch timestamp into a date bucket.
 */
function classifyDate(epochOrMs: number): DateGroupLabel {
  // Normalize: if value looks like seconds (< 1e12), convert to ms
  const ms = epochOrMs < 1e12 ? epochOrMs * 1000 : epochOrMs;
  const entryDate = new Date(ms);
  const now = new Date();

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - 86_400_000);

  if (entryDate >= todayStart) return "Today";
  if (entryDate >= yesterdayStart) return "Yesterday";
  return "Earlier";
}

/**
 * Extract a short action type label from a session entry concept.
 *
 * Session concepts often follow patterns like "session:finding",
 * "session:decision", etc. This extracts a display-friendly badge label.
 */
function actionType(concept: string): string {
  const colonIndex = concept.indexOf(":");
  if (colonIndex > 0) {
    return concept.slice(colonIndex + 1).trim();
  }
  return concept;
}

/**
 * Group session entries by date bucket (Today, Yesterday, Earlier).
 *
 * Entries are sorted newest-first within each group.
 */
function groupByDate(entries: SessionEntry[]): DateGroup[] {
  const buckets = new Map<DateGroupLabel, SessionEntry[]>();
  const order: DateGroupLabel[] = ["Today", "Yesterday", "Earlier"];

  for (const label of order) {
    buckets.set(label, []);
  }

  for (const entry of entries) {
    const label = classifyDate(entry.created_at);
    buckets.get(label)!.push(entry);
  }

  // Sort entries within each group by created_at descending
  for (const [label, list] of buckets) {
    buckets.set(label, orderBy(list, "created_at", "desc"));
  }

  // Only return non-empty groups
  return order
    .filter((label) => (buckets.get(label)?.length ?? 0) > 0)
    .map((label) => ({
      label,
      entries: buckets.get(label)!,
    }));
}

/**
 * Component rendering MuninnDB session activity grouped by date.
 *
 * Groups entries into Today, Yesterday, and Earlier buckets.
 * Each entry shows an action type badge, truncated entry ID,
 * and relative timestamp. Preserves collapsible panel pattern.
 *
 * @param entries - Array of MuninnDB SessionEntry objects
 */
export function WorkingSections({ entries }: { entries: SessionEntry[] }) {
  const groups = useMemo(() => groupByDate(entries), [entries]);

  if (entries.length === 0) {
    return (
      <EmptyState
        title="No Session Activity"
        message="MuninnDB session entries will appear here during active work."
      />
    );
  }

  return (
    <div
      role="region"
      aria-label="Session activity"
      className="flex flex-col rounded-lg border border-border bg-card"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
            Session Activity
          </p>
          <p className="mt-0.5 font-mono text-xs text-muted-foreground">
            Recent MuninnDB Session
          </p>
        </div>
        <span className="rounded-sm border border-border px-2 py-0.5 font-mono text-xs text-muted-foreground">
          {entries.length} {entries.length === 1 ? "entry" : "entries"}
        </span>
      </div>
      <div className="max-h-[28rem] overflow-y-auto">
        {groups.map((group) => (
          <DateGroupPanel key={group.label} group={group} />
        ))}
      </div>
    </div>
  );
}

/**
 * Collapsible panel for a date group of session entries.
 */
function DateGroupPanel({ group }: { group: DateGroup }) {
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
          {expanded ? (
            <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
          )}
          <span className="font-mono text-xs font-medium text-foreground">
            {group.label}
          </span>
        </div>
        <span className="font-mono text-xs text-muted-foreground">
          {group.entries.length}
        </span>
      </button>
      {expanded && (
        <div className="border-t border-border">
          {group.entries.map((entry) => (
            <SessionEntryRow key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Single session entry row.
 *
 * Shows action type badge, truncated ID, content preview, and relative timestamp.
 */
function SessionEntryRow({ entry }: { entry: SessionEntry }) {
  const [expanded, setExpanded] = useState(false);
  const action = actionType(entry.concept);
  const timestamp = relativeTime(entry.created_at);
  const truncatedId = entry.id.slice(0, 8);

  return (
    <div className="border-b border-border/50 last:border-b-0">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
      >
        <span
          className="shrink-0 rounded px-1.5 py-0.5 font-mono text-xs font-medium"
          style={{
            color: "var(--color-accent)",
            backgroundColor:
              "color-mix(in oklab, var(--color-accent) 15%, transparent)",
          }}
        >
          {action}
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
          {truncatedId}
        </span>
        <span className="shrink-0 font-mono text-xs text-muted-foreground/60">
          {timestamp}
        </span>
      </button>
      {expanded && (
        <div className="border-t border-border/30 px-4 py-2.5">
          <pre className="whitespace-pre-wrap font-mono text-xs text-muted-foreground">
            {entry.content}
          </pre>
        </div>
      )}
    </div>
  );
}
