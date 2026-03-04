"use client";

import { PageContainer } from "~/components/layout/page-container";
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
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="font-mono text-sm text-muted-foreground">
            Loading harness results...
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <HarnessSummaryBanner result={result} />
          {result && result.checks.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-mono text-sm font-medium text-foreground">
                Check Results
              </h3>
              {result.checks.map((check) => (
                <CheckResultCard key={check.name} check={check} />
              ))}
            </div>
          )}
        </div>
      )}
    </PageContainer>
  );
}
