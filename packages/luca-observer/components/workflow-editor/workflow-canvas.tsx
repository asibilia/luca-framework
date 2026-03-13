"use client";

import "@xyflow/react/dist/style.css";

import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  Position,
  type Node,
  type Edge,
} from "@xyflow/react";

// -- Module-level constants (defined outside component to prevent re-renders) --

/**
 * Hardcoded nodes representing the four core Luca workflow agents.
 * Laid out in a diamond pattern: Router (top) → Planner (left) →
 * Executor (bottom) → Verifier (right) → back to Router.
 */
const initialNodes: Node[] = [
  {
    id: "router",
    data: { label: "Router" },
    position: { x: 250, y: 0 },
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
  },
  {
    id: "planner",
    data: { label: "Planner" },
    position: { x: 100, y: 150 },
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
  },
  {
    id: "executor",
    data: { label: "Executor" },
    position: { x: 250, y: 300 },
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
  },
  {
    id: "verifier",
    data: { label: "Verifier" },
    position: { x: 400, y: 150 },
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
  },
];

/**
 * Hardcoded edges forming the cyclic workflow graph:
 * Router → Planner → Executor → Verifier → Router.
 */
const initialEdges: Edge[] = [
  { id: "router-planner", source: "router", target: "planner" },
  { id: "planner-executor", source: "planner", target: "executor" },
  { id: "executor-verifier", source: "executor", target: "verifier" },
  { id: "verifier-router", source: "verifier", target: "router" },
];

// -- Component ----------------------------------------------------------------

/**
 * WorkflowCanvas renders a React Flow v12 graph with 4 hardcoded Luca
 * workflow nodes (Router, Planner, Executor, Verifier) and cyclic edges.
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
  return (
    <ReactFlow
      nodes={initialNodes}
      edges={initialEdges}
      colorMode="dark"
      fitView
    >
      <Background variant={BackgroundVariant.Dots} />
      <Controls />
    </ReactFlow>
  );
}
