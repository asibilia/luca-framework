"use client";

import { COMPLEXITY_LEVELS } from "~/lib/constants";
import type { WorkflowSnapshot } from "~/lib/types";

/**
 * Context field definition for rendering key/value rows.
 */
interface ContextField {
  label: string;
  value: string;
  colorVar?: string;
}

/**
 * Build the list of displayable context fields from a workflow snapshot.
 *
 * Resolves complexity to its semantic color from COMPLEXITY_LEVELS.
 */
function buildFields(state: WorkflowSnapshot): ContextField[] {
  const complexityKey = state.complexity as keyof typeof COMPLEXITY_LEVELS;
  const complexityConfig =
    COMPLEXITY_LEVELS[complexityKey] ?? COMPLEXITY_LEVELS.MODERATE;

  return [
    {
      label: "Session ID",
      value: state.session_id || "--",
    },
    {
      label: "Phase",
      value: state.current_phase > 0 ? `Phase ${state.current_phase}` : "--",
    },
    {
      label: "Plan",
      value: state.current_plan || "--",
    },
    {
      label: "Complexity",
      value: complexityConfig.label,
      colorVar: `var(--color-${complexityConfig.color})`,
    },
    {
      label: "Oversight",
      value: state.oversight || "--",
    },
    {
      label: "Ticket",
      value: state.ticket_id || "--",
    },
    {
      label: "Branch",
      value: state.branch || "--",
    },
  ];
}

/**
 * Workflow context panel displaying key/value fields from the current
 * workflow snapshot state.
 *
 * Renders Session ID, Phase, Plan, Complexity (color-coded), Oversight,
 * Ticket, and Branch. Shows a loading skeleton when state is null.
 *
 * @param state - Current workflow snapshot, or null when loading
 *
 * @example
 * ```tsx
 * <WorkflowContextPanel state={workflowData} />
 * ```
 */
export function WorkflowContextPanel({
  state,
}: {
  state: WorkflowSnapshot | null;
}) {
  if (!state) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
          Context
        </p>
        <div className="mt-3 space-y-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between">
              <div className="h-3 w-20 animate-pulse rounded bg-muted" />
              <div className="h-3 w-32 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const fields = buildFields(state);

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
        Context
      </p>
      <dl className="mt-3 space-y-2">
        {fields.map((field) => (
          <div
            key={field.label}
            className="flex items-center justify-between gap-4"
          >
            <dt className="font-mono text-xs text-muted-foreground">
              {field.label}
            </dt>
            <dd
              className="truncate font-mono text-xs font-medium"
              style={field.colorVar ? { color: field.colorVar } : undefined}
              title={field.value}
            >
              {field.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
