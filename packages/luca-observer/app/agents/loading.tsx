import { PageContainer } from "~/components/layout/page-container";
import { LoadingSkeleton } from "~/components/shared/loading-skeleton";

export default function AgentsLoading() {
  return (
    <PageContainer
      title="Agents"
      subtitle="Agent activity, scorecards, and model routing"
    >
      <LoadingSkeleton variant="table" rows={6} columns={5} />
      <div className="grid gap-6 lg:grid-cols-2">
        <LoadingSkeleton variant="table" rows={4} columns={3} />
        <LoadingSkeleton variant="card" />
      </div>
    </PageContainer>
  );
}
