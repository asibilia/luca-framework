"use client";

import { PageContainer } from "~/components/layout/page-container";
import { EmptyState } from "~/components/shared/empty-state";
import { ErrorBoundary } from "~/components/shared/error-boundary";
import { BrainPanel } from "~/components/memory/brain-panel";
import { MemoryEntries } from "~/components/memory/memory-entries";
import { WorkingSections } from "~/components/memory/working-sections";
import { ContextUsageBar } from "~/components/memory/context-usage-bar";
import { useMemory } from "~/hooks/use-memory";

export default function MemoryPage() {
  const { data, loading } = useMemory();

  return (
    <PageContainer
      title="Memory"
      subtitle="BRAIN, MEMORY, and WORKING file viewer"
    >
      {loading ? (
        <EmptyState message="Loading memory files..." />
      ) : (
        <div className="space-y-6">
          <ErrorBoundary name="ContextUsageBar">
            <ContextUsageBar
              brain={data?.brain ?? ""}
              memory={data?.memory ?? ""}
              working={data?.working ?? ""}
            />
          </ErrorBoundary>
          <div className="grid gap-6 lg:grid-cols-3">
            <ErrorBoundary name="BrainPanel">
              <BrainPanel content={data?.brain ?? ""} />
            </ErrorBoundary>
            <ErrorBoundary name="MemoryEntries">
              <MemoryEntries content={data?.memory ?? ""} />
            </ErrorBoundary>
            <ErrorBoundary name="WorkingSections">
              <WorkingSections content={data?.working ?? ""} />
            </ErrorBoundary>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
