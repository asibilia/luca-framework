import type { MuninnExplainResult } from "~/lib/muninn-types";

// -- Types -------------------------------------------------------------------

export interface ScoreBreakdownProps {
  explain: MuninnExplainResult;
}

// -- Helpers -----------------------------------------------------------------

/** Convert a snake_case string to Title Case (e.g., "semantic_similarity" -> "Semantic Similarity"). */
function toTitleCase(snakeCase: string): string {
  return snakeCase
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// -- Component ---------------------------------------------------------------

/**
 * Inline score breakdown showing the explain components as horizontal bars.
 *
 * Renders each score component from MuninnExplainResult.components as a
 * labeled horizontal bar with its numeric value. Shows final_score, threshold,
 * and would_return status prominently.
 */
export function ScoreBreakdown({ explain }: ScoreBreakdownProps) {
  const { components, final_score, threshold, would_return } = explain;

  const entries = Object.entries(components) as Array<[string, number]>;

  // Normalize bar widths: find the max value to scale bars proportionally.
  // Cap at 1.0 if all values are in the 0-1 range.
  const maxValue = Math.max(...entries.map(([, v]) => v), 1);

  return (
    <div className="mt-3 rounded-md bg-muted/30 p-3 space-y-2">
      {/* Header: final score + status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm font-semibold text-foreground">
            Score: {final_score.toFixed(3)}
          </span>
          <span className="font-mono text-xs text-muted-foreground">
            threshold: {threshold.toFixed(2)}
          </span>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 font-mono text-xs ${
            would_return
              ? "bg-green-500/15 text-green-400"
              : "bg-red-500/15 text-red-400"
          }`}
        >
          {would_return ? "would return" : "below threshold"}
        </span>
      </div>

      {/* Component bars */}
      <div className="space-y-1.5">
        {entries.map(([name, value]) => {
          const widthPercent = Math.max((value / maxValue) * 100, 1);
          return (
            <div key={name} className="flex items-center gap-2">
              <span className="w-36 shrink-0 truncate font-mono text-xs text-muted-foreground">
                {toTitleCase(name)}
              </span>
              <div className="flex-1 h-2 rounded-full bg-muted">
                <div
                  className="h-2 rounded-full bg-primary transition-all"
                  style={{ width: `${widthPercent}%` }}
                />
              </div>
              <span className="w-10 text-right font-mono text-xs text-foreground">
                {value.toFixed(2)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
