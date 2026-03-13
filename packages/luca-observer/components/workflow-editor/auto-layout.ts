/**
 * Dagre-based auto-layout for the workflow graph.
 *
 * Arranges nodes in a top-to-bottom hierarchical layout using dagre,
 * which works well for the pipeline spine + branching agent pattern.
 *
 * @see https://github.com/dagrejs/dagre
 */
import dagre from "@dagrejs/dagre";
import type { Edge, Node } from "@xyflow/react";

import type { WorkflowNodeData } from "~/lib/workflow-types";

// -- Layout config ------------------------------------------------------------

/** Default node dimensions for layout computation. */
const NODE_WIDTH: Record<string, number> = {
  step: 200,
  agent: 180,
  skill: 160,
  gate: 100,
  default: 170,
};

const NODE_HEIGHT: Record<string, number> = {
  step: 80,
  agent: 50,
  skill: 50,
  gate: 60,
  default: 50,
};

// -- Public API ---------------------------------------------------------------

/**
 * Applies dagre auto-layout to a set of React Flow nodes and edges.
 *
 * Computes hierarchical positions for all nodes using a top-to-bottom
 * directed graph layout. Returns new node objects with updated positions
 * (original nodes are not mutated).
 *
 * @param nodes - React Flow nodes to layout
 * @param edges - React Flow edges defining the graph structure
 * @param direction - Layout direction: "TB" (top-bottom) or "LR" (left-right)
 * @returns New array of nodes with computed positions
 */
export function applyDagreLayout(
  nodes: Node<WorkflowNodeData>[],
  edges: Edge[],
  direction: "TB" | "LR" = "TB",
): Node<WorkflowNodeData>[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));

  g.setGraph({
    rankdir: direction,
    nodesep: 60,
    ranksep: 120,
    edgesep: 30,
    marginx: 40,
    marginy: 40,
  });

  // Add nodes with dimensions
  for (const node of nodes) {
    const nodeType = node.data?.node_type ?? "default";
    g.setNode(node.id, {
      width: NODE_WIDTH[nodeType] ?? NODE_WIDTH.default,
      height: NODE_HEIGHT[nodeType] ?? NODE_HEIGHT.default,
    });
  }

  // Add edges
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  // Compute layout
  dagre.layout(g);

  // Apply computed positions (centering nodes on dagre coordinates)
  return nodes.map((node) => {
    const nodeType = node.data?.node_type ?? "default";
    const dagreNode = g.node(node.id);
    if (!dagreNode) return node;

    const width = NODE_WIDTH[nodeType] ?? NODE_WIDTH.default;
    const height = NODE_HEIGHT[nodeType] ?? NODE_HEIGHT.default;

    return {
      ...node,
      position: {
        x: dagreNode.x - (width ?? 170) / 2,
        y: dagreNode.y - (height ?? 50) / 2,
      },
    };
  });
}
