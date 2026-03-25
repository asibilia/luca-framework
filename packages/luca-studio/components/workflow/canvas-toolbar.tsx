"use client";

import { useCallback } from "react";

import { useAtom } from "jotai";
import { useReactFlow } from "@xyflow/react";
import {
  Columns3,
  Maximize,
  Map,
  MapPinOff,
  Plus,
  Rows3,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import { Button } from "~/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import {
  pipelineMinimapVisibleAtom,
  pipelineLayoutDirectionAtom,
  pipelineNodesAtom,
  pipelineEdgesAtom,
} from "~/stores/pipeline-atoms";
import { markDirtyAtom } from "~/stores/dirty-tracking";
import { applyGroupedColumnLayout } from "~/components/workflow/auto-layout";

// -- Types --------------------------------------------------------------------

interface CanvasToolbarProps {
  /** Callback to open the add step menu. */
  onAddStep: () => void;
}

// -- Component ----------------------------------------------------------------

/**
 * Floating canvas toolbar for the pipeline editor.
 *
 * Rendered via React Flow's `<Panel position="top-right">` by the canvas.
 * Provides:
 * - Zoom In / Zoom Out
 * - Fit View
 * - Minimap toggle
 * - Add Step button
 * - Layout direction toggle (vertical/horizontal)
 *
 * @param onAddStep - Opens the step type selection menu.
 */
export function CanvasToolbar({ onAddStep }: CanvasToolbarProps) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const [minimapVisible, setMinimapVisible] = useAtom(
    pipelineMinimapVisibleAtom,
  );
  const [layoutDirection, setLayoutDirection] = useAtom(
    pipelineLayoutDirectionAtom,
  );
  const [, setNodes] = useAtom(pipelineNodesAtom);
  const [edges] = useAtom(pipelineEdgesAtom);
  const [, markDirty] = useAtom(markDirtyAtom);

  const handleZoomIn = useCallback(() => {
    void zoomIn({ duration: 200 });
  }, [zoomIn]);

  const handleZoomOut = useCallback(() => {
    void zoomOut({ duration: 200 });
  }, [zoomOut]);

  const handleFitView = useCallback(() => {
    void fitView({ duration: 300, padding: 0.15 });
  }, [fitView]);

  const handleToggleMinimap = useCallback(() => {
    setMinimapVisible((prev) => !prev);
  }, [setMinimapVisible]);

  const handleToggleLayout = useCallback(() => {
    const newDirection =
      layoutDirection === "vertical" ? "horizontal" : "vertical";
    setLayoutDirection(newDirection);

    // Re-layout nodes with the new direction
    setNodes((prev) => {
      const relaid = applyGroupedColumnLayout(prev, edges);
      return relaid;
    });
    markDirty("config");

    // Fit view after layout change
    setTimeout(() => {
      void fitView({ duration: 300, padding: 0.15 });
    }, 50);
  }, [
    layoutDirection,
    setLayoutDirection,
    setNodes,
    edges,
    markDirty,
    fitView,
  ]);

  return (
    <div className="flex items-center gap-1 rounded-lg border border-border/40 bg-card/95 px-1.5 py-1 shadow-lg shadow-black/20 backdrop-blur-sm">
      <ToolbarButton
        icon={<ZoomIn className="size-3.5" />}
        label="Zoom in"
        onClick={handleZoomIn}
      />
      <ToolbarButton
        icon={<ZoomOut className="size-3.5" />}
        label="Zoom out"
        onClick={handleZoomOut}
      />
      <ToolbarButton
        icon={<Maximize className="size-3.5" />}
        label="Fit view"
        onClick={handleFitView}
      />

      <div className="mx-0.5 h-5 w-px bg-border" />

      <ToolbarButton
        icon={
          minimapVisible ? (
            <Map className="size-3.5" />
          ) : (
            <MapPinOff className="size-3.5" />
          )
        }
        label={minimapVisible ? "Hide minimap" : "Show minimap"}
        onClick={handleToggleMinimap}
      />
      <ToolbarButton
        icon={
          layoutDirection === "vertical" ? (
            <Rows3 className="size-3.5" />
          ) : (
            <Columns3 className="size-3.5" />
          )
        }
        label={`Switch to ${layoutDirection === "vertical" ? "horizontal" : "vertical"} layout`}
        onClick={handleToggleLayout}
      />

      <div className="mx-0.5 h-5 w-px bg-border" />

      <ToolbarButton
        icon={<Plus className="size-3.5" />}
        label="Add step"
        onClick={onAddStep}
      />
    </div>
  );
}

// -- Internal toolbar button --------------------------------------------------

function ToolbarButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground hover:text-foreground"
          onClick={onClick}
          aria-label={label}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
