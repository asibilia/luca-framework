"use client";

import "@xyflow/react/dist/style.css";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ReactFlowProvider,
  addEdge,
  reconnectEdge,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeMouseHandler,
  type NodeTypes,
  type EdgeTypes,
  applyNodeChanges,
  applyEdgeChanges,
} from "@xyflow/react";
import { useAtom, useSetAtom } from "jotai";

import { useWorkflowGraph } from "~/hooks/use-workflow-graph";
import {
  NODE_TYPE_COLORS,
  NODE_TYPE_COLOR_DEFAULT,
} from "~/lib/workflow-constants";
import { applyEdgeStyles } from "~/components/workflow/edge-styles";
import { applyGroupedColumnLayout } from "~/components/workflow/auto-layout";
import { ComplexityFilter } from "~/components/workflow/complexity-filter";
import { WorkflowStatsBar } from "~/components/workflow/workflow-stats-bar";
import { StageGroupNode } from "~/components/workflow/nodes/stage-group-node";
import { AgentNode } from "~/components/workflow/nodes/agent-node";
import { GateNode } from "~/components/workflow/nodes/gate-node";
import { SkillNode } from "~/components/workflow/nodes/skill-node";
import { WorkflowNode } from "~/components/workflow/workflow-node";
import { WorkflowEdge } from "~/components/workflow/workflow-edge";
import { CanvasToolbar } from "~/components/workflow/canvas-toolbar";
import { AddStepMenu } from "~/components/workflow/add-step-menu";
import { hasCycle } from "~/lib/dag-validation";
import {
  pipelineNodesAtom,
  pipelineEdgesAtom,
  selectedPipelineNodeIdAtom,
  pipelineMinimapVisibleAtom,
} from "~/stores/pipeline-atoms";
import { detailPanelStateAtom, layoutContextAtom } from "~/stores/layout";
import { markDirtyAtom } from "~/stores/dirty-tracking";
import type { WorkflowNodeData, WorkflowEdgeData } from "~/lib/workflow-types";

// -- Custom node/edge type registries (module-level to prevent re-renders) ----

const nodeTypes: NodeTypes = {
  "stage-group": StageGroupNode,
  agent: AgentNode,
  skill: SkillNode,
  gate: GateNode,
  workflowStep: WorkflowNode,
};

const edgeTypes: EdgeTypes = {
  workflowEdge: WorkflowEdge,
};

// -- Minimap color helper -----------------------------------------------------

/**
 * Resolve a minimap node color from the node's `node_type` data field.
 *
 * Maps the node type to the hex color defined in `NODE_TYPE_COLORS`.
 * Falls back to `NODE_TYPE_COLOR_DEFAULT.hex` when the type is missing
 * or unmapped.
 *
 * @param node - React Flow node with `WorkflowNodeData` in `data`
 * @returns Hex color string for the minimap node
 */
function minimapNodeColor(node: Node): string {
  const nodeType = (node.data as WorkflowNodeData)?.node_type;
  return (
    (nodeType ? NODE_TYPE_COLORS[nodeType]?.hex : undefined) ??
    NODE_TYPE_COLOR_DEFAULT.hex
  );
}

// -- Inner component (needs ReactFlowProvider) --------------------------------

/**
 * Internal pipeline canvas with controlled React Flow v12 state.
 *
 * Manages nodes and edges via Jotai atoms, supporting drag persistence,
 * node insertion/deletion, edge connection/reconnection with DAG cycle
 * validation, and all existing features (zoom, fit, minimap, complexity
 * filter, keyboard shortcuts).
 */
