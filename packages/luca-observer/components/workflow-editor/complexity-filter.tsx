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
 * Complexity overlay filter for the workflow editor.
 *
 * Renders a horizontal row of complexity level buttons. Selecting a level
 * filters the graph to show only agents active at that complexity.
 * Clicking the active level again clears the filter (show all).
 */
export function ComplexityFilter({ value, onChange }: ComplexityFilterProps) {
  return (
    <div className="absolute left-1/2 top-2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-md border border-border/30 bg-card/90 px-2 py-1 backdrop-blur-sm">
      <span className="mr-1 text-[9px] text-muted-foreground">Complexity:</span>
      {LEVELS.map((level) => {
        const meta = COMPLEXITY_LEVELS[level];
        const isActive = value === level;
        return (
          <button
            key={level}
            onClick={() => onChange(isActive ? undefined : level)}
            className={`rounded px-1.5 py-0.5 text-[9px] font-medium transition-colors ${
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
            title={`Filter to ${meta.label} complexity (${meta.tier} tier)`}
          >
            {meta.label}
          </button>
        );
      })}
    </div>
  );
}
