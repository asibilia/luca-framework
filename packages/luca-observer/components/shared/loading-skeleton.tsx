/**
 * Reusable loading skeleton component with multiple display variants.
 *
 * Replaces ad-hoc `animate-pulse` loading patterns across all pages
 * with a consistent, accessible skeleton UI.
 *
 * @param variant - The skeleton layout variant to render
 * @param rows - Number of rows for table/text variants (default: 5 for table, 4 for text)
 * @param columns - Number of columns for table variant (default: 4)
 *
 * @example
 * ```tsx
 * <LoadingSkeleton variant="card" />
 * <LoadingSkeleton variant="table" rows={8} columns={5} />
 * <LoadingSkeleton variant="chart" />
 * <LoadingSkeleton variant="text" rows={6} />
 * ```
 */
export function LoadingSkeleton({
  variant,
  rows,
  columns,
}: {
  variant: "card" | "table" | "chart" | "text";
  rows?: number;
  columns?: number;
}) {
  return (
    <div aria-label="Loading" role="status">
      {variant === "card" && <CardSkeleton />}
      {variant === "table" && (
        <TableSkeleton rows={rows ?? 5} columns={columns ?? 4} />
      )}
      {variant === "chart" && <ChartSkeleton />}
      {variant === "text" && <TextSkeleton rows={rows ?? 4} />}
    </div>
  );
}

/**
 * Card skeleton — rectangular card placeholders for overview cards,
 * summary banners, and metric panels.
 */
function CardSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="rounded-lg border border-border bg-card p-4 space-y-3"
        >
          <div className="h-3 w-20 animate-pulse rounded bg-muted" />
          <div className="h-6 w-32 animate-pulse rounded bg-muted" />
          <div className="h-2 w-full animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

/**
 * Table skeleton — row-based skeleton matching the observer table pattern
 * with header row and data rows.
 */
function TableSkeleton({ rows, columns }: { rows: number; columns: number }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full">
        <thead className="bg-card">
          <tr className="border-b border-border">
            {Array.from({ length: columns }).map((_, c) => (
              <th key={c} className="px-3 py-2">
                <div className="h-3 w-16 animate-pulse rounded bg-muted" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r} className="border-b border-border last:border-b-0">
              {Array.from({ length: columns }).map((_, c) => (
                <td key={c} className="px-3 py-2">
                  <div
                    className="h-3 animate-pulse rounded bg-muted"
                    style={{ width: c === 0 ? "60%" : "40%" }}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Chart skeleton — bar chart placeholder with ascending bars
 * matching the convergence chart and budget gauge areas.
 */
function ChartSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="h-3 w-24 animate-pulse rounded bg-muted" />
      <div className="flex h-48 items-end gap-2 pt-4">
        {[30, 50, 40, 65, 55, 75, 60, 80].map((height, i) => (
          <div
            key={i}
            className="flex-1 animate-pulse rounded-t bg-muted"
            style={{ height: `${height}%` }}
          />
        ))}
      </div>
      <div className="h-2 w-full animate-pulse rounded bg-muted" />
    </div>
  );
}

/**
 * Text skeleton — multi-line text placeholder for markdown content
 * in memory and notes pages.
 */
function TextSkeleton({ rows }: { rows: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="h-4 w-32 animate-pulse rounded bg-muted" />
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-3 animate-pulse rounded bg-muted"
          style={{ width: `${85 - i * 8}%` }}
        />
      ))}
    </div>
  );
}
