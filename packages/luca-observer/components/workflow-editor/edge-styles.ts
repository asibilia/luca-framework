/**
 * Edge style configuration for the workflow editor.
 *
 * Maps WorkflowEdgeType to React Flow edge visual properties.
 * Uses concrete hex colors (not CSS custom properties) for reliable
 * rendering in SVG context across light and dark themes.
 *
 * "invokes" edges have been removed — containment via group nodes
 * replaces stage→agent connections.
 */
import { MarkerType, type Edge } from "@xyflow/react";

import type { WorkflowEdgeData, WorkflowEdgeType } from "~/lib/workflow-types";

// -- Edge type visual config --------------------------------------------------

interface EdgeStyleConfig {
  stroke: string;
  strokeWidth: number;
  strokeDasharray?: string;
  animated: boolean;
  markerEnd: {
    type: MarkerType;
    color: string;
    width: number;
    height: number;
  };
  edgeType: string;
}

/**
 * Visual style presets for each edge type.
 *
 * - **data-flow**: Thin muted lines connecting stage containers
 * - **spawns**: Dashed cyan lines for agent-to-agent spawning
 * - **gates**: Dashed amber lines for complexity gate connections
 */
const EDGE_STYLES: Partial<Record<WorkflowEdgeType, EdgeStyleConfig>> = {
  "data-flow": {
    stroke: "#6b7280",
    strokeWidth: 2,
    animated: false,
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: "#6b7280",
      width: 16,
      height: 16,
    },
    edgeType: "smoothstep",
  },
  spawns: {
    stroke: "#22d3ee",
    strokeWidth: 1,
    strokeDasharray: "6 4",
    animated: true,
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: "#22d3ee",
      width: 14,
      height: 14,
    },
    edgeType: "smoothstep",
  },
  gates: {
    stroke: "#fbbf24",
    strokeWidth: 1,
    strokeDasharray: "4 4",
    animated: false,
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: "#fbbf24",
      width: 14,
      height: 14,
    },
    edgeType: "smoothstep",
  },
};

/** Fallback style for unknown edge types. */
const DEFAULT_STYLE: EdgeStyleConfig = {
  stroke: "#4b5563",
  strokeWidth: 1,
  animated: false,
  markerEnd: {
    type: MarkerType.ArrowClosed,
    color: "#4b5563",
    width: 12,
    height: 12,
  },
  edgeType: "smoothstep",
};

// -- Public API ---------------------------------------------------------------

/**
 * Applies visual styling to edges based on their edge_type data.
 *
 * Transforms raw API edges into styled React Flow edges with appropriate
 * stroke colors, dash patterns, animation, and arrow markers. Uses concrete
 * hex colors for reliable SVG rendering.
 *
 * @param edges - Raw edges from the topology API
 * @returns Styled edges ready for React Flow
 */
export function applyEdgeStyles(
  edges: Edge<WorkflowEdgeData>[],
): Edge<WorkflowEdgeData>[] {
  return edges.map((edge) => {
    const edgeType = edge.data?.edge_type ?? "data-flow";
    const config = EDGE_STYLES[edgeType] ?? DEFAULT_STYLE;

    return {
      ...edge,
      type: config.edgeType,
      style: {
        stroke: config.stroke,
        strokeWidth: config.strokeWidth,
        strokeDasharray: config.strokeDasharray,
      },
      animated: config.animated,
      markerEnd: config.markerEnd,
      label: edge.data?.label || undefined,
      labelStyle: {
        fill: "#d1d5db",
        fontSize: 11,
        fontWeight: 500,
      },
      labelBgStyle: {
        fill: "#1f2937",
        fillOpacity: 0.8,
      },
      labelBgPadding: [6, 4] as [number, number],
      labelBgBorderRadius: 4,
    };
  });
}
