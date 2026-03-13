"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { Edge, Node } from "@xyflow/react";

import {
  WorkflowTopologyResponseSchema,
  type WorkflowEdgeData,
  type WorkflowNodeData,
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

  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchTopology = useCallback(async () => {
    // Abort any in-flight request so the latest complexity always wins
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const params = complexity
        ? `?complexity=${encodeURIComponent(complexity)}`
        : "";
      const res = await fetch(`/api/workflow/topology${params}`, {
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`Fetch topology failed: ${res.status}`);
      }

      const raw = await res.json();
      const parseResult = WorkflowTopologyResponseSchema.safeParse(raw);

      if (!parseResult.success) {
        throw new Error(
          `Invalid topology response: ${parseResult.error.issues.map((i) => i.message).join(", ")}`,
        );
      }

      const data = parseResult.data;

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
      // Ignore abort errors — they mean a newer request superseded this one
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(
        err instanceof Error
          ? err.message
          : "Failed to fetch workflow topology",
      );
    } finally {
      setLoading(false);
    }
  }, [complexity]);

  useEffect(() => {
    void fetchTopology();
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [fetchTopology]);

  const refresh = useCallback(() => {
    void fetchTopology();
  }, [fetchTopology]);

  return { nodes, edges, loading, error, refresh, selectedComplexity };
}
