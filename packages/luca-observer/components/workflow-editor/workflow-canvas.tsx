"use client";

import "@xyflow/react/dist/style.css";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  useReactFlow,
  ReactFlowProvider,
  type NodeTypes,
  type Node,
  type NodeMouseHandler,
} from "@xyflow/react";

import { useWorkflowGraph } from "~/hooks/use-workflow-graph";
import {
  NODE_TYPE_COLORS,
  NODE_TYPE_COLOR_DEFAULT,
} from "~/lib/workflow-constants";
import { applyEdgeStyles } from "~/components/workflow-editor/edge-styles";
import { applyGroupedColumnLayout } from "~/components/workflow-editor/auto-layout";
import { WorkflowSidebar } from "~/components/workflow-editor/workflow-sidebar";
import { WorkflowStatsBar } from "~/components/workflow-editor/workflow-stats-bar";
import { ComplexityFilter } from "~/components/workflow-editor/complexity-filter";
import { StageGroupNode } from "~/components/workflow-editor/nodes/stage-group-node";
import { AgentNode } from "~/components/workflow-editor/nodes/agent-node";
import { GateNode } from "~/components/workflow-editor/nodes/gate-node";
import { SkillNode } from "~/components/workflow-editor/nodes/skill-node";
import type { WorkflowNodeData } from "~/lib/workflow-types";

// -- Custom node type registry (module-level to prevent re-renders) -----------

const nodeTypes: NodeTypes = {
  "stage-group": StageGroupNode,
  agent: AgentNode,
  skill: SkillNode,
  gate: GateNode,
};

// -- Minimap color helper -----------------------------------------------------

function minimapNodeColor(node: Node): string {
  const nodeType = (node.data as WorkflowNodeData)?.node_type;
  return (
    (nodeType ? NODE_TYPE_COLORS[nodeType]?.hex : undefined) ??
    NODE_TYPE_COLOR_DEFAULT.hex
  );
}

// -- Inner component (needs ReactFlowProvider) --------------------------------

function WorkflowCanvasInner() {
  const [complexityFilter, setComplexityFilter] = useState<
    string | undefined
  >();
  const { nodes, edges, loading, error, selectedComplexity } =
    useWorkflowGraph(complexityFilter);
  const { fitView } = useReactFlow();
  const [selectedNode, setSelectedNode] = useState<{
    id: string;
    data: WorkflowNodeData;
  } | null>(null);

  // Map node_type from data into React Flow's `type` field, then auto-layout.
  // Inject selectedComplexity into each node's data so agent nodes can
  // resolve their dynamic tier from routing presets.
  const layoutNodes = useMemo(() => {
    const typed = nodes.map((node) => ({
      ...node,
      type: node.data.node_type,
      data: {
        ...node.data,
        ...(selectedComplexity && { selected_complexity: selectedComplexity }),
      },
    }));
    return applyGroupedColumnLayout(typed, edges);
  }, [nodes, edges, selectedComplexity]);

  // Apply visual styling to edges based on edge_type
  const styledEdges = useMemo(() => applyEdgeStyles(edges), [edges]);

  // Node click handler -> open sidebar
  const onNodeClick: NodeMouseHandler = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      setSelectedNode({
        id: node.id,
        data: node.data as WorkflowNodeData,
      });
    },
    [],
  );

  // Close sidebar (used by pane click and sidebar close button)
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
      <ReactFlow
        nodes={layoutNodes}
        edges={styledEdges}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        onPaneClick={closeSidebar}
        colorMode="dark"
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.05}
        maxZoom={2}
        nodesDraggable
        nodeDragThreshold={5}
        nodesConnectable={false}
        elementsSelectable
        defaultEdgeOptions={{
          type: "smoothstep",
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="#374151"
        />
        <Controls
          showInteractive={false}
          className="!bg-card !border-border/30 !shadow-lg"
        />
        <MiniMap
          nodeStrokeWidth={3}
          nodeColor={minimapNodeColor}
          pannable
          zoomable
          className="!bg-card/90 !border-border/30"
          maskColor="rgba(0, 0, 0, 0.6)"
        />
        <Panel position="top-center">
          <ComplexityFilter
            value={complexityFilter}
            onChange={setComplexityFilter}
          />
        </Panel>
        <Panel position="top-left">
          <WorkflowStatsBar nodes={layoutNodes} edges={styledEdges} />
        </Panel>
      </ReactFlow>
      <WorkflowSidebar selectedNode={selectedNode} onClose={closeSidebar} />
    </div>
  );
}

// -- Exported component -------------------------------------------------------

/**
 * WorkflowCanvas renders the Luca autopilot pipeline as a React Flow v12 graph.
 *
 * Complete read-only visualization of the Luca workflow with:
 * - **Stage containers**: Pipeline stages as group nodes with children inside
 * - **Custom nodes**: Agent, Skill, Gate with header/body card design
 * - **Thin edges**: Data-flow, spawns, gates with muted styling
 * - **Complexity filter**: Toggle to show agents at specific complexity levels
 * - **Draggable nodes**: Reorganize within container bounds
 * - **Inspection**: Click a node to open details sidebar
 * - **Statistics bar**: Compact legend with colored dots in top-left
 * - **Minimap**: Pannable/zoomable overview with color-coded nodes
 * - **Keyboard**: Escape to deselect, Ctrl+0 to fit view
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
