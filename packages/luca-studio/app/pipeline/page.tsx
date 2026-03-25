"use client";

import { useEffect } from "react";

import dynamic from "next/dynamic";

import { useAtom, useAtomValue, useSetAtom } from "jotai";

import { X } from "lucide-react";

import { ErrorBoundary } from "~/components/shared/error-boundary";
import { StepConfigPanel } from "~/components/workflow/step-config-panel";
import { Button } from "~/components/ui/button";
import { SaveBar } from "~/components/feedback/save-bar";
import { usePipelineSave } from "~/hooks/use-pipeline-save";
import {
  selectedPipelineNodeIdAtom,
  pipelineNodesAtom,
} from "~/stores/pipeline-atoms";
import { detailPanelStateAtom } from "~/stores/layout";

import type { WorkflowNodeData } from "~/lib/workflow-types";

// -- Dynamic import (SSR-safe) -----------------------------------------------

/**
 * PipelineCanvas loaded via next/dynamic with ssr: false to prevent
 * SSR crashes from React Flow's DOM and browser-only APIs.
 */
const PipelineCanvas = dynamic(
  () =>
    import("~/components/workflow/pipeline-canvas").then(
      (m) => m.PipelineCanvas,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center">
        <p className="font-mono text-xs text-muted-foreground">
          Loading pipeline editor...
        </p>
      </div>
    ),
  },
);

// -- Page component ----------------------------------------------------------

/**
 * Pipeline editor page with interactive React Flow v12 DAG.
 *
 * Features:
 * - Interactive canvas with drag persistence and controlled state
 * - Detail panel showing step configuration on node click
 * - Save/discard bar for persisting pipeline changes
 * - Cmd+S keyboard shortcut for save
 * - All existing features: complexity filter, minimap, keyboard shortcuts
 *
 * Uses `layoutContextAtom = "editor"` (set by PipelineCanvas on mount)
 * to collapse the NavRail and maximize canvas space.
 */
export default function PipelinePage() {
  const [selectedNodeId, setSelectedNodeId] = useAtom(
    selectedPipelineNodeIdAtom,
  );
  const nodes = useAtomValue(pipelineNodesAtom);
  const setDetailPanelState = useSetAtom(detailPanelStateAtom);
  const { handleSave, handleDiscard } = usePipelineSave();

  // Keep LayoutShell's detail panel closed so it doesn't render a duplicate.
  // PipelineCanvas sets detailPanelStateAtom to "docked" on node click;
  // override that here so only the in-page absolute-positioned panel shows.
  useEffect(() => {
    setDetailPanelState("closed");
  }, [selectedNodeId, setDetailPanelState]);

  // Find the selected node data
  const selectedNode = selectedNodeId
    ? nodes.find((n) => n.id === selectedNodeId)
    : undefined;
  const selectedNodeData = selectedNode?.data as WorkflowNodeData | undefined;

  const detailTitle = selectedNodeData
    ? `Step: ${selectedNodeData.label}`
    : "Step Configuration";

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Main canvas area */}
      <div className="relative flex-1">
        <ErrorBoundary name="PipelineCanvas">
          <PipelineCanvas />
        </ErrorBoundary>

        {/* Docked detail panel (plain div, not atom-driven DetailPanel) */}
        {selectedNodeId && (
          <aside className="absolute right-0 top-0 z-20 flex h-full w-[480px] flex-col border-l bg-background shadow-xl">
            {/* Header */}
            <div className="flex h-12 shrink-0 items-center justify-between border-b px-4">
              <span className="text-sm font-medium text-foreground">
                {detailTitle}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground"
                onClick={() => setSelectedNodeId(null)}
                aria-label="Close detail panel"
              >
                <X className="size-4" />
              </Button>
            </div>
            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              <StepConfigPanel nodeId={selectedNodeId} />
            </div>
          </aside>
        )}
      </div>

      {/* Save/discard bar */}
      <SaveBar
        onSave={handleSave}
        onDiscard={handleDiscard}
        entityFilter="config"
      />
    </div>
  );
}
