"use client";

import { useState } from "react";

import orderBy from "lodash/orderBy";
import { ArrowRight } from "lucide-react";

import { WORKFLOW_STATES } from "~/lib/constants";
import { formatTime } from "~/lib/format";
import { EmptyState } from "~/components/shared/empty-state";
import { EventBadge } from "~/components/shared/event-badge";
import { JsonViewer } from "~/components/shared/json-viewer";
import type { LedgerEntry } from "~/lib/types";

/**
 * Resolve a workflow state key to its display color CSS variable.
 *
 * Falls back to muted-foreground for unknown states.
 */
function stateColor(stateKey: string): string {
  const config =
    WORKFLOW_STATES[stateKey as keyof typeof WORKFLOW_STATES] ?? null;
  return `var(--color-${config?.color ?? "muted-foreground"})`;
}

/**
 * Scrollable transition log showing ledger entries as expandable rows.
 *
 * Displays state transitions from the session-ledger.jsonl with
 * color-coded previous/current states, event type badges, and
 * click-to-expand detail panels showing event_data, session_id,
 * and actions_executed.
 *
 * Entries are displayed newest-first (reversed from the input array).
 *
 * @param entries - Array of ledger entries to display
 *
 * @example
 * ```tsx
 * <TransitionLog entries={ledgerEntries} />
 * ```
 */
export function TransitionLog({ entries }: { entries: LedgerEntry[] }) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  if (entries.length === 0) {
    return <EmptyState message="No transitions recorded yet" />;
  }

  const reversed = orderBy(entries, "sequence_number", "desc");

  return (
    <div className="max-h-96 overflow-auto rounded-lg border border-border">
      <table className="w-full min-w-[480px]">
        <thead className="sticky top-0 bg-card">
          <tr className="border-b border-border font-mono text-xs uppercase tracking-wider text-muted-foreground">
            <th className="px-3 py-2 text-left">#</th>
            <th className="px-3 py-2 text-left">Transition</th>
            <th className="px-3 py-2 text-left">Event</th>
            <th className="px-3 py-2 text-right">Time</th>
          </tr>
        </thead>
        <tbody>
          {reversed.map((entry, idx) => {
            const isExpanded = expandedIndex === idx;

            return (
              <tr
                key={`${entry.sequence_number}-${idx}`}
                className="group cursor-pointer border-b border-border last:border-b-0 hover:bg-muted/50"
                onClick={() => setExpandedIndex(isExpanded ? null : idx)}
              >
                <td className="px-3 py-2 font-mono text-xs text-muted-foreground align-top">
                  {entry.sequence_number}
                </td>
                <td className="px-3 py-2 font-mono text-xs align-top">
                  <span style={{ color: stateColor(entry.previous_state) }}>
                    {entry.previous_state}
                  </span>
                  <ArrowRight className="mx-1 inline h-3 w-3 text-muted-foreground" />
                  <span style={{ color: stateColor(entry.current_state) }}>
                    {entry.current_state}
                  </span>
                  {isExpanded && (
                    <div
                      className="mt-2 space-y-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {entry.session_id && (
                        <p className="font-mono text-xs text-muted-foreground">
                          <span className="text-foreground/60">Session:</span>{" "}
                          {entry.session_id}
                        </p>
                      )}
                      {entry.actions_executed.length > 0 && (
                        <div>
                          <p className="mb-1 text-foreground/60">Actions:</p>
                          <ul className="list-inside list-disc text-muted-foreground">
                            {entry.actions_executed.map((action, i) => (
                              <li key={i}>{action}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {Object.keys(entry.event_data).length > 0 && (
                        <div>
                          <p className="mb-1 text-foreground/60">Event Data:</p>
                          <JsonViewer
                            data={entry.event_data}
                            collapsed={false}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 align-top">
                  <EventBadge eventType={entry.event_type} />
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground align-top">
                  {formatTime(entry.timestamp)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