function PipelineCanvasInner() {
  const [complexityFilter, setComplexityFilter] = useState<
    string | undefined
  >();
  const {
    nodes: apiNodes,
    edges: apiEdges,
    loading,
    error,
    selectedComplexity,
  } = useWorkflowGraph(complexityFilter);
  const { fitView, screenToFlowPosition } = useReactFlow();

  // Jotai controlled state
  const [nodes, setNodes] = useAtom(pipelineNodesAtom);
  const [edges, setEdges] = useAtom(pipelineEdgesAtom);
  const [selectedNodeId, setSelectedNodeId] = useAtom(
    selectedPipelineNodeIdAtom,
  );
  const [minimapVisible] = useAtom(pipelineMinimapVisibleAtom);
  const setDetailPanelState = useSetAtom(detailPanelStateAtom);
  const setLayoutContext = useSetAtom(layoutContextAtom);
  const [, markDirty] = useAtom(markDirtyAtom);

  // Track whether we've done initial seeding
  const initializedRef = useRef(false);

  // Ref for add-step menu
  const [addStepMenuOpen, setAddStepMenuOpen] = useState(false);

  // Set layout context to "editor" on mount
  useEffect(() => {
    setLayoutContext("editor");
    return () => {
      setLayoutContext("dashboard");
    };
  }, [setLayoutContext]);

  // Seed atoms from topology API data (only on initial load)
  useEffect(() => {
    if (apiNodes.length === 0 || initializedRef.current) return;
    initializedRef.current = true;

    // Map node_type into React Flow's `type` field and inject complexity
    const typed = apiNodes.map((node) => ({
      ...node,
      type: node.data.node_type,
      data: {
        ...node.data,
        ...(selectedComplexity && { selected_complexity: selectedComplexity }),
      },
    }));

    const layoutNodes = applyGroupedColumnLayout(typed, apiEdges);
    const styledEdges = applyEdgeStyles(apiEdges);

    setNodes(layoutNodes);
    setEdges(styledEdges);
  }, [apiNodes, apiEdges, selectedComplexity, setNodes, setEdges]);

  // When complexity filter changes and we already have nodes, update the
  // selected_complexity in each node's data
  useEffect(() => {
    if (!initializedRef.current || !selectedComplexity) return;
    setNodes((prev) =>
      prev.map((node) => ({
        ...node,
        data: { ...node.data, selected_complexity: selectedComplexity },
      })),
    );
  }, [selectedComplexity, setNodes]);

  // -- Controlled state handlers -----------------------------------------------

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes(
        (nds) => applyNodeChanges(changes, nds) as Node<WorkflowNodeData>[],
      );
    },
    [setNodes],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdges(
        (eds) => applyEdgeChanges(changes, eds) as Edge<WorkflowEdgeData>[],
      );
    },
    [setEdges],
  );

  // Drag persistence: mark dirty when a node is dragged to a new position
  const onNodeDragStop = useCallback(
    (_event: React.MouseEvent, _node: Node) => {
      markDirty("config");
    },
    [markDirty],
  );

  // Node click: open detail panel for step configuration
  const onNodeClick: NodeMouseHandler = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      setSelectedNodeId(node.id);
      setDetailPanelState("docked");
    },
    [setSelectedNodeId, setDetailPanelState],
  );

  // Pane click: close detail panel
  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setDetailPanelState("closed");
  }, [setSelectedNodeId, setDetailPanelState]);

  // Edge connection with DAG cycle validation
  const onConnect = useCallback(
    (connection: Connection) => {
      // Build candidate edge list for cycle check
      const candidateEdges = [
        ...edges,
        {
          id: `edge-${connection.source}-${connection.target}`,
          source: connection.source ?? "",
          target: connection.target ?? "",
        },
      ];

      if (
        connection.source &&
        connection.target &&
        hasCycle(
          nodes.map((n) => n.id),
          candidateEdges.map((e) => ({ source: e.source, target: e.target })),
        )
      ) {
        // Reject: would create cycle
        return;
      }

      setEdges((eds) => addEdge(connection, eds) as Edge<WorkflowEdgeData>[]);
      markDirty("config");
    },
    [edges, nodes, setEdges, markDirty],
  );

  // Edge reconnection
  const edgeReconnectSuccessful = useRef(true);

  const onReconnectStart = useCallback(() => {
    edgeReconnectSuccessful.current = false;
  }, []);

  const onReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      edgeReconnectSuccessful.current = true;
      setEdges(
        (els) =>
          reconnectEdge(
            oldEdge,
            newConnection,
            els,
          ) as Edge<WorkflowEdgeData>[],
      );
      markDirty("config");
    },
    [setEdges, markDirty],
  );

  const onReconnectEnd = useCallback(
    (_event: MouseEvent | TouchEvent, edge: Edge) => {
      if (!edgeReconnectSuccessful.current) {
        setEdges((eds) => eds.filter((e) => e.id !== edge.id));
        markDirty("config");
      }
    },
    [setEdges, markDirty],
  );

  // Add step handler
  const handleAddStep = useCallback(
    (stepType: string) => {
      const position = screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      });

      const newId = `step-${Date.now()}`;
      const newNode: Node<WorkflowNodeData> = {
        id: newId,
        position,
        type: stepType === "gate" ? "gate" : "agent",
        data: {
          node_type: stepType === "gate" ? "gate" : "agent",
          label: `New ${stepType} step`,
          description: "",
          purpose: "",
          color: "",
        },
      };

      setNodes((nds) => [...nds, newNode]);
      markDirty("config");
      setAddStepMenuOpen(false);
    },
    [screenToFlowPosition, setNodes, markDirty],
  );

  // Delete node handler
  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      // Remove edges connected to this node
      setEdges((eds) =>
        eds.filter((e) => e.source !== nodeId && e.target !== nodeId),
      );
      if (selectedNodeId === nodeId) {
        setSelectedNodeId(null);
        setDetailPanelState("closed");
      }
      markDirty("config");
    },
    [
      setNodes,
      setEdges,
      selectedNodeId,
      setSelectedNodeId,
      setDetailPanelState,
      markDirty,
    ],
  );

  // Inject overflow action handler into node data for delete support
  const nodesWithHandlers = useMemo(
    () =>
      nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          onOverflowAction: (action: string) => {
            if (action === "delete") {
              handleDeleteNode(node.id);
            }
          },
        },
      })),
    [nodes, handleDeleteNode],
  );

  // Keyboard navigation: Escape to deselect, Ctrl+0 to fit view
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedNodeId(null);
        setDetailPanelState("closed");
      }
      if (e.key === "0" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        void fitView({ duration: 300 });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [fitView, setSelectedNodeId, setDetailPanelState]);

  if (loading && nodes.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <p className="font-mono text-xs text-muted-foreground">
          Loading workflow topology...
        </p>
      </div>
    );
  }

  if (error && nodes.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <p className="font-mono text-xs text-destructive">
          Failed to load topology: {error}
        </p>
      </div>
    );
  }

  if (apiNodes.length === 0 && nodes.length === 0) {
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
        nodes={nodesWithHandlers}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onConnect={onConnect}
        onReconnect={onReconnect}
        onReconnectStart={onReconnectStart}
        onReconnectEnd={onReconnectEnd}
        colorMode="dark"
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.05}
        maxZoom={2}
        nodesDraggable
        nodeDragThreshold={5}
        nodesConnectable
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
        {minimapVisible && (
          <MiniMap
            nodeStrokeWidth={3}
            nodeColor={minimapNodeColor}
            pannable
            zoomable
            className="!bg-card/90 !border-border/30"
            maskColor="rgba(0, 0, 0, 0.6)"
          />
        )}
        <Panel position="top-center">
          <div className="flex items-center gap-2">
            <ComplexityFilter
              value={complexityFilter}
              onChange={setComplexityFilter}
            />
          </div>
        </Panel>
        <Panel position="top-left">
          <WorkflowStatsBar nodes={nodesWithHandlers} edges={edges} />
        </Panel>
        <Panel position="top-right">
          <CanvasToolbar onAddStep={() => setAddStepMenuOpen(true)} />
        </Panel>
      </ReactFlow>

      {/* Add step dropdown menu */}
      {addStepMenuOpen && (
        <AddStepMenu
          onSelect={handleAddStep}
          onClose={() => setAddStepMenuOpen(false)}
        />
      )}
    </div>
  );
}

// -- Exported component -------------------------------------------------------

/**
 * Interactive pipeline editor canvas with controlled React Flow v12 state.
 *
 * Wraps `PipelineCanvasInner` in a `ReactFlowProvider` for hook access.
 * Features:
 * - Controlled node/edge state via Jotai atoms
 * - Drag persistence with dirty tracking
 * - Node click opens step configuration detail panel
 * - Edge connection with DAG cycle validation
 * - Edge reconnection support
 * - Node insertion and deletion
 * - Complexity filter, minimap, keyboard shortcuts
 * - Canvas toolbar with zoom, fit, minimap toggle, add step, layout toggle
 *
 * @example
 * ```tsx
 * <div className="h-[calc(100vh-12rem)]">
 *   <PipelineCanvas />
 * </div>
 * ```
 */
export function PipelineCanvas() {
  return (
    <ReactFlowProvider>
      <PipelineCanvasInner />
    </ReactFlowProvider>
  );
}
