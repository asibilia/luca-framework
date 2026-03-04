import { PageContainer } from "~/components/layout/page-container";

export default function TribunalPage() {
  return (
    <PageContainer
      title="Tribunal"
      subtitle="Debate results, findings, and rebuttals"
    >
      <div className="rounded-lg border border-dashed border-border p-12 text-center">
        <p className="font-mono text-sm text-muted-foreground">
          Findings table, disagreements, and rebuttal timeline — coming in Phase
          5
        </p>
      </div>
    </PageContainer>
  );
}
