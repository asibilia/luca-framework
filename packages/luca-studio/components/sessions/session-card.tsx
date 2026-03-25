"use client";

import { useState } from "react";

import { ChevronDown, ChevronRight } from "lucide-react";

import { relativeTime } from "~/lib/format";

import type { SessionInfo } from "~/hooks/use-session-explorer";
import type { MuninnEntityEngram } from "~/lib/muninn-types";

/**
 * Workflow type display metadata.
 *
 * Maps workflow type strings to color tokens for badges.
 */
const WORKFLOW_COLORS: Record<string, string> = {
  execute: "success",
  debug: "warning",
  plan: "info",
  verify: "chart-2",
  learn: "event-memory",
  unknown: "muted-foreground",
};

/**
 * Get the color token for a workflow type badge.
 */
function getWorkflowColor(workflowType: string): string {
  return WORKFLOW_COLORS[workflowType.toLowerCase()] ?? "muted-foreground";
}

/**
 * Collapsible card displaying a single MuninnDB workflow session.
 *
 * Collapsed view shows: session concept, workflow type badge, phase info,
 * relative timestamp, and engram count. Expanding fetches and displays
 * session detail (findings) as a timeline.
 *
 * Follows the MemoryEntries collapsible pattern: ChevronDown/ChevronRight,
 * aria-expanded, card styling with border-border and bg-card.
 *
 * @param session - Parsed session metadata
 * @param onFetchDetail - Callback to fetch detail engrams for expansion
 */
export function SessionCard({
  session,
  onFetchDetail,
}: {
  session: SessionInfo;
  onFetchDetail: (concept: string) => Promise<MuninnEntityEngram[]>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [details, setDetails] = useState<MuninnEntityEngram[] | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const workflowColor = getWorkflowColor(session.workflow_type);
  const timestamp = relativeTime(session.start_time);

  async function handleToggle() {
    if (!expanded && details === null) {
      setDetailLoading(true);
      try {
        const result = await onFetchDetail(session.concept);
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

          {/* Session concept/name */}
          <span className="font-mono text-xs font-semibold text-foreground">
            {session.session_id}
          </span>

          {/* Workflow type badge */}
          <span
            className="rounded px-2 py-0.5 font-mono text-xs font-medium"
            style={{
              color: `var(--color-${workflowColor})`,
              backgroundColor: `color-mix(in oklab, var(--color-${workflowColor}) 15%, transparent)`,
            }}
          >
            {session.workflow_type}
          </span>

          {/* Phase info */}
          {session.phase && (
            <span className="font-mono text-xs text-muted-foreground">
              Phase {session.phase}
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/* Relative timestamp */}
          {timestamp && (
            <span className="font-mono text-xs text-muted-foreground/60">
              {timestamp}
            </span>
          )}

          {/* Engram count badge */}
          <span className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
            {session.engram_count}
          </span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border/30 px-4 py-2.5">
          {/* Session content summary */}
          <pre className="mb-3 whitespace-pre-wrap font-mono text-xs text-muted-foreground">
            {session.content}
          </pre>

          {/* Session detail timeline */}
          {detailLoading && (
            <p className="font-mono text-xs text-muted-foreground/60">
              Loading session details...
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

          {/* Session metadata footer */}
          <div className="mt-2 flex items-center gap-3 font-mono text-xs text-muted-foreground/60">
            {session.branch && <span>Branch: {session.branch}</span>}
            {session.github_issue && <span>Issue: {session.github_issue}</span>}
            {session.status !== "unknown" && (
              <span>Status: {session.status}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
