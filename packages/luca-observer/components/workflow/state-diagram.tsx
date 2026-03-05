"use client";

import { WORKFLOW_STATES } from "~/lib/constants";

/**
 * State row layout for the workflow state diagram.
 *
 * States are arranged in logical rows reflecting the Luca workflow
 * progression from idle through completion, with terminal/exception
 * states in the final row.
 */
const STATE_ROWS: Array<Array<keyof typeof WORKFLOW_STATES>> = [
  ["idle"],
  ["preflight", "routing"],
  ["discussing", "planning"],
  ["executing"],
  ["verifying"],
  ["learning", "committing"],
  ["complete"],
  ["paused", "suspended", "failed"],
];

/**
 * CSS-only grid-based state diagram for the Luca workflow state machine.
 *
 * Renders all workflow states arranged in logical rows. The current state
 * is highlighted with its semantic color, bold text, and a glow effect.
 * Inactive states appear muted.
 *
 * @param currentState - The currently active workflow state key
 *
 * @example
 * ```tsx
 * <StateDiagram currentState="executing" />
 * ```
 */
export function StateDiagram({ currentState }: { currentState: string }) {
  return (
    <div className="flex flex-col gap-2">
      {STATE_ROWS.map((row, rowIndex) => (
        <div key={rowIndex} className="flex items-center justify-center gap-2">
          {row.map((stateKey) => {
            const config = WORKFLOW_STATES[stateKey];
            const isActive = currentState === stateKey;
            const colorVar = `var(--color-${config.color})`;

            return (
              <div
                key={stateKey}
                className={
                  "rounded-md border px-3 py-1.5 font-mono text-xs transition-all " +
                  (isActive
                    ? "font-bold"
                    : "border-border text-muted-foreground opacity-50")
                }
                style={
                  isActive
                    ? {
                        borderColor: colorVar,
                        color: colorVar,
                        boxShadow: `0 0 8px ${colorVar}`,
                      }
                    : undefined
                }
              >
                {config.label}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
