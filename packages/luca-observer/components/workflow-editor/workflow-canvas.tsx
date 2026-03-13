"use client";

import "@xyflow/react/dist/style.css";

import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  type NodeTypes,
} from "@xyflow/react";

import { useWorkflowGraph } from "~/hooks/use-workflow-graph";
import { applyEdgeStyles } from "~/components/workflow-editor/edge-styles";
import { AgentNode } from "~/components/workflow-editor/nodes/agent-node";
import { GateNode } from "~/components/workflow-editor/nodes/gate-node";
import { SkillNode } from "~/components/workflow-editor/nodes/skill-node";
import { StepNode } from "~/components/workflow-editor/nodes/step-node";

// -- Custom node type registry (module-level to prevent re-renders) -----------

const nodeTypes: NodeTypes = {
  step: StepNode,
  agent: AgentNode,
  skill: SkillNode,
  gate: GateNode,
};

// -- Component ----------------------------------------------------------------

/**
 * WorkflowCanvas renders the Luca autopilot pipeline as a React Flow v12 graph
 * with custom node types for steps, agents, skills, and gates.
 *
 * Fetches topology data from `/api/workflow/topology` via the useWorkflowGraph
 * hook, displaying the pipeline spine (classify → discuss → plan → execute →
 * verify → learn) with agent/skill nodes branching off each stage.
 *
 * Custom node types provide visually distinct rendering:
 * - **Step nodes**: Primary-colored pipeline stages
 * - **Agent nodes**: Model tier badges with tier-colored borders
 * - **Skill nodes**: Accent-colored with trigger indicator
 * - **Gate nodes**: Diamond-shaped complexity gates
 *
 * Edge styles vary by relationship type (data-flow, invokes, spawns, gates).
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

  // Map node_type from data into React Flow's `type` field for custom rendering
  const typedNodes = useMemo(
    () =>
      nodes.map((node) => ({
        ...node,
        type: node.data.node_type,
      })),
    [nodes],
  );

  // Apply visual styling to edges based on edge_type
  const styledEdges = useMemo(() => applyEdgeStyles(edges), [edges]);

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
    <ReactFlow
      nodes={typedNodes}
      edges={styledEdges}
      nodeTypes={nodeTypes}
      colorMode="dark"
      fitView
    >
      <Background variant={BackgroundVariant.Dots} />
      <Controls />
    </ReactFlow>
  );
}
