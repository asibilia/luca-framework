import { PageContainer } from "~/components/layout/page-container";
import { LoadingSkeleton } from "~/components/shared/loading-skeleton";

export default function NotesLoading() {
  return (
    <PageContainer
      title="Notes"
      subtitle="Developer notes queue — soft interrupts for agent context"
    >
      <LoadingSkeleton variant="text" rows={3} />
      <LoadingSkeleton variant="text" rows={5} />
    </PageContainer>
  );
}
