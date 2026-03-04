import type { ParsedErrorSnapshot } from "~/lib/types";

/**
 * List of parsed errors or warnings from a harness check.
 *
 * Renders each error with file:line:column format, message,
 * and severity color-coding.
 *
 * @param errors - Array of parsed errors to display
 */
export function ParsedErrorList({ errors }: { errors: ParsedErrorSnapshot[] }) {
  if (errors.length === 0) return null;

  return (
    <div className="space-y-1">
      {errors.map((error, idx) => {
        const location = [
          error.file,
          error.line !== undefined ? error.line : null,
          error.column !== undefined ? error.column : null,
        ]
          .filter((v) => v !== null)
          .join(":");

        const isWarning = error.severity === "warning";

        return (
          <div key={idx} className="flex items-start gap-2">
            <span
              className="mt-0.5 font-mono text-xs"
              style={{
                color: isWarning
                  ? "var(--color-warning)"
                  : "var(--color-destructive)",
              }}
            >
              {isWarning ? "warn" : "err"}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              {location}
            </span>
            <span className="font-mono text-xs text-foreground">
              {error.message}
            </span>
            {error.code && (
              <span className="font-mono text-xs text-muted-foreground">
                ({error.code})
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
