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
 * Statistics bar for the workflow editor.
 *
 * Displays counts of agents, skills, stages, gates, and edges in a
 * compact horizontal bar at the bottom of the canvas.
 */
export function WorkflowStatsBar({ nodes, edges }: WorkflowStatsBarProps) {
  const agents = nodes.filter((n) => n.data?.node_type === "agent").length;
  const steps = nodes.filter((n) => n.data?.node_type === "step").length;
  const skills = nodes.filter((n) => n.data?.node_type === "skill").length;
  const gates = nodes.filter((n) => n.data?.node_type === "gate").length;
  const edgeCount = edges.length;

  return (
    <div className="absolute bottom-0 left-0 z-10 flex items-center gap-4 border-t border-border/20 bg-card/80 px-4 py-1.5 text-[10px] text-muted-foreground backdrop-blur-sm">
      <span>
        <strong className="text-foreground">{steps}</strong> stages
      </span>
      <span>
        <strong className="text-foreground">{agents}</strong> agents
      </span>
      {skills > 0 && (
        <span>
          <strong className="text-foreground">{skills}</strong> skills
        </span>
      )}
      {gates > 0 && (
        <span>
          <strong className="text-foreground">{gates}</strong> gates
        </span>
      )}
      <span>
        <strong className="text-foreground">{edgeCount}</strong> edges
      </span>
      <span>
        <strong className="text-foreground">{nodes.length}</strong> total nodes
      </span>
    </div>
  );
}
