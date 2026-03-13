/**
 * Edge style configuration for the workflow editor.
 *
 * Maps WorkflowEdgeType to React Flow edge visual properties
 * (stroke color, dasharray, animation, marker).
 */
import { MarkerType, type Edge } from "@xyflow/react";

import type { WorkflowEdgeData } from "~/lib/workflow-types";

// -- Edge type visual config --------------------------------------------------

interface EdgeStyleConfig {
  stroke: string;
  strokeWidth: number;
  strokeDasharray?: string;
  animated: boolean;
  markerEnd: { type: MarkerType; color: string };
}

const EDGE_STYLES: Record<string, EdgeStyleConfig> = {
  "data-flow": {
    stroke: "hsl(var(--primary))",
    strokeWidth: 2,
    animated: false,
    markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(var(--primary))" },
  },
  invokes: {
    stroke: "hsl(var(--muted-foreground))",
    strokeWidth: 1,
    animated: false,
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: "hsl(var(--muted-foreground))",
    },
  },
  spawns: {
    stroke: "hsl(var(--info))",
    strokeWidth: 1,
    strokeDasharray: "5 3",
    animated: true,
    markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(var(--info))" },
  },
  gates: {
    stroke: "hsl(var(--warning))",
    strokeWidth: 1,
    strokeDasharray: "3 3",
    animated: false,
    markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(var(--warning))" },
  },
};

// -- Public API ---------------------------------------------------------------

/**
 * Applies visual styling to edges based on their edge_type data.
 *
 * Transforms raw API edges into styled React Flow edges with appropriate
 * stroke colors, dash patterns, animation, and arrow markers.
 *
 * @param edges - Raw edges from the topology API
 * @returns Styled edges ready for React Flow
 */
export function applyEdgeStyles(
  edges: Edge<WorkflowEdgeData>[],
): Edge<WorkflowEdgeData>[] {
  return edges.map((edge) => {
    const edgeType = edge.data?.edge_type ?? "invokes";
    const config = EDGE_STYLES[edgeType] ?? EDGE_STYLES["invokes"];
    if (!config) return edge;

    return {
      ...edge,
      type: "smoothstep",
      style: {
        stroke: config.stroke,
        strokeWidth: config.strokeWidth,
        strokeDasharray: config.strokeDasharray,
      },
      animated: config.animated,
      markerEnd: config.markerEnd,
      label: edge.data?.label || undefined,
      labelStyle: { fill: "hsl(var(--muted-foreground))", fontSize: 10 },
    };
  });
}
