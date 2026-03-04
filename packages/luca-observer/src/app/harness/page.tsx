import { PageContainer } from "~/components/layout/page-container";

export default function HarnessPage() {
  return (
    <PageContainer
      title="Harness"
      subtitle="Verification check results and error details"
    >
      <div className="rounded-lg border border-dashed border-border p-12 text-center">
        <p className="font-mono text-sm text-muted-foreground">
          Check result cards, error list, and fix iteration history — coming in
          Phase 3
        </p>
      </div>
    </PageContainer>
  );
}
