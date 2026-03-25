"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAtomValue } from "jotai";

import { vaultAtom } from "~/stores/vault";
import type {
  ClusterState,
  EntityType,
  GraphData,
  GraphLink,
  GraphNode,
} from "~/lib/graph-types";
import { TYPE_COLORS, TYPE_DISPLAY } from "~/lib/graph-types";

// -- Fetch helpers -----------------------------------------------------------

function createNotConfiguredError(message: string): Error {
  const e = new Error(message);
  e.name = "NotConfiguredError";
  return e;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (res.status === 503) {
    throw createNotConfiguredError("MuninnDB not configured");
  }
  if (!res.ok) {
    throw new Error(`Fetch ${url} failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// -- API response types ------------------------------------------------------

interface GraphDataApiResponse {
  nodes: Array<{
    id: string;
    name: string;
    type: EntityType;
    engram_count: number;
    first_seen: number | null;
    last_seen: number | null;
    is_cluster: boolean;
    child_count: number;
    val: number;
  }>;
  links: Array<{
    source: string;
    target: string;
    weight: number;
  }>;
  total_nodes: number;
  total_links: number;
}

// -- Clustered graph builder --------------------------------------------------

/**
 * Build clustered graph data from raw nodes/links based on expand/collapse state
 * and time range filter.
 *
 * When a type is collapsed (not in expandedTypes), all nodes of that type merge
 * into a single cluster supernode. Links between collapsed nodes become links
 * to/from the cluster supernode (deduplicated).
 *
 * Time filtering excludes nodes outside the given range before clustering.
 */
/**
 * Map of node ID -> last known {x, y} position from ForceGraph2D.
 *
 * ForceGraph2D mutates node objects in-place with x/y during simulation.
 * This map captures those positions so we can reuse them during cluster
 * transitions (expand/collapse) to prevent the "scatter" effect.
 */
type NodePositionMap = Map<string, { x: number; y: number }>;

function buildClusteredGraph(
  rawNodes: GraphNode[],
  rawLinks: GraphLink[],
  expandedTypes: ClusterState,
  timeRange: [number, number] | null,
  nodePositions?: NodePositionMap,
): GraphData {
  // Step 1: Time filter
  let filteredNodes = rawNodes;
  if (timeRange) {
    const [start, end] = timeRange;
    filteredNodes = rawNodes.filter((node) => {
      // Nodes without timestamps always pass the filter
      if (node.last_seen === null && node.first_seen === null) return true;
      const nodeTime = node.last_seen ?? node.first_seen;
      return nodeTime !== null && nodeTime >= start && nodeTime <= end;
    });
  }

  // Step 2: Partition into visible (expanded) and collapsed nodes
  const visibleNodes: GraphNode[] = [];
  const collapsedByType = new Map<string, GraphNode[]>();

  for (const node of filteredNodes) {
    if (expandedTypes.has(node.type)) {
      visibleNodes.push(node);
    } else {
      const group = collapsedByType.get(node.type);
      if (group) {
        group.push(node);
      } else {
        collapsedByType.set(node.type, [node]);
      }
    }
  }

  // Step 3: Create cluster supernodes for collapsed types
  const clusterNodes: GraphNode[] = [];
  const nodeIdToClusterId = new Map<string, string>();

  for (const [type, nodes] of collapsedByType) {
    if (nodes.length === 0) continue;

    const clusterId = `__cluster:${type}`;
    const totalEngrams = nodes.reduce((sum, n) => sum + n.engram_count, 0);
    const display = TYPE_DISPLAY[type as EntityType] ?? TYPE_DISPLAY.other;

    clusterNodes.push({
      id: clusterId,
      name: display.label,
      type: type as EntityType,
      is_cluster: true,
      child_count: nodes.length,
      engram_count: totalEngrams,
      first_seen: null,
      last_seen: null,
      val: Math.max(2, Math.log2(totalEngrams + 1) * 1.5),
    });

    for (const node of nodes) {
      nodeIdToClusterId.set(node.id, clusterId);
    }
  }

  // Step 4: Build final node list
  const finalNodes = [...visibleNodes, ...clusterNodes];
  const finalNodeIds = new Set(finalNodes.map((n) => n.id));

  // Step 5: Remap links
  // For each raw link, remap source/target to cluster IDs if collapsed.
  // Deduplicate links between same endpoints.
  const linkKey = (s: string, t: string) => {
    const [a, b] = s < t ? [s, t] : [t, s];
    return `${a}|||${b}`;
  };

  const linkMap = new Map<string, GraphLink>();

  for (const link of rawLinks) {
    const source = nodeIdToClusterId.get(link.source) ?? link.source;
    const target = nodeIdToClusterId.get(link.target) ?? link.target;

    // Skip links where endpoints are not in the final node set
    if (!finalNodeIds.has(source) || !finalNodeIds.has(target)) continue;

    // Skip self-loops (can happen when both endpoints collapse to same cluster)
    if (source === target) continue;

    const key = linkKey(source, target);
    const existing = linkMap.get(key);
    if (existing) {
      existing.weight = (existing.weight ?? 0) + (link.weight ?? 1);
    } else {
      linkMap.set(key, {
        source,
        target,
        weight: link.weight ?? 1,
      });
    }
  }

  // Step 6: Assign positions from the position map for smooth transitions
  if (nodePositions && nodePositions.size > 0) {
    for (const node of finalNodes) {
      if (node.is_cluster) {
        // Cluster supernode: position at centroid of its children's last known positions
        const childNodes = collapsedByType.get(node.type) ?? [];
        let sumX = 0;
        let sumY = 0;
        let count = 0;
        for (const child of childNodes) {
          const pos = nodePositions.get(child.id);
          if (pos) {
            sumX += pos.x;
            sumY += pos.y;
            count++;
          }
        }
        if (count > 0) {
          node.x = sumX / count;
          node.y = sumY / count;
        } else {
          // Fallback: use previously known cluster position
          const clusterPos = nodePositions.get(node.id);
          if (clusterPos) {
            node.x = clusterPos.x;
            node.y = clusterPos.y;
          }
        }
      } else {
        // Individual node: use last known position or cluster supernode position
        const pos = nodePositions.get(node.id);
        if (pos) {
          node.x = pos.x;
          node.y = pos.y;
        } else {
          // Newly visible (was collapsed): position near the cluster supernode
          const clusterId = `__cluster:${node.type}`;
          const clusterPos = nodePositions.get(clusterId);
          if (clusterPos) {
            // Spread in a circle around the cluster position
            const angle = Math.random() * 2 * Math.PI;
            const radius = 20 + Math.random() * 30;
            node.x = clusterPos.x + Math.cos(angle) * radius;
            node.y = clusterPos.y + Math.sin(angle) * radius;
          }
        }
      }
    }
  }

  return {
    nodes: finalNodes,
    links: Array.from(linkMap.values()),
  };
}

// -- Time extent / histogram helpers ------------------------------------------

/**
 * Compute [min, max] timestamp extent across all nodes.
 */
function computeTimeExtent(nodes: GraphNode[]): [number, number] | null {
  let min = Infinity;
  let max = -Infinity;

  for (const node of nodes) {
    if (node.first_seen !== null && node.first_seen < min) {
      min = node.first_seen;
    }
    if (node.last_seen !== null && node.last_seen > max) {
      max = node.last_seen;
    }
  }

  if (min === Infinity || max === -Infinity) return null;
  return [min, max];
}

/**
 * Build a histogram of node counts bucketed across the time range.
 *
 * Returns an array of 20 bucket counts for the time slider display.
 */
function computeTimeHistogram(
  nodes: GraphNode[],
  extent: [number, number] | null,
): number[] {
  const BUCKET_COUNT = 20;
  if (!extent) return Array(BUCKET_COUNT).fill(0) as number[];

  const [min, max] = extent;
  const range = max - min;
  if (range === 0) return Array(BUCKET_COUNT).fill(nodes.length) as number[];

  const buckets = Array(BUCKET_COUNT).fill(0) as number[];
  const bucketSize = range / BUCKET_COUNT;

  for (const node of nodes) {
    const ts = node.last_seen ?? node.first_seen;
    if (ts === null) continue;

    const bucketIdx = Math.min(
      Math.floor((ts - min) / bucketSize),
      BUCKET_COUNT - 1,
    );
    buckets[bucketIdx] = (buckets[bucketIdx] ?? 0) + 1;
  }

  return buckets;
}

// -- Exported types ----------------------------------------------------------

/** Cluster transition action for GraphCanvas cooldown management. */
export type ClusterAction = "expand" | "collapse" | null;

/** Return type of the useKnowledgeGraph hook. */
export interface KnowledgeGraphData {
  /** Processed graph data (clustered, time-filtered) ready for ForceGraph2D. */
  graphData: GraphData;
  /** Time extent [min, max] across all raw nodes (for slider bounds). */
  timeExtent: [number, number] | null;
  /** Histogram of node counts for time slider display. */
  timeHistogram: number[];
  /** Currently selected node (for detail panel). */
  selectedNode: GraphNode | null;
  /** Currently hovered node (for tooltip). */
  hoveredNode: GraphNode | null;
  /** Set of expanded entity type strings. */
  expandedTypes: ClusterState;
  /** Current time range filter. */
  timeRange: [number, number] | null;
  /** Whether data is loading. */
  loading: boolean;
  /** Error message if fetch failed. */
  error: string | null;
  /** Timestamp of last successful data fetch. */
  lastUpdated: Date | null;
  /** Whether MuninnDB is configured (not 503). */
  configured: boolean;
  /** Total raw node count (before clustering). */
  totalNodes: number;
  /** Total raw link count. */
  totalLinks: number;
  /** Last cluster transition action (expand/collapse) for canvas cooldown. */
  lastClusterAction: ClusterAction;
  /** Toggle a cluster type between expanded/collapsed. */
  toggleCluster: (type: string) => void;
  /** Set selected node (or null to deselect). */
  selectNode: (node: GraphNode | null) => void;
  /** Set hovered node (or null). */
  hoverNode: (node: GraphNode | null) => void;
  /** Set time range filter (or null to clear). */
  setTimeRange: (range: [number, number] | null) => void;
  /** Re-fetch all data. */
  refresh: () => void;
  /** Reset view: clear selection, collapse all, clear time filter. */
  resetView: () => void;
}

// -- Hook -------------------------------------------------------------------

/**
 * React hook for Knowledge Graph Explorer data.
 *
 * Fetches graph data from /api/muninn/graph-data and manages all view state:
 * cluster expansion, node selection/hover, time filtering.
 *
 * Follows the canonical use-vault-health.ts pattern:
 * - fetchingRef to prevent double-fetch in React strict mode
 * - Promise.allSettled for resilient data fetching
 * - NotConfiguredError detection for 503 responses
 *
 * @returns KnowledgeGraphData with graph state and interaction functions
 */
export function useKnowledgeGraph(): KnowledgeGraphData {
  const vault = useAtomValue(vaultAtom);
  // -- Raw data state --------------------------------------------------------
  const [rawNodes, setRawNodes] = useState<GraphNode[]>([]);
  const [rawLinks, setRawLinks] = useState<GraphLink[]>([]);

  // -- UI state --------------------------------------------------------------
  const [expandedTypes, setExpandedTypes] = useState<ClusterState>(new Set());
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [timeRange, setTimeRange] = useState<[number, number] | null>(null);

  // -- Fetch state -----------------------------------------------------------
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [configured, setConfigured] = useState(true);
  const [totalNodes, setTotalNodes] = useState(0);
  const [totalLinks, setTotalLinks] = useState(0);

  // Prevent double-fetch in React strict mode
  const fetchingRef = useRef(false);

  // Track last known node positions for smooth cluster transitions.
  // Updated from graphData nodes before each cluster toggle.
  const nodePositionsRef = useRef<NodePositionMap>(new Map());

  // Ref to the latest graphData for reading in callbacks without stale closure
  const graphDataRef = useRef<GraphData>({ nodes: [], links: [] });

  // Track last cluster action for canvas cooldown management
  const [lastClusterAction, setLastClusterAction] =
    useState<ClusterAction>(null);

  const fetchAll = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const v = encodeURIComponent(vault);
      const [graphRes] = await Promise.allSettled([
        fetchJson<GraphDataApiResponse>(`/api/muninn/graph-data?vault=${v}`),
      ]);

      // Check for 503 (not configured)
      if (
        graphRes.status === "rejected" &&
        graphRes.reason instanceof Error &&
        graphRes.reason.name === "NotConfiguredError"
      ) {
        setConfigured(false);
      }

      if (graphRes.status === "fulfilled") {
        const data = graphRes.value;

        // Convert API nodes to GraphNode shape
        const nodes: GraphNode[] = data.nodes.map((n) => ({
          id: n.id,
          name: n.name,
          type: n.type,
          is_cluster: n.is_cluster,
          child_count: n.child_count,
          engram_count: n.engram_count,
          first_seen: n.first_seen,
          last_seen: n.last_seen,
          val: n.val,
        }));

        const links: GraphLink[] = data.links.map((l) => ({
          source: l.source,
          target: l.target,
          weight: l.weight,
        }));

        setRawNodes(nodes);
        setRawLinks(links);
        setTotalNodes(data.total_nodes);
        setTotalLinks(data.total_links);
        setLastUpdated(new Date());
      } else {
        setError(
          graphRes.reason instanceof Error
            ? graphRes.reason.message
            : "Failed to fetch graph data",
        );
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch graph data",
      );
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [vault]);

  // Initial fetch on mount
  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const refresh = useCallback(() => {
    void fetchAll();
  }, [fetchAll]);

  // -- Interaction handlers --------------------------------------------------

  const toggleCluster = useCallback((type: string) => {
    // Capture current positions from graphData nodes before transition.
    // ForceGraph2D mutates node objects with x/y, so we read from the ref.
    for (const node of graphDataRef.current.nodes) {
      if (node.x !== undefined && node.y !== undefined) {
        nodePositionsRef.current.set(node.id, { x: node.x, y: node.y });
      }
    }

    setExpandedTypes((prev) => {
      const isExpanding = !prev.has(type);
      setLastClusterAction(isExpanding ? "expand" : "collapse");

      // Clear the action after a short delay so canvas resets cooldown
      setTimeout(() => setLastClusterAction(null), 600);

      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }, []);

  const selectNode = useCallback((node: GraphNode | null) => {
    setSelectedNode(node);
  }, []);

  const hoverNode = useCallback((node: GraphNode | null) => {
    setHoveredNode(node);
  }, []);

  const resetView = useCallback(() => {
    setSelectedNode(null);
    setHoveredNode(null);
    setExpandedTypes(new Set());
    setTimeRange(null);
  }, []);

  // -- Derived data (memoized) -----------------------------------------------

  const graphData = useMemo(
    () =>
      buildClusteredGraph(
        rawNodes,
        rawLinks,
        expandedTypes,
        timeRange,
        nodePositionsRef.current,
      ),
    [rawNodes, rawLinks, expandedTypes, timeRange],
  );

  // Keep the ref in sync for use in callbacks (avoids stale closure)
  graphDataRef.current = graphData;

  const timeExtent = useMemo(() => computeTimeExtent(rawNodes), [rawNodes]);

  const timeHistogram = useMemo(
    () => computeTimeHistogram(rawNodes, timeExtent),
    [rawNodes, timeExtent],
  );

  return {
    graphData,
    timeExtent,
    timeHistogram,
    selectedNode,
    hoveredNode,
    expandedTypes,
    timeRange,
    loading,
    error,
    lastUpdated,
    configured,
    totalNodes,
    totalLinks,
    lastClusterAction,
    toggleCluster,
    selectNode,
    hoverNode,
    setTimeRange,
    refresh,
    resetView,
  };
}

// Re-export types and constants needed by consumers
export type { GraphNode, GraphLink, GraphData, EntityType, ClusterState };
export { TYPE_COLORS, TYPE_DISPLAY };
