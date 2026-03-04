"use client";

import { PageContainer } from "~/components/layout/page-container";
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
 * the useIterationHistory polling hook.
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
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="font-mono text-sm text-muted-foreground animate-pulse">
            Loading iteration data...
          </p>
        </div>
      ) : iterations.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <p className="font-mono text-lg font-bold text-muted-foreground">
            No Iterations Yet
          </p>
          <p className="mt-2 font-mono text-sm text-muted-foreground">
            Iteration data will appear here when the harness or verification
            loop runs and records checkpoint data.
          </p>
        </div>
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
