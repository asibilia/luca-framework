import { PageContainer } from "~/components/layout/page-container";
import { LoadingSkeleton } from "~/components/shared/loading-skeleton";

export default function CostLoading() {
  return (
    <PageContainer
      title="Cost"
      subtitle="Token usage, cost tracking, and session comparison"
    >
      <LoadingSkeleton variant="card" />
      <LoadingSkeleton variant="chart" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <LoadingSkeleton variant="chart" />
        <LoadingSkeleton variant="chart" />
      </div>
      <LoadingSkeleton variant="table" rows={8} columns={5} />
    </PageContainer>
  );
}
