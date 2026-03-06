"use client";

import { PageContainer } from "~/components/layout/page-container";
import { EmptyState } from "~/components/shared/empty-state";
import { LoadingSkeleton } from "~/components/shared/loading-skeleton";
import { ConvergenceChart } from "~/components/iteration/convergence-chart";
import { BudgetGauge } from "~/components/iteration/budget-gauge";
import { ErrorClassificationBreakdown } from "~/components/iteration/error-classification-breakdown";
import { IterationTimeline } from "~/components/iteration/iteration-timeline";
import { TokenUsageChart } from "~/components/iteration/token-usage-chart";
import { ContextPressureTimeline } from "~/components/iteration/context-pressure-timeline";
import { useIterationHistory } from "~/hooks/use-iteration-history";

/**
 * Iterations page showing convergence tracking and error classification.
 *
 * Displays a convergence chart, budget gauge, error classification
 * breakdown, and detailed iteration timeline. All data sourced from
 * the useIterationHistory hook.
 */
export default function IterationsPage() {
  const { iterations, loading } = useIterationHistory();

  const lastIteration = iterations[iterations.length - 1];
  const currentIteration = lastIteration?.iteration ?? 0;
  // Derive max from the number of completed iterations + reasonable default
  const maxIterations = Math.max(currentIteration, 3);

  return (
    <PageContainer
      title="Iterations"
      subtitle="Convergence tracking and error classification"
    >
      {loading ? (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <LoadingSkeleton variant="chart" />
            <LoadingSkeleton variant="card" />
          </div>
          <LoadingSkeleton variant="table" rows={8} columns={4} />
        </div>
      ) : iterations.length === 0 ? (
        <EmptyState
          title="No Iterations Yet"
          message="Iteration data will appear here when the harness or verification loop runs and records checkpoint data."
        />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <ConvergenceChart iterations={iterations} />
            <BudgetGauge
              currentIteration={currentIteration}
              maxIterations={maxIterations}
              softStopPercent={80}
              status={
                lastIteration?.stale_count !== undefined &&
                lastIteration.stale_count > 1
                  ? "exceeded"
                  : "under_budget"
              }
            />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <TokenUsageChart />
            <ContextPressureTimeline />
          </div>
          <ErrorClassificationBreakdown iterations={iterations} />
          <IterationTimeline iterations={iterations} />
        </div>
      )}
    </PageContainer>
  );
}
