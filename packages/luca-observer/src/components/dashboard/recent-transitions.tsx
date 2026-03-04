"use client";

import { SectionHeader } from "~/components/layout/section-header";
import { WORKFLOW_STATES } from "~/lib/constants";
import type { LedgerEntry } from "~/lib/types";

/**
 * Display the most recent state machine transitions from the ledger.
 *
 * Shows a chronological list of transitions with:
 * - Sequence number
 * - Previous state -> Current state (color-coded)
 * - Event type that triggered the transition
 * - Timestamp
 *
 * @param entries - Array of ledger entries to display
 */
export function RecentTransitions({ entries }: { entries: LedgerEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <SectionHeader title="Recent Transitions" />
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="font-mono text-sm text-muted-foreground">
            No transitions recorded yet. Start a workflow to see state changes.
          </p>
        </div>
      </div>
    );
  }

  // Show newest first
  const sorted = [...entries].reverse();

  return (
    <div className="flex flex-col gap-3">
      <SectionHeader
        title="Recent Transitions"
        actions={
          <span className="font-mono text-xs text-muted-foreground">
            {entries.length} entries
          </span>
        }
      />
      <div className="rounded-lg border border-border">
        <div className="max-h-[32rem] overflow-y-auto">
          {sorted.map((entry) => (
            <TransitionRow key={entry.sequence_number} entry={entry} />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Single transition row with color-coded state labels.
 */
function TransitionRow({ entry }: { entry: LedgerEntry }) {
  const fromState =
    WORKFLOW_STATES[entry.previous_state as keyof typeof WORKFLOW_STATES];
  const toState =
    WORKFLOW_STATES[entry.current_state as keyof typeof WORKFLOW_STATES];

  return (
    <div className="flex items-center gap-3 border-b border-border px-3 py-2 last:border-b-0">
      <span className="font-mono text-xs tabular-nums text-muted-foreground">
        #{entry.sequence_number}
      </span>
      <span
        className="font-mono text-xs"
        style={{
          color: `var(--color-${fromState?.color ?? "muted-foreground"})`,
        }}
      >
        {fromState?.label ?? entry.previous_state}
      </span>
      <span className="font-mono text-xs text-muted-foreground">&rarr;</span>
      <span
        className="font-mono text-xs font-medium"
        style={{
          color: `var(--color-${toState?.color ?? "muted-foreground"})`,
        }}
      >
        {toState?.label ?? entry.current_state}
      </span>
      <span className="ml-auto font-mono text-xs text-muted-foreground">
        {entry.event_type}
      </span>
      {entry.timestamp && (
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {new Date(entry.timestamp).toLocaleTimeString()}
        </span>
      )}
    </div>
  );
}
