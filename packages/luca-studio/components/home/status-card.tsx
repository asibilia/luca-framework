"use client";

import { useMemo } from "react";

import get from "lodash/get";

import { Badge } from "~/components/ui/badge";
import { WORKFLOW_STATES } from "~/lib/constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StatusCardProps = {
  /** Workflow state from /api/state, or null when unavailable. */
  state: Record<string, unknown> | null;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Displays the current Luca workflow state as a status card.
 *
 * Reads the `value` field from the state machine snapshot to determine
 * the current status (idle, executing, etc.). Shows phase number, complexity,
 * and milestone when available.
 *
 * When state is null or empty, shows a "No active session" placeholder.
 *
 * @param state - Workflow state object from /api/state.
 *
 * @example
 * ```tsx
 * <StatusCard state={workflowState} />
 * ```
 */
export function StatusCard({ state }: StatusCardProps) {
  const statusInfo = useMemo(() => {
    if (!state || Object.keys(state).length === 0) {
      return {
        label: "No Active Session",
        color: "muted-foreground",
        phase: null,
        complexity: null,
        milestone: null,
      };
    }

    const value = get(state, "value", "idle") as string;
    const meta = WORKFLOW_STATES[value as keyof typeof WORKFLOW_STATES];
    const label = meta?.label ?? value;
    const color = meta?.color ?? "muted-foreground";

    const context = get(state, "context", {}) as Record<string, unknown>;
    const phase = get(context, "current_phase", null) as number | null;
    const complexity = get(context, "complexity", null) as string | null;
    const milestone = get(context, "current_milestone", null) as string | null;

    return { label, color, phase, complexity, milestone };
  }, [state]);

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">
          Workflow Status
        </h3>
        <Badge variant="secondary" className="font-mono text-xs">
          {statusInfo.label}
        </Badge>
      </div>

      <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
        <div>
          <span className="text-xs text-muted-foreground">Phase</span>
          <p className="font-mono text-sm">
            {statusInfo.phase != null ? `Phase ${statusInfo.phase}` : "--"}
          </p>
        </div>
        <div>
          <span className="text-xs text-muted-foreground">Complexity</span>
          <p className="font-mono text-sm">{statusInfo.complexity ?? "--"}</p>
        </div>
        <div>
          <span className="text-xs text-muted-foreground">Milestone</span>
          <p className="truncate font-mono text-sm">
            {statusInfo.milestone ?? "--"}
          </p>
        </div>
      </div>
    </div>
  );
}
