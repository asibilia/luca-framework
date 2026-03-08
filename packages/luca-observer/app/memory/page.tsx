"use client";

import { useMemo } from "react";

import { PageContainer } from "~/components/layout/page-container";
import { ErrorBoundary } from "~/components/shared/error-boundary";
import { LoadingSkeleton } from "~/components/shared/loading-skeleton";
import { BrainPanel } from "~/components/memory/brain-panel";
import { MemoryEntries } from "~/components/memory/memory-entries";
import { WorkingSections } from "~/components/memory/working-sections";
import { ContextUsageBar } from "~/components/memory/context-usage-bar";
import { useMemory } from "~/hooks/use-memory";

import type { ActivationItem, Engram, SessionEntry } from "~/hooks/use-memory";

/**
 * Temporary bridge: convert MuninnDB engram data to markdown strings
 * for the existing components (BrainPanel, MemoryEntries, WorkingSections).
 *
 * PLAN-05 rewrites all components to consume MuninnMemoryData directly,
 * at which point these helpers are removed.
 */
function brainToMarkdown(items: ActivationItem[]): string {
  if (items.length === 0) return "";
  return items
    .map((a) => `## ${a.concept}\n\n${a.content}`)
    .join("\n\n---\n\n");
}

function engramsToMarkdown(items: Engram[]): string {
  if (items.length === 0) return "";
  const grouped = new Map<string, Engram[]>();
  for (const e of items) {
    const category =
      e.memory_type ?? e.concept.split(":")[0] ?? "uncategorized";
    const list = grouped.get(category) ?? [];
    list.push(e);
    grouped.set(category, list);
  }
  const sections: string[] = [];
  for (const [cat, entries] of grouped) {
    const heading = `## ${cat.charAt(0).toUpperCase()}${cat.slice(1)}`;
    const bullets = entries.map((e) => `- **${e.concept}**: ${e.content}`);
    sections.push(`${heading}\n\n${bullets.join("\n")}`);
  }
  return sections.join("\n\n");
}

function sessionToMarkdown(entries: SessionEntry[]): string {
  if (entries.length === 0) return "";
  return (
    "## Session Activity\n\n" +
    entries.map((e) => `- **${e.concept}**: ${e.content}`).join("\n")
  );
}

export default function MemoryPage() {
  const { brain, engrams, session, loading, configured, lastUpdated, refresh } =
    useMemory();

  // Bridge MuninnDB data to markdown strings for existing components
  const brainMd = useMemo(() => brainToMarkdown(brain), [brain]);
  const memoryMd = useMemo(() => engramsToMarkdown(engrams), [engrams]);
  const workingMd = useMemo(() => sessionToMarkdown(session), [session]);

  return (
    <PageContainer
      title="Memory"
      subtitle={
        configured
          ? `MuninnDB engrams${lastUpdated ? ` \u00b7 Updated ${lastUpdated.toLocaleTimeString()}` : ""}`
          : "MuninnDB not configured"
      }
      actions={
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      }
    >
      {loading ? (
        <div className="space-y-6">
          <LoadingSkeleton variant="card" />
          <div className="grid gap-6 lg:grid-cols-3">
            <LoadingSkeleton variant="text" rows={6} />
            <LoadingSkeleton variant="text" rows={6} />
            <LoadingSkeleton variant="text" rows={6} />
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <ErrorBoundary name="ContextUsageBar">
            <ContextUsageBar
              brain={brainMd}
              memory={memoryMd}
              working={workingMd}
            />
          </ErrorBoundary>
          <div className="grid gap-6 lg:grid-cols-3">
            <ErrorBoundary name="BrainPanel">
              <BrainPanel content={brainMd} />
            </ErrorBoundary>
            <ErrorBoundary name="MemoryEntries">
              <MemoryEntries content={memoryMd} />
            </ErrorBoundary>
            <ErrorBoundary name="WorkingSections">
              <WorkingSections content={workingMd} />
            </ErrorBoundary>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
