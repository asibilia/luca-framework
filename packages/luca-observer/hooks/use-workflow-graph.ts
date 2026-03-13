"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { Edge, Node } from "@xyflow/react";

import type {
  WorkflowEdgeData,
  WorkflowNodeData,
  WorkflowTopologyResponse,
} from "~/lib/workflow-types";

// -- Types --------------------------------------------------------------------

/** Return type for the useWorkflowGraph hook. */
export interface WorkflowGraphData {
  nodes: Node<WorkflowNodeData>[];
  edges: Edge<WorkflowEdgeData>[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  selectedComplexity?: string;
}

// -- Hook ---------------------------------------------------------------------

/**
 * React hook that fetches the workflow topology from the API and returns
 * React Flow-compatible nodes and edges.
 *
 * Passes `parentId`, `extent`, and `style` from the API response to React
 * Flow nodes so group containers and their children render correctly.
 *
 * @param complexity - Optional complexity level to filter visible agents
 * @returns WorkflowGraphData with nodes, edges, loading, error, and refresh
 *
 * @example
 * ```tsx
 * const { nodes, edges, loading, error } = useWorkflowGraph("MODERATE");
 * ```
 */
export function useWorkflowGraph(complexity?: string): WorkflowGraphData {
  const [nodes, setNodes] = useState<Node<WorkflowNodeData>[]>([]);
  const [edges, setEdges] = useState<Edge<WorkflowEdgeData>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedComplexity, setSelectedComplexity] = useState<
    string | undefined
  >();

  const fetchingRef = useRef(false);

  const fetchTopology = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const params = complexity
        ? `?complexity=${encodeURIComponent(complexity)}`
        : "";
      const res = await fetch(`/api/workflow/topology${params}`);

      if (!res.ok) {
        throw new Error(`Fetch topology failed: ${res.status}`);
      }

      const data = (await res.json()) as WorkflowTopologyResponse;

      // Transform API nodes into React Flow nodes, including group fields
      const flowNodes: Node<WorkflowNodeData>[] = data.nodes.map((n) => ({
        id: n.id,
        position: n.position,
        data: n.data,
        type: n.type,
        ...(n.parent_id && { parentId: n.parent_id }),
        ...(n.extent && { extent: n.extent }),
        ...(n.style && { style: n.style }),
      }));

      // Transform API edges into React Flow edges
      const flowEdges: Edge<WorkflowEdgeData>[] = data.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        data: e.data,
      }));

      setNodes(flowNodes);
      setEdges(flowEdges);
      setSelectedComplexity(data.selected_complexity);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to fetch workflow topology",
      );
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [complexity]);

  useEffect(() => {
    void fetchTopology();
  }, [fetchTopology]);

  const refresh = useCallback(() => {
    void fetchTopology();
  }, [fetchTopology]);

  return { nodes, edges, loading, error, refresh, selectedComplexity };
}
