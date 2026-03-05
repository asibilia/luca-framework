"use client";

import { PageContainer } from "~/components/layout/page-container";
import { EmptyState } from "~/components/shared/empty-state";
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
          <ContextUsageBar
            brain={data?.brain ?? ""}
            memory={data?.memory ?? ""}
            working={data?.working ?? ""}
          />
          <div className="grid gap-6 lg:grid-cols-3">
            <BrainPanel content={data?.brain ?? ""} />
            <MemoryEntries content={data?.memory ?? ""} />
            <WorkingSections content={data?.working ?? ""} />
          </div>
        </div>
      )}
    </PageContainer>
  );
}
