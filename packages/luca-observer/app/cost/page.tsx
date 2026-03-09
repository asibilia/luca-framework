import { PageContainer } from "~/components/layout/page-container";

export default function PlaceholderPage() {
  return (
    <PageContainer
      title="Cost Tracking"
      subtitle="Coming soon — rebuilding with MuninnDB"
    >
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="font-mono text-sm text-muted-foreground">
          This page is being rebuilt with MuninnDB data sources.
        </p>
      </div>
    </PageContainer>
  );
}
