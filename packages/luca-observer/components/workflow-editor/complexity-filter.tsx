"use client";

import { COMPLEXITY_LEVELS } from "~/lib/constants";

// -- Types --------------------------------------------------------------------

interface ComplexityFilterProps {
  value: string | undefined;
  onChange: (complexity: string | undefined) => void;
}

const LEVELS = Object.keys(COMPLEXITY_LEVELS) as Array<
  keyof typeof COMPLEXITY_LEVELS
>;

// -- Component ----------------------------------------------------------------

/**
 * Complexity tier visualization selector for the workflow editor.
 *
 * Renders a horizontal row of complexity level buttons. Selecting a level
 * updates agent card accents and tier badges to show each agent's model
 * tier at that complexity (resolved from routing presets). All agents
 * remain visible at all complexity levels. Clicking the active level
 * again clears the selection (returns to default MODERATE tiers).
 *
 * Rendered inside a React Flow `<Panel position="top-center">` by the canvas.
 */
export function ComplexityFilter({ value, onChange }: ComplexityFilterProps) {
  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-border/40 bg-card/95 px-3 py-2 shadow-lg shadow-black/20 backdrop-blur-sm">
      <span className="mr-1 text-xs font-medium text-muted-foreground">
        Complexity
      </span>
      {LEVELS.map((level) => {
        const meta = COMPLEXITY_LEVELS[level];
        const isActive = value === level;
        return (
          <button
            key={level}
            onClick={() => onChange(isActive ? undefined : level)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
              isActive
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
            title={`Show model tiers at ${meta.label} complexity (${meta.tier} tier)`}
          >
            {meta.label}
          </button>
        );
      })}
    </div>
  );
}
