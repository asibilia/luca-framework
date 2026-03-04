"use client";

import { PageContainer } from "~/components/layout/page-container";
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
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="font-mono text-sm text-muted-foreground animate-pulse">
            Loading planning data...
          </p>
        </div>
      ) : !hasPlan ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <p className="font-mono text-lg font-bold text-muted-foreground">
            No Session Plan
          </p>
          <p className="mt-2 font-mono text-sm text-muted-foreground">
            A session plan will appear here when the planner generates
            WSJF-scored items for the current session.
          </p>
        </div>
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
