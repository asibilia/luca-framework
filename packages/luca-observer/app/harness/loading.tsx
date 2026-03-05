import { PageContainer } from "~/components/layout/page-container";
import { LoadingSkeleton } from "~/components/shared/loading-skeleton";

export default function HarnessLoading() {
  return (
    <PageContainer
      title="Harness"
      subtitle="Verification check results and error details"
    >
      <LoadingSkeleton variant="card" />
      <LoadingSkeleton variant="table" rows={4} columns={3} />
    </PageContainer>
  );
}
