"use client";

import { PageContainer } from "~/components/layout/page-container";
import { EmptyState } from "~/components/shared/empty-state";
import { ErrorBoundary } from "~/components/shared/error-boundary";
import { LoadingSkeleton } from "~/components/shared/loading-skeleton";
import { HarnessSummaryBanner } from "~/components/harness/harness-summary-banner";
import { CheckResultCard } from "~/components/harness/check-result-card";
import { useHarnessResult } from "~/hooks/use-harness-result";

/**
 * Harness verification results page.
 *
 * Shows the latest harness run: overall status, per-check results,
 * parsed errors with file/line details, and raw output.
 */
export default function HarnessPage() {
  const { result, loading } = useHarnessResult();

  return (
    <PageContainer
      title="Harness"
      subtitle="Verification check results and error details"
    >
      {loading ? (
        <div className="space-y-4">
          <LoadingSkeleton variant="card" />
          <LoadingSkeleton variant="table" rows={6} columns={4} />
        </div>
      ) : !result ? (
        <EmptyState
          title="No Harness Results"
          message="Harness verification results will appear here after the verification harness runs. Results include check status, error details, and raw output."
        />
      ) : (
        <div className="space-y-4">
          <ErrorBoundary name="HarnessSummaryBanner">
            <HarnessSummaryBanner result={result} />
          </ErrorBoundary>
          {result.checks.length > 0 ? (
            <ErrorBoundary name="CheckResultList">
              <div className="space-y-3">
                <h3 className="font-mono text-sm font-medium text-foreground">
                  Check Results
                </h3>
                {result.checks.map((check) => (
                  <ErrorBoundary key={check.name} name={`CheckResultCard-${check.name}`}>
                    <CheckResultCard check={check} />
                  </ErrorBoundary>
                ))}
              </div>
            </ErrorBoundary>
          ) : (
            <EmptyState message="No checks were run in this harness session." />
          )}
        </div>
      )}
    </PageContainer>
  );
}
