"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useSetAtom } from "jotai";
import { Bot, Loader2 } from "lucide-react";

import { AgentTabContainer } from "~/components/agents/agent-tab-container";
import { EntityTree } from "~/components/editor/entity-tree";
import { SaveBar } from "~/components/feedback/save-bar";
import { ResizableSplit } from "~/components/layout/resizable-split";
import { Skeleton } from "~/components/ui/skeleton";
import { useAgentDetail } from "~/hooks/use-agent-detail";
import { useAgentList } from "~/hooks/use-agent-list";
import { useAgentSave } from "~/hooks/use-agent-save";
import { layoutContextAtom } from "~/stores/layout";

import type { EntityItem } from "~/components/editor/entity-tree";

/**
 * Agents browser page.
 *
 * Three-column layout: EntityTree (left) | Tab editor (center).
 * Supports browsing all agents, viewing config/prompt/source/compiled tabs,
 * editing configuration, and saving changes with ETag concurrency.
 *
 * The compiled preview is available in the "Compiled" tab within the editor.
 * A docked DetailPanel preview will be added in a future enhancement when the
 * root layout supports dynamic detail content injection.
 */
export default function AgentsPage() {
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const setLayoutContext = useSetAtom(layoutContextAtom);

  // Set editor layout context on mount (collapses NavRail)
  useEffect(() => {
    setLayoutContext("editor");
    return () => {
      setLayoutContext("dashboard");
    };
  }, [setLayoutContext]);

  // Fetch agent list
  const { agents, loading: listLoading } = useAgentList();

  // Fetch selected agent detail
  const { detail, loading: detailLoading, etag } = useAgentDetail(selectedName);

  // Map API summaries to EntityTree items
  const entityItems: EntityItem[] = useMemo(() => {
    return agents.map((agent) => {
      // Derive directory from filePath: extract the subdir (general/ or luca/)
      const pathParts = agent.filePath.split("/");
      const srcIdx = pathParts.indexOf("agents");
      const directory =
        srcIdx >= 0 && srcIdx + 1 < pathParts.length
          ? `${pathParts[srcIdx + 1]}/`
          : "unknown/";
      return {
        name: agent.name,
        directory,
        type: "agent" as const,
      };
    });
  }, [agents]);

  // Save/discard integration
  const { save, discard } = useAgentSave(selectedName, etag);

  const handleSave = useCallback(async () => {
    await save();
  }, [save]);

  const handleDiscard = useCallback(() => {
    discard();
  }, [discard]);

  // Cmd+S keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [save]);

  return (
    <div className="flex h-full flex-col">
      <ResizableSplit
        orientation="horizontal"
        defaultFirstSize={20}
        minFirstSize={15}
        maxFirstSize={30}
      >
        {/* Left panel: Entity tree */}
        <div className="flex h-full flex-col border-r bg-muted/30 pt-2">
          <div className="px-2 pb-1.5">
            <h2 className="text-xs font-semibold text-muted-foreground">
              Agents
            </h2>
          </div>
          {listLoading ? (
            <div className="space-y-1 px-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-7 w-full" />
              ))}
            </div>
          ) : (
            <EntityTree
              entities={entityItems}
              selectedName={selectedName}
              onSelect={setSelectedName}
              className="flex-1 overflow-y-auto"
            />
          )}
        </div>

        {/* Right panel: Editor area */}
        <div className="flex h-full flex-col overflow-hidden">
          {!selectedName ? (
            <EmptyState />
          ) : detailLoading ? (
            <LoadingState />
          ) : detail ? (
            <AgentTabContainer name={selectedName} detail={detail} />
          ) : (
            <EmptyState />
          )}

          {/* Save bar scoped to agent entities */}
          <SaveBar
            onSave={handleSave}
            onDiscard={handleDiscard}
            entityFilter="agent:"
          />
        </div>
      </ResizableSplit>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Internal: Empty state
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
      <Bot className="size-10 opacity-30" />
      <p className="text-sm">Select an agent to view its configuration</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Internal: Loading state
// ---------------------------------------------------------------------------

function LoadingState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
      <Loader2 className="size-6 animate-spin" />
      <p className="text-sm">Loading agent configuration...</p>
    </div>
  );
}
