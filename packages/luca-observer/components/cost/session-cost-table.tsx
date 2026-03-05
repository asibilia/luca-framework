"use client";

import orderBy from "lodash/orderBy";

import { EmptyState } from "~/components/shared/empty-state";

/**
 * Table comparing costs across sessions.
 *
 * Displays session ID, input/output cost, total cost, and turn count
 * in a sortable tabular format.
 *
 * @param costs - Array of cost entries per session
 */
export function SessionCostTable({
  costs,
}: {
  costs: {
    session_id: string;
    input_cost_cents: number;
    output_cost_cents: number;
    total_cost_cents: number;
    turn_count: number;
    timestamp: number;
  }[];
}) {
  if (costs.length === 0) {
    return <EmptyState message="No session cost data" />;
  }

  const sorted = orderBy(costs, "total_cost_cents", "desc");

  return (
    <div className="rounded-lg border border-border">
      <div className="border-b border-border px-4 py-3">
        <h3 className="font-mono text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Session Costs
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-4 py-2 text-left font-mono text-xs uppercase tracking-wider text-muted-foreground">
                Session
              </th>
              <th className="px-4 py-2 text-right font-mono text-xs uppercase tracking-wider text-muted-foreground">
                Input
              </th>
              <th className="px-4 py-2 text-right font-mono text-xs uppercase tracking-wider text-muted-foreground">
                Output
              </th>
              <th className="px-4 py-2 text-right font-mono text-xs uppercase tracking-wider text-muted-foreground">
                Total
              </th>
              <th className="px-4 py-2 text-right font-mono text-xs uppercase tracking-wider text-muted-foreground">
                Turns
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, idx) => (
              <tr
                key={`${row.session_id}-${idx}`}
                className="border-b border-border last:border-0 hover:bg-muted/20"
              >
                <td className="px-4 py-2 font-mono text-sm text-foreground">
                  {row.session_id.slice(0, 12)}
                </td>
                <td className="px-4 py-2 text-right font-mono text-sm text-muted-foreground">
                  ${(row.input_cost_cents / 100).toFixed(2)}
                </td>
                <td className="px-4 py-2 text-right font-mono text-sm text-muted-foreground">
                  ${(row.output_cost_cents / 100).toFixed(2)}
                </td>
                <td className="px-4 py-2 text-right font-mono text-sm font-medium text-foreground">
                  ${(row.total_cost_cents / 100).toFixed(2)}
                </td>
                <td className="px-4 py-2 text-right font-mono text-sm text-muted-foreground">
                  {row.turn_count}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
