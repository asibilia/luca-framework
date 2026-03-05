import { PageContainer } from "~/components/layout/page-container";
import { LoadingSkeleton } from "~/components/shared/loading-skeleton";

export default function TribunalLoading() {
  return (
    <PageContainer
      title="Tribunal"
      subtitle="Debate results, findings, and rebuttals"
    >
      <LoadingSkeleton variant="card" />
      <div className="grid gap-6 lg:grid-cols-2">
        <LoadingSkeleton variant="card" />
        <LoadingSkeleton variant="card" />
      </div>
      <LoadingSkeleton variant="table" rows={4} columns={3} />
    </PageContainer>
  );
}
