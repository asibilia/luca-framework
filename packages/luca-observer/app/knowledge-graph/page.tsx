"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { EmptyState } from "~/components/shared/empty-state";
import { ErrorBoundary } from "~/components/shared/error-boundary";
import { LoadingSkeleton } from "~/components/shared/loading-skeleton";
import { PageContainer } from "~/components/layout/page-container";
import {
  GraphCanvas,
  type GraphCanvasHandle,
} from "~/components/knowledge-graph/graph-canvas";
import { GraphSidebar } from "~/components/knowledge-graph/graph-sidebar";
import { ClusterLegend } from "~/components/knowledge-graph/cluster-legend";
import { GraphControls } from "~/components/knowledge-graph/graph-controls";
import { useKnowledgeGraph, type GraphNode } from "~/hooks/use-knowledge-graph";
import { KNOWN_ENTITY_TYPES } from "~/lib/graph-types";
import { relativeTime } from "~/lib/format";

// -- Page component ----------------------------------------------------------

/**
 * Knowledge Graph Explorer page.
 *
 * Displays a force-directed graph visualization of MuninnDB entities
 * and their relationships. Supports cluster expand/collapse, node
 * selection with sidebar, zoom controls, and time range filtering.
 *
 * Layout:
 * - flex row: graph area (flex-1, relative) + sidebar (w-80, conditional)
 * - graph area contains: GraphCanvas (full), ClusterLegend (abs bottom-left),
 *   GraphControls (abs top-right)
 * - sidebar slides in when a node is selected
 */
