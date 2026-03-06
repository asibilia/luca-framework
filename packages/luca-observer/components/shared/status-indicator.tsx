"use client";

import { useWorkflowState } from "~/hooks/use-workflow-state";
import { WORKFLOW_STATES, COMPLEXITY_LEVELS } from "~/lib/constants";

/**
 * Compact status indicator showing workflow state and complexity.
 */
export function StatusIndicator() {
  const { data } = useWorkflowState();

  const stateKey = data?.workflow_state ?? "idle";
  const complexityKey = data?.complexity ?? "MODERATE";

  const stateConfig =
    WORKFLOW_STATES[stateKey as keyof typeof WORKFLOW_STATES] ??
    WORKFLOW_STATES.idle;

  const complexityConfig =
    COMPLEXITY_LEVELS[complexityKey as keyof typeof COMPLEXITY_LEVELS] ??
    COMPLEXITY_LEVELS.MODERATE;

  return (
    <div className="flex items-center gap-2" role="status" aria-label={`Workflow status: ${stateConfig.label}, Complexity: ${complexityConfig.label}`}>
      <span
        className="inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 font-mono text-xs"
        style={{
          borderColor: `var(--color-${stateConfig.color})`,
          color: `var(--color-${stateConfig.color})`,
        }}
      >
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: `var(--color-${stateConfig.color})` }}
          aria-hidden="true"
        />
        {stateConfig.label}
      </span>
      <span
        className="inline-flex items-center rounded-sm border px-1.5 py-0.5 font-mono text-xs"
        style={{
          borderColor: `var(--color-${complexityConfig.color})`,
          color: `var(--color-${complexityConfig.color})`,
        }}
      >
        {complexityConfig.label}
      </span>
    </div>
  );
}
