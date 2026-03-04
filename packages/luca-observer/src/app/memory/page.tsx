import { PageContainer } from "~/components/layout/page-container";

export default function MemoryPage() {
  return (
    <PageContainer
      title="Memory"
      subtitle="BRAIN, MEMORY, and WORKING file viewer"
    >
      <div className="rounded-lg border border-dashed border-border p-12 text-center">
        <p className="font-mono text-sm text-muted-foreground">
          BRAIN panel, MEMORY entries, WORKING sections, and context usage —
          coming in Phase 4
        </p>
      </div>
    </PageContainer>
  );
}