export default function KnowledgeGraphPage() {
  const {
    graphData,
    loading,
    error,
    lastUpdated,
    configured,
    totalNodes,
    totalLinks,
    selectedNode,
    hoveredNode,
    expandedTypes,
    refresh,
    resetView,
    toggleCluster,
    selectNode,
    hoverNode,
  } = useKnowledgeGraph();

  // -- Canvas ref for imperative zoom controls --------------------------------
  const canvasRef = useRef<GraphCanvasHandle>(null);

  // -- Container sizing via ResizeObserver ------------------------------------
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setDimensions({
          width: Math.floor(entry.contentRect.width),
          height: Math.floor(entry.contentRect.height),
        });
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // -- Type counts for legend (computed from raw graphData.nodes) -------------
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const node of graphData.nodes) {
      if (node.is_cluster) {
        // Cluster supernode: use child_count for the type
        counts[node.type] = (counts[node.type] ?? 0) + node.child_count;
      } else {
        counts[node.type] = (counts[node.type] ?? 0) + 1;
      }
    }
    return counts;
  }, [graphData.nodes]);

  // -- Expand all / collapse all toggle ---------------------------------------
  const allExpanded = useMemo(() => {
    // All expanded means every known type that has nodes is in expandedTypes
    const typesWithNodes = Object.keys(typeCounts);
    return (
      typesWithNodes.length > 0 &&
      typesWithNodes.every((t) => expandedTypes.has(t))
    );
  }, [typeCounts, expandedTypes]);

  const handleToggleExpandAll = useCallback(() => {
    if (allExpanded) {
      // Collapse all: reset each expanded type
      for (const type of expandedTypes) {
        toggleCluster(type);
      }
    } else {
      // Expand all: toggle each type that isn't expanded
      for (const type of KNOWN_ENTITY_TYPES) {
        if (!expandedTypes.has(type)) {
          toggleCluster(type);
        }
      }
    }
  }, [allExpanded, expandedTypes, toggleCluster]);

  // -- Node click handlers ----------------------------------------------------
  const handleNodeClick = useCallback(
    (node: GraphNode) => {
      selectNode(node);
    },
    [selectNode],
  );

  const handleNodeDoubleClick = useCallback(
    (node: GraphNode) => {
      if (node.is_cluster) {
        toggleCluster(node.type);
      }
    },
    [toggleCluster],
  );

  const handleNodeHover = useCallback(
    (node: GraphNode | null) => {
      hoverNode(node);
    },
    [hoverNode],
  );

  // -- Sidebar handlers -------------------------------------------------------
  const handleSidebarClose = useCallback(() => {
    selectNode(null);
  }, [selectNode]);

  const handleSidebarExpand = useCallback(
    (type: string) => {
      toggleCluster(type);
      selectNode(null);
    },
    [toggleCluster, selectNode],
  );

  // -- Zoom handlers ----------------------------------------------------------
  const handleZoomIn = useCallback(() => canvasRef.current?.zoomIn(), []);
  const handleZoomOut = useCallback(() => canvasRef.current?.zoomOut(), []);
  const handleFitView = useCallback(() => canvasRef.current?.zoomToFit(), []);

  // -- Member names for sidebar (when selected node is a cluster) -------------
  const clusterMemberNames = useMemo(() => {
    if (!selectedNode?.is_cluster) return undefined;
    // We don't have the raw member list here (it's collapsed in the hook).
    // The sidebar will show the child_count but not individual names
    // unless we reconstruct from graphData. For now, return undefined.
    return undefined;
  }, [selectedNode]);

  // -- Render -----------------------------------------------------------------

  const lastUpdatedText = lastUpdated
    ? `Last updated: ${relativeTime(lastUpdated)}`
    : null;

  return (
    <PageContainer
      title="Knowledge Graph"
      subtitle="MuninnDB Entity Explorer"
      actions={
        <div className="flex items-center gap-3">
          {lastUpdatedText && (
            <span className="font-mono text-xs text-muted-foreground/60">
              {lastUpdatedText}
            </span>
          )}

          <button
            type="button"
            onClick={resetView}
            disabled={loading}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            Reset
          </button>

          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      }
    >
      {loading ? (
        <div className="space-y-6">
          <LoadingSkeleton variant="card" />
          <LoadingSkeleton variant="card" />
        </div>
      ) : !configured ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">
            MuninnDB is not configured. Start MuninnDB to see the knowledge
            graph.
          </p>
        </div>
      ) : error ? (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-8 text-center">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Stats bar */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>
              {totalNodes} entities, {totalLinks} relationships
            </span>
            <span>
              Showing {graphData.nodes.length} nodes, {graphData.links.length}{" "}
              links
            </span>
          </div>

          {/* Graph area + sidebar */}
          <ErrorBoundary name="KnowledgeGraphCanvas">
            {graphData.nodes.length === 0 ? (
              <EmptyState
                title="No Entities"
                message="No entities found in MuninnDB. Start using MuninnDB to see your knowledge graph."
              />
            ) : (
              <div className="flex h-[calc(100vh-12rem)]">
                {/* Graph canvas area */}
                <div ref={containerRef} className="relative flex-1">
                  <GraphCanvas
                    ref={canvasRef}
                    graphData={graphData}
                    width={dimensions.width}
                    height={dimensions.height}
                    onNodeClick={handleNodeClick}
                    onNodeDoubleClick={handleNodeDoubleClick}
                    onNodeHover={handleNodeHover}
                    selectedNodeId={selectedNode?.id ?? null}
                    hoveredNodeId={hoveredNode?.id ?? null}
                  />

                  {/* Overlay: legend (bottom-left) */}
                  <ClusterLegend
                    typeCounts={typeCounts}
                    expandedTypes={expandedTypes}
                    onToggleType={toggleCluster}
                  />

                  {/* Overlay: controls (top-right) */}
                  <GraphControls
                    onZoomIn={handleZoomIn}
                    onZoomOut={handleZoomOut}
                    onFitView={handleFitView}
                    onResetView={resetView}
                    onToggleExpandAll={handleToggleExpandAll}
                    allExpanded={allExpanded}
                  />
                </div>

                {/* Sidebar (conditional) */}
                {selectedNode && (
                  <GraphSidebar
                    node={selectedNode}
                    onClose={handleSidebarClose}
                    onExpandCluster={handleSidebarExpand}
                    memberNames={clusterMemberNames}
                  />
                )}
              </div>
            )}
          </ErrorBoundary>
        </div>
      )}
    </PageContainer>
  );
}
