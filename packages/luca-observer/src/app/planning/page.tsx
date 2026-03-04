import { PageContainer } from "~/components/layout/page-container";

export default function PlanningPage() {
  return (
    <PageContainer
      title="Planning"
      subtitle="WSJF scores, session plans, and quality zones"
    >
      <div className="rounded-lg border border-dashed border-border p-12 text-center">
        <p className="font-mono text-sm text-muted-foreground">
          WSJF table, weekly plan overview, and quality zone indicator — coming
          in Phase 4
        </p>
      </div>
    </PageContainer>
  );
}
