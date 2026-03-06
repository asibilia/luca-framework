"use client";

import { PageContainer } from "~/components/layout/page-container";
import { EmptyState } from "~/components/shared/empty-state";
import { LoadingSkeleton } from "~/components/shared/loading-skeleton";
import { SessionPlanOverview } from "~/components/planning/session-plan-overview";
import { WSJFScoreTable } from "~/components/planning/wsjf-score-table";
import { QualityZoneIndicator } from "~/components/planning/quality-zone-indicator";
import { usePlanning } from "~/hooks/use-planning";
import { useContextHealth } from "~/hooks/use-context-health";

export default function PlanningPage() {
  const { plan, hasPlan, loading } = usePlanning();
  const { latest: latestContext } = useContextHealth();

  const currentZone = plan?.items[0]?.assigned_zone;
  const contextPercent = latestContext?.context_percent;

  return (
    <PageContainer
      title="Planning"
      subtitle="WSJF scores, session plans, and quality zones"
    >
      {loading ? (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <LoadingSkeleton variant="card" />
            <LoadingSkeleton variant="card" />
          </div>
          <LoadingSkeleton variant="table" rows={10} columns={6} />
        </div>
      ) : !hasPlan ? (
        <EmptyState
          title="No Session Plan"
          message="A session plan will appear here when the planner generates WSJF-scored items for the current session."
        />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <SessionPlanOverview plan={plan} />
            <QualityZoneIndicator
              currentZone={currentZone}
              contextPercent={contextPercent}
            />
          </div>
          <WSJFScoreTable
            items={plan?.items ?? []}
            bigRockIndex={plan?.big_rock_index}
          />
        </div>
      )}
    </PageContainer>
  );
}
