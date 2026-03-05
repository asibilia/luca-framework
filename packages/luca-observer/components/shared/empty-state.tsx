/**
 * Reusable empty state component for consistent "no data" UI.
 *
 * Replaces 23 duplicated dashed-border empty state patterns across
 * observer components with a single, configurable component.
 *
 * @param message - The empty state message to display
 * @param title - Optional bold title above the message (e.g., "No Plan")
 *
 * @example
 * ```tsx
 * <EmptyState message="No events yet. Start a Luca workflow to see events." />
 * <EmptyState title="No Plan" message="No session plan has been generated yet." />
 * ```
 */
export function EmptyState({
  message,
  title,
}: {
  message: string;
  title?: string;
}) {
  return (
    <div className="rounded-lg border border-dashed border-border p-8 text-center">
      {title && (
        <p className="font-mono text-lg font-bold text-muted-foreground">
          {title}
        </p>
      )}
      <p
        className={`font-mono text-sm text-muted-foreground${title ? " mt-1" : ""}`}
      >
        {message}
      </p>
    </div>
  );
}
