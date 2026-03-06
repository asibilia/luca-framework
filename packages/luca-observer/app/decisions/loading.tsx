import { PageContainer } from "~/components/layout/page-container";
import { LoadingSkeleton } from "~/components/shared/loading-skeleton";

export default function DecisionsLoading() {
  return (
    <PageContainer
      title="Decisions"
      subtitle="Decision audit trail with reasoning and alternatives"
    >
      <LoadingSkeleton variant="table" rows={8} columns={3} />
    </PageContainer>
  );
}
