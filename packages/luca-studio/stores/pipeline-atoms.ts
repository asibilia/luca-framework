import { atom } from "jotai";

import type { Edge, Node } from "@xyflow/react";

import type { WorkflowEdgeData, WorkflowNodeData } from "~/lib/workflow-types";

// ---------------------------------------------------------------------------
// Pipeline Canvas State Atoms
//
// Controlled React Flow v12 state for the interactive pipeline editor.
// These atoms hold the current node/edge arrays and enable drag persistence,
// insert/delete, and connection operations. They are the writable source of
// truth for the pipeline canvas -- topology API data seeds them on init.
// ---------------------------------------------------------------------------

/**
 * Controlled React Flow nodes for the pipeline editor.
 *
 * Initialized from the topology API via `useWorkflowGraph`, then mutated
 * by drag handlers, insert/delete operations, and save/discard cycles.
 * Starts empty -- populated after the first successful fetch.
 */
export const pipelineNodesAtom = atom<Node<WorkflowNodeData>[]>([]);

/**
 * Controlled React Flow edges for the pipeline editor.
 *
 * Initialized alongside `pipelineNodesAtom` from the topology API.
 * Mutated by connection/reconnection handlers and structural operations.
 */
export const pipelineEdgesAtom = atom<Edge<WorkflowEdgeData>[]>([]);

/**
 * ID of the currently selected node in the pipeline editor.
 *
 * Set on node click, cleared on pane click or Escape. The step config
 * panel reads this atom to determine which node's configuration to show.
 */
export const selectedPipelineNodeIdAtom = atom<string | null>(null);

/**
 * Whether the minimap is visible in the pipeline editor.
 *
 * Toggled via the canvas toolbar's minimap button.
 */
export const pipelineMinimapVisibleAtom = atom<boolean>(true);

/**
 * Layout direction for the pipeline DAG.
 *
 * - "vertical": top-to-bottom (default, matches existing auto-layout)
 * - "horizontal": left-to-right
 *
 * Toggled via the canvas toolbar's layout toggle button.
 */
export const pipelineLayoutDirectionAtom = atom<"vertical" | "horizontal">(
  "vertical",
);
