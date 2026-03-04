import { PageContainer } from "~/components/layout/page-container";

export default function WorkflowPage() {
  return (
    <PageContainer
      title="Workflow"
      subtitle="State machine visualization and transition log"
    >
      <div className="rounded-lg border border-dashed border-border p-12 text-center">
        <p className="font-mono text-sm text-muted-foreground">
          State diagram and transition log — coming in Phase 2
        </p>
      </div>
    </PageContainer>
  );
}
