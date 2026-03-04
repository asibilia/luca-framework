import { PageContainer } from "~/components/layout/page-container";
import { LoadingSkeleton } from "~/components/shared/loading-skeleton";

export default function PlanningLoading() {
  return (
    <PageContainer
      title="Planning"
      subtitle="WSJF scores, session plans, and quality zones"
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <LoadingSkeleton variant="card" />
        <LoadingSkeleton variant="card" />
      </div>
      <LoadingSkeleton variant="table" rows={6} columns={6} />
    </PageContainer>
  );
}
