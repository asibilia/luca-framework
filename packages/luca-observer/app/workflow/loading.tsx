import { PageContainer } from "~/components/layout/page-container";
import { LoadingSkeleton } from "~/components/shared/loading-skeleton";

export default function WorkflowLoading() {
  return (
    <PageContainer
      title="Workflow"
      subtitle="State machine visualization and transition log"
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <LoadingSkeleton variant="chart" />
        <LoadingSkeleton variant="card" />
      </div>
      <LoadingSkeleton variant="table" rows={6} columns={3} />
    </PageContainer>
  );
}
