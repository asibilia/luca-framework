"use client";

import { PageContainer } from "~/components/layout/page-container";

export default function SessionsPage() {
  return (
    <PageContainer title="Sessions" subtitle="Session Explorer">
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="font-mono text-sm text-muted-foreground">
          Loading session explorer...
        </p>
      </div>
    </PageContainer>
  );
}
