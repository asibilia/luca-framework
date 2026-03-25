/**
 * Grouped column layout for the workflow graph.
 *
 * Stage-group container nodes are stacked vertically in a centered column.
 * Child nodes (agents/skills/gates) use relative positions set by the
 * topology data via parentId — they are NOT repositioned by this layout.
 *
 * Group nodes must appear BEFORE their children in the output array
 * (React Flow requirement for parentId resolution).
 *
 * @see workflow-topology.ts for the curated node/edge data
 */
import filter from "lodash/filter";
import type { Edge, Node } from "@xyflow/react";

import type { WorkflowNodeData } from "~/lib/workflow-types";

// -- Layout constants ---------------------------------------------------------

/** Vertical gap between stacked stage containers. */
const GROUP_Y_GAP = 40;

/** Starting Y offset for the first stage container. */
const GROUP_Y_START = 40;

/** X position to center the column of stage containers. */
const GROUP_X = 200;

// -- Node dimensions (used by React Flow for edge routing) --------------------

/** Pixel width per node type, used by React Flow for edge routing. */
export const NODE_WIDTH: Record<string, number> = {
  "stage-group": 576,
  agent: 250,
  skill: 240,
  gate: 250,
  default: 200,
};

/** Pixel height per node type, used by React Flow for edge routing. */
export const NODE_HEIGHT: Record<string, number> = {
  "stage-group": 300,
  agent: 80,
  skill: 70,
  gate: 80,
  default: 60,
};

// -- Public API ---------------------------------------------------------------

/**
 * Applies a grouped column layout to workflow nodes.
 *
 * Stage-group nodes are stacked vertically. Child nodes (those with a
 * parentId) keep their relative positions set by topology data — they
 * are not repositioned.
 *
 * @param nodes - React Flow nodes with `data.node_type` set
 * @param _edges - Edges (reserved for future use)
 * @returns New array of nodes with computed positions, groups before children
 */
export function applyGroupedColumnLayout(
  nodes: Node<WorkflowNodeData>[],
  _edges: Edge[],
): Node<WorkflowNodeData>[] {
  // Separate group nodes from child nodes
  const groupNodes = filter(nodes, (n) => n.data?.node_type === "stage-group");
  const childNodes = filter(nodes, (n) => n.data?.node_type !== "stage-group");

  // Position groups in a vertical stack (centered X, stacked Y)
  let currentY = GROUP_Y_START;
  const positionedGroups = groupNodes.map((node) => {
    const height =
      (node.style?.height as number) ?? NODE_HEIGHT["stage-group"] ?? 300;
    const pos = { x: GROUP_X, y: currentY };
    currentY += height + GROUP_Y_GAP;
    return { ...node, position: pos };
  });

  // Children keep their relative positions (set by topology via parentId).
  // We don't reposition them — React Flow places them relative to parent.
  // But we DO need to ensure they come AFTER their parent in the array.
  return [...positionedGroups, ...childNodes];
}
