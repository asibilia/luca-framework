"use client";

import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
} from "@xyflow/react";
import type { EdgeProps } from "@xyflow/react";

import { cn } from "~/lib/utils";

// -- Types --------------------------------------------------------------------

/** Data shape for workflow edges passed via React Flow's `data` prop. */
export interface WorkflowEdgeData {
  /** Whether to show the flow direction animation. Defaults to true. */
  animated?: boolean;
  /** Optional label displayed at the edge midpoint (e.g., "on success"). */
  label?: string;
  [key: string]: unknown;
}

// -- Styles -------------------------------------------------------------------

/**
 * CSS keyframe animation for edge flow direction.
 *
 * Injected once into the DOM via a <style> tag inside the component.
 * Animates strokeDashoffset to create a flowing dash pattern along the path.
 */
const EDGE_ANIMATION_STYLE = `
@keyframes workflow-edge-flow {
  from { stroke-dashoffset: 24; }
  to { stroke-dashoffset: 0; }
}
`;

// -- Component ----------------------------------------------------------------

/**
 * Custom React Flow edge for pipeline workflow connections.
 *
 * Renders a smooth step path between source and target nodes with:
 * - Animated dash flow indicating data direction
 * - Arrowhead marker at the target end
 * - Optional label badge at the edge midpoint
 * - Hover/selected state styling
 *
 * Uses React Flow's `getSmoothStepPath` for path calculation and
 * `BaseEdge` for the underlying SVG path rendering.
 *
 * @example
 * ```tsx
 * const edgeTypes = { workflowEdge: WorkflowEdge };
 * // In React Flow: <ReactFlow edgeTypes={edgeTypes} edges={edges} />
 * ```
 */
export function WorkflowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  data,
  style,
}: EdgeProps) {
  const edgeData = (data ?? {}) as WorkflowEdgeData;
  const isAnimated = edgeData.animated !== false;

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 8,
  });

  const markerId = `workflow-arrow-${id}`;

  return (
    <>
      {/* Inject animation keyframes */}
      <style>{EDGE_ANIMATION_STYLE}</style>

      {/* Arrowhead marker definition */}
      <defs>
        <marker
          id={markerId}
          markerWidth="8"
          markerHeight="8"
          refX="7"
          refY="4"
          orient="auto-start-reverse"
          markerUnits="strokeWidth"
        >
          <path
            d="M 0 0 L 8 4 L 0 8 Z"
            className={cn(
              selected
                ? "fill-primary"
                : "fill-muted-foreground/60",
            )}
          />
        </marker>
      </defs>

      {/* Base edge path */}
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          ...style,
          strokeWidth: selected ? 2.5 : 2,
          markerEnd: `url(#${markerId})`,
        }}
        className={cn(
          "transition-[stroke,stroke-width] duration-150",
          selected ? "!stroke-primary" : "!stroke-muted-foreground/60",
        )}
      />

      {/* Animated overlay path for flow direction */}
      {isAnimated && (
        <path
          d={edgePath}
          fill="none"
          strokeWidth={selected ? 2.5 : 2}
          strokeDasharray="6 6"
          className={cn(
            selected ? "stroke-primary/40" : "stroke-muted-foreground/30",
          )}
          style={{
            animation: "workflow-edge-flow 0.6s linear infinite",
          }}
        />
      )}

      {/* Optional edge label */}
      {edgeData.label && (
        <EdgeLabelRenderer>
          <div
            className={cn(
              "absolute pointer-events-all nodrag nopan",
              "rounded-md border bg-muted/90 px-2 py-0.5",
              "text-[10px] font-medium text-muted-foreground",
              "shadow-sm",
            )}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {edgeData.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
