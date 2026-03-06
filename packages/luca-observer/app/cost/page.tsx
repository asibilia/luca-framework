"use client";

import { PageContainer } from "~/components/layout/page-container";
import { EmptyState } from "~/components/shared/empty-state";
import { LoadingSkeleton } from "~/components/shared/loading-skeleton";
import { CumulativeCostCurve } from "~/components/cost/cumulative-cost-curve";
import { CostBreakdown } from "~/components/cost/cost-breakdown";
import { TokenUsageTrends } from "~/components/cost/token-usage-trends";
import { SessionCostTable } from "~/components/cost/session-cost-table";
import { useCostTracking } from "~/hooks/use-cost-tracking";
import { useTokenUsage } from "~/hooks/use-token-usage";

/**
 * Cost dashboard page.
 *
 * Shows cumulative cost curves, cost breakdowns by tool/phase,
 * token usage trends, and session comparison table.
 */
export default function CostPage() {
  const { cost, totalCost, loading: costLoading } = useCostTracking();
  const { tokenUsage, totals, loading: tokenLoading } = useTokenUsage();

  const loading = costLoading || tokenLoading;

  return (
    <PageContainer
      title="Cost"
      subtitle="Token usage, cost tracking, and session comparison"
    >
      {loading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="font-mono text-xs text-muted-foreground animate-pulse">
                Total Cost
              </p>
              <p className="mt-1 font-mono text-2xl font-bold text-foreground animate-pulse">
                $0.00
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="font-mono text-xs text-muted-foreground animate-pulse">
                Input Tokens
              </p>
              <p className="mt-1 font-mono text-2xl font-bold text-foreground animate-pulse">
                0
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="font-mono text-xs text-muted-foreground animate-pulse">
                Output Tokens
              </p>
              <p className="mt-1 font-mono text-2xl font-bold text-foreground animate-pulse">
                0
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="font-mono text-xs text-muted-foreground animate-pulse">
                Cache Read Tokens
              </p>
              <p className="mt-1 font-mono text-2xl font-bold text-foreground animate-pulse">
                0
              </p>
            </div>
          </div>
          <LoadingSkeleton variant="chart" />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <LoadingSkeleton variant="chart" />
            <LoadingSkeleton variant="chart" />
          </div>
          <LoadingSkeleton variant="table" rows={8} columns={5} />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="font-mono text-xs text-muted-foreground">
                Total Cost
              </p>
              <p className="mt-1 font-mono text-2xl font-bold text-foreground">
                ${(totalCost / 100).toFixed(2)}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="font-mono text-xs text-muted-foreground">
                Input Tokens
              </p>
              <p className="mt-1 font-mono text-2xl font-bold text-foreground">
                {totals.input_tokens.toLocaleString()}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="font-mono text-xs text-muted-foreground">
                Output Tokens
              </p>
              <p className="mt-1 font-mono text-2xl font-bold text-foreground">
                {totals.output_tokens.toLocaleString()}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="font-mono text-xs text-muted-foreground">
                Cache Read Tokens
              </p>
              <p className="mt-1 font-mono text-2xl font-bold text-foreground">
                {totals.cache_read_tokens.toLocaleString()}
              </p>
            </div>
          </div>

          <CumulativeCostCurve
            costs={Array.isArray(cost) ? cost : cost ? [cost] : []}
          />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <TokenUsageTrends tokenUsage={tokenUsage} />
            <CostBreakdown
              costs={Array.isArray(cost) ? cost : cost ? [cost] : []}
            />
          </div>
          <SessionCostTable
            costs={Array.isArray(cost) ? cost : cost ? [cost] : []}
          />
        </div>
      )}
    </PageContainer>
  );
}
