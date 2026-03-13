"use client";

import "@xyflow/react/dist/style.css";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useReactFlow,
  ReactFlowProvider,
  type NodeTypes,
  type Node,
  type NodeMouseHandler,
} from "@xyflow/react";

import { useWorkflowGraph } from "~/hooks/use-workflow-graph";
import { applyEdgeStyles } from "~/components/workflow-editor/edge-styles";
import { applyDagreLayout } from "~/components/workflow-editor/auto-layout";
import { WorkflowSidebar } from "~/components/workflow-editor/workflow-sidebar";
import { WorkflowStatsBar } from "~/components/workflow-editor/workflow-stats-bar";
import { ComplexityFilter } from "~/components/workflow-editor/complexity-filter";
import { AgentNode } from "~/components/workflow-editor/nodes/agent-node";
import { GateNode } from "~/components/workflow-editor/nodes/gate-node";
import { SkillNode } from "~/components/workflow-editor/nodes/skill-node";
import { StepNode } from "~/components/workflow-editor/nodes/step-node";
import type { WorkflowNodeData } from "~/lib/workflow-types";

// -- Custom node type registry (module-level to prevent re-renders) -----------

const nodeTypes: NodeTypes = {
  step: StepNode,
  agent: AgentNode,
  skill: SkillNode,
  gate: GateNode,
};

// -- Inner component (needs ReactFlowProvider) --------------------------------

function WorkflowCanvasInner() {
  const [complexityFilter, setComplexityFilter] = useState<
    string | undefined
  >();
  const { nodes, edges, loading, error } = useWorkflowGraph(complexityFilter);
  const { fitView } = useReactFlow();
  const [selectedNode, setSelectedNode] = useState<{
    id: string;
    data: WorkflowNodeData;
  } | null>(null);

  // Map node_type from data into React Flow's `type` field, then auto-layout
  const layoutNodes = useMemo(() => {
    const typed = nodes.map((node) => ({
      ...node,
      type: node.data.node_type,
    }));
    return applyDagreLayout(typed, edges);
  }, [nodes, edges]);

  // Apply visual styling to edges based on edge_type
  const styledEdges = useMemo(() => applyEdgeStyles(edges), [edges]);

  // Node click handler → open sidebar
  const onNodeClick: NodeMouseHandler = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      setSelectedNode({
        id: node.id,
        data: node.data as WorkflowNodeData,
      });
    },
    [],
  );

  // Pane click handler → close sidebar
  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  // Close sidebar
  const closeSidebar = useCallback(() => {
    setSelectedNode(null);
  }, []);

  // Keyboard navigation: Escape to deselect, Ctrl+0 to fit view
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedNode(null);
      }
      if (e.key === "0" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        void fitView({ duration: 300 });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [fitView]);

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

  if (nodes.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <p className="font-mono text-xs text-muted-foreground">
          No workflow topology data available
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <ComplexityFilter
        value={complexityFilter}
        onChange={setComplexityFilter}
      />
      <ReactFlow
        nodes={layoutNodes}
        edges={styledEdges}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        colorMode="dark"
        fitView
        minZoom={0.1}
        maxZoom={2}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
      >
        <Background variant={BackgroundVariant.Dots} />
        <Controls />
        <MiniMap
          nodeStrokeWidth={3}
          pannable
          zoomable
          className="!bg-card/80"
        />
      </ReactFlow>
      <WorkflowStatsBar nodes={layoutNodes} edges={styledEdges} />
      <WorkflowSidebar selectedNode={selectedNode} onClose={closeSidebar} />
    </div>
  );
}

// -- Exported component -------------------------------------------------------

/**
 * WorkflowCanvas renders the Luca autopilot pipeline as a React Flow v12 graph.
 *
 * Complete read-only visualization of the Luca workflow with:
 * - **Auto-layout**: Dagre hierarchical layout (top-to-bottom)
 * - **Custom nodes**: Step, Agent, Skill, Gate with distinct styling
 * - **Edge styles**: Data-flow, invokes, spawns, gates with color/dash/animation
 * - **Complexity filter**: Toggle to show agents at specific complexity levels
 * - **Inspection**: Click a node to open details sidebar
 * - **Statistics bar**: Agent/skill/edge counts
 * - **Minimap**: Pannable/zoomable overview in corner
 * - **Keyboard**: Escape to deselect, Ctrl+0 to fit view
 * - **Read-only**: Nodes not draggable or connectable
 *
 * @example
 * ```tsx
 * <div className="h-[calc(100vh-12rem)]">
 *   <WorkflowCanvas />
 * </div>
 * ```
 */
export function WorkflowCanvas() {
  return (
    <ReactFlowProvider>
      <WorkflowCanvasInner />
    </ReactFlowProvider>
  );
}
