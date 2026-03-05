import { PageContainer } from "~/components/layout/page-container";
import { LoadingSkeleton } from "~/components/shared/loading-skeleton";

export default function IterationsLoading() {
  return (
    <PageContainer
      title="Iterations"
      subtitle="Convergence tracking and error classification"
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <LoadingSkeleton variant="chart" />
        <LoadingSkeleton variant="chart" />
      </div>
      <LoadingSkeleton variant="table" rows={5} columns={4} />
    </PageContainer>
  );
}
