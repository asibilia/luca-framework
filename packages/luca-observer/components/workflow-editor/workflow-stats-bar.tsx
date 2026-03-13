"use client";

import type { Node, Edge } from "@xyflow/react";

import type { WorkflowNodeData } from "~/lib/workflow-types";

// -- Types --------------------------------------------------------------------

interface WorkflowStatsBarProps {
  nodes: Node<WorkflowNodeData>[];
  edges: Edge[];
}

// -- Component ----------------------------------------------------------------

/**
 * Compact statistics legend for the workflow editor.
 *
 * Displays counts with colored dots for stages, agents, gates, and edges.
 * Rendered inside a React Flow `<Panel position="top-left">` by the canvas.
 */
export function WorkflowStatsBar({ nodes, edges }: WorkflowStatsBarProps) {
  const stages = nodes.filter(
    (n) => n.data?.node_type === "stage-group",
  ).length;
  const agents = nodes.filter((n) => n.data?.node_type === "agent").length;
  const skills = nodes.filter((n) => n.data?.node_type === "skill").length;
  const gates = nodes.filter((n) => n.data?.node_type === "gate").length;
  const edgeCount = edges.length;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border/40 bg-card/95 px-3 py-1.5 text-[11px] text-muted-foreground shadow-lg shadow-black/20 backdrop-blur-sm">
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-blue-400" />
        <strong className="text-foreground">{stages}</strong> stages
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-gray-400" />
        <strong className="text-foreground">{agents}</strong> agents
      </span>
      {skills > 0 && (
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-violet-400" />
          <strong className="text-foreground">{skills}</strong> skills
        </span>
      )}
      {gates > 0 && (
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-amber-400" />
          <strong className="text-foreground">{gates}</strong> gates
        </span>
      )}
      <span className="flex items-center gap-1.5">
        <strong className="text-foreground">{edgeCount}</strong> edges
      </span>
    </div>
  );
}
