import { PageContainer } from "~/components/layout/page-container";
import { LoadingSkeleton } from "~/components/shared/loading-skeleton";

export default function DecisionsLoading() {
  return (
    <PageContainer title="Decisions" subtitle="Decision Trail">
      <LoadingSkeleton variant="card" />
      <LoadingSkeleton variant="card" />
      <LoadingSkeleton variant="text" rows={6} />
    </PageContainer>
  );
}
