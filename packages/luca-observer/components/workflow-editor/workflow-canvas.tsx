"use client";

import "@xyflow/react/dist/style.css";

import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
} from "@xyflow/react";

import { useWorkflowGraph } from "~/hooks/use-workflow-graph";

// -- Component ----------------------------------------------------------------

/**
 * WorkflowCanvas renders the Luca autopilot pipeline as a React Flow v12 graph.
 *
 * Fetches topology data from `/api/workflow/topology` via the useWorkflowGraph
 * hook, displaying the pipeline spine (classify → discuss → plan → execute →
 * verify → learn) with agent/skill nodes branching off each stage.
 *
 * - Uses colorMode="dark" to match Observer's dark theme.
 * - Uses fitView to auto-zoom to fit all nodes on mount.
 * - Requires a container with explicit height (parent sets h-[calc(100vh-12rem)]).
 * - CSS is imported at the top of this module to prevent invisible nodes.
 *
 * @example
 * ```tsx
 * <div className="h-[calc(100vh-12rem)]">
 *   <WorkflowCanvas />
 * </div>
 * ```
 */
export function WorkflowCanvas() {
  const { nodes, edges, loading, error } = useWorkflowGraph();

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <p className="font-mono text-xs text-muted-foreground">
          Loading workflow topology...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <p className="font-mono text-xs text-destructive">
          Failed to load topology: {error}
        </p>
      </div>
    );
  }

  return (
    <ReactFlow nodes={nodes} edges={edges} colorMode="dark" fitView>
      <Background variant={BackgroundVariant.Dots} />
      <Controls />
    </ReactFlow>
  );
}
