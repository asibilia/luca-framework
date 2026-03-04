import { PageContainer } from "~/components/layout/page-container";

export default function AgentsPage() {
  return (
    <PageContainer
      title="Agents"
      subtitle="Agent activity, scorecards, and model routing"
    >
      <div className="rounded-lg border border-dashed border-border p-12 text-center">
        <p className="font-mono text-sm text-muted-foreground">
          Scorecard table, activity log, and cognition tier display — coming in
          Phase 5
        </p>
      </div>
    </PageContainer>
  );
}
