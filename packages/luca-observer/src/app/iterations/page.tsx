import { PageContainer } from "~/components/layout/page-container";

export default function IterationsPage() {
  return (
    <PageContainer
      title="Iterations"
      subtitle="Convergence tracking and error classification"
    >
      <div className="rounded-lg border border-dashed border-border p-12 text-center">
        <p className="font-mono text-sm text-muted-foreground">
          Convergence chart, budget gauge, and error classification — coming in
          Phase 3
        </p>
      </div>
    </PageContainer>
  );
}
