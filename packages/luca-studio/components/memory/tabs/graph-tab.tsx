'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { RotateCcw } from 'lucide-react'

import { ClusterLegend } from '~/components/knowledge-graph/cluster-legend'
import {
    GraphCanvas,
    type GraphCanvasHandle,
} from '~/components/knowledge-graph/graph-canvas'
import { GraphControls } from '~/components/knowledge-graph/graph-controls'
import { GraphSidebar } from '~/components/knowledge-graph/graph-sidebar'
import { TimeRangeSlider } from '~/components/knowledge-graph/time-range-slider'
import { EmptyState } from '~/components/shared/empty-state'
import { ErrorBoundary } from '~/components/shared/error-boundary'
import { LoadingSkeleton } from '~/components/shared/loading-skeleton'
import { Button } from '~/components/ui/button'
import { useKnowledgeGraph, type GraphNode } from '~/hooks/use-knowledge-graph'
import { KNOWN_ENTITY_TYPES } from '~/lib/graph-types'

/**
 * Graph tab for the Memory page.
 *
 * Renders the full Knowledge Graph Explorer (absorbed from the standalone
 * knowledge-graph page). Mounts useKnowledgeGraph internally so the graph
 * data is only fetched when this tab is active.
 *
 * @returns The graph tab content with canvas, sidebar, and controls
 */
export function GraphTab({ onRefreshRef }: GraphTabProps) {
    const {
        graphData,
        loading,
        error,
        configured,
        totalNodes,
        totalLinks,
        selectedNode,
        hoveredNode,
        expandedTypes,
        timeExtent,
        timeHistogram,
        timeRange,
        lastClusterAction,
        refresh,
        resetView,
        toggleCluster,
        selectNode,
        hoverNode,
        setTimeRange,
    } = useKnowledgeGraph()

    // Expose refresh to parent via mutable ref
    if (onRefreshRef) {
        onRefreshRef.current = refresh
    }

    // -- Canvas ref for imperative zoom controls --------------------------------
    const canvasRef = useRef<GraphCanvasHandle>(null)

    // -- Container sizing via ResizeObserver ------------------------------------
    const containerRef = useRef<HTMLDivElement>(null)
    const [dimensions, setDimensions] = useState({ width: 800, height: 600 })

    useEffect(() => {
        const el = containerRef.current
        if (!el) return

        const observer = new ResizeObserver((entries) => {
            const entry = entries[0]
            if (entry) {
                setDimensions({
                    width: Math.floor(entry.contentRect.width),
                    height: Math.floor(entry.contentRect.height),
                })
            }
        })

        observer.observe(el)
        return () => observer.disconnect()
    }, [loading])

    // -- Type counts for legend (computed from raw graphData.nodes) -------------
    const typeCounts = useMemo(() => {
        const counts: Record<string, number> = {}
        for (const node of graphData.nodes) {
            if (node.is_cluster) {
                counts[node.type] = (counts[node.type] ?? 0) + node.child_count
            } else {
                counts[node.type] = (counts[node.type] ?? 0) + 1
            }
        }
        return counts
    }, [graphData.nodes])

    // -- Expand all / collapse all toggle ---------------------------------------
    const allExpanded = useMemo(() => {
        const typesWithNodes = Object.keys(typeCounts)
        return (
            typesWithNodes.length > 0 &&
            typesWithNodes.every((t) => expandedTypes.has(t))
        )
    }, [typeCounts, expandedTypes])

    const handleToggleExpandAll = useCallback(() => {
        if (allExpanded) {
            for (const type of expandedTypes) {
                toggleCluster(type)
            }
        } else {
            for (const type of KNOWN_ENTITY_TYPES) {
                if (!expandedTypes.has(type)) {
                    toggleCluster(type)
                }
            }
        }
    }, [allExpanded, expandedTypes, toggleCluster])

    // -- Node click handlers ----------------------------------------------------
    const handleNodeClick = useCallback(
        (node: GraphNode) => {
            selectNode(node)
        },
        [selectNode]
    )

    const handleNodeDoubleClick = useCallback(
        (node: GraphNode) => {
            if (node.is_cluster) {
                toggleCluster(node.type)
            }
        },
        [toggleCluster]
    )

    const handleNodeHover = useCallback(
        (node: GraphNode | null) => {
            hoverNode(node)
        },
        [hoverNode]
    )

    // -- Sidebar handlers -------------------------------------------------------
    const handleSidebarClose = useCallback(() => {
        selectNode(null)
    }, [selectNode])

    const handleSidebarExpand = useCallback(
        (type: string) => {
            toggleCluster(type)
            selectNode(null)
        },
        [toggleCluster, selectNode]
    )

    // -- Zoom handlers ----------------------------------------------------------
    const handleZoomIn = useCallback(() => canvasRef.current?.zoomIn(), [])
    const handleZoomOut = useCallback(() => canvasRef.current?.zoomOut(), [])
    const handleFitView = useCallback(() => canvasRef.current?.zoomToFit(), [])

    // -- Member names for sidebar (cluster selected) ----------------------------
    const clusterMemberNames = useMemo(() => {
        if (!selectedNode?.is_cluster) return undefined
        return undefined
    }, [selectedNode])

    // -- Keyboard accessibility: Escape to close sidebar -----------------------
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && selectedNode) {
                selectNode(null)
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [selectedNode, selectNode])

    // -- Tooltip mouse tracking -------------------------------------------------
    const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(
        null
    )

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        const rect = e.currentTarget.getBoundingClientRect()
        setMousePos({
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
        })
    }, [])

    const handleMouseLeave = useCallback(() => {
        setMousePos(null)
    }, [])

    // -- Check if time range filtered all nodes out ----------------------------
    const isTimeFiltered = timeRange !== null
    const allFilteredOut =
        !loading && graphData.nodes.length === 0 && totalNodes > 0

    // -- Render -----------------------------------------------------------------

    if (loading) {
        return (
            <div className="space-y-6">
                <LoadingSkeleton variant="card" />
                <LoadingSkeleton variant="card" />
            </div>
        )
    }

    if (!configured) {
        return (
            <div className="rounded-lg border border-border bg-card p-8 text-center">
                <p className="mb-2 text-sm font-medium text-foreground">
                    MuninnDB Not Connected
                </p>
                <p className="text-sm text-muted-foreground">
                    The Knowledge Graph requires MuninnDB to be running. Ensure
                    the MuninnDB server is started and the{' '}
                    <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                        MUNINN_URL
                    </code>{' '}
                    environment variable is set.
                </p>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={refresh}
                    className="mt-4"
                >
                    Retry Connection
                </Button>
            </div>
        )
    }

    if (error) {
        return (
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-8 text-center">
                <p className="text-sm text-destructive">{error}</p>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={refresh}
                    className="mt-4"
                >
                    Retry
                </Button>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {/* Stats bar */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>
                    {totalNodes} entities, {totalLinks} relationships
                </span>
                <span>
                    Showing {graphData.nodes.length} nodes,{' '}
                    {graphData.links.length} links
                </span>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={resetView}
                    className="ml-auto"
                >
                    <RotateCcw />
                    Reset
                </Button>
            </div>

            {/* Graph area + sidebar */}
            <ErrorBoundary name="KnowledgeGraphCanvas">
                {graphData.nodes.length === 0 ? (
                    allFilteredOut && isTimeFiltered ? (
                        <div className="flex h-[calc(100vh-20rem)] items-center justify-center">
                            <div className="text-center">
                                <p className="text-sm text-muted-foreground">
                                    No entities in this time range.
                                </p>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setTimeRange(null)}
                                    className="mt-3"
                                >
                                    <RotateCcw />
                                    Reset Time Filter
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <EmptyState
                            title="No Entities"
                            message="No entities found in MuninnDB. Start using MuninnDB to see your knowledge graph."
                        />
                    )
                ) : (
                    <div className="flex h-[calc(100vh-16rem)]">
                        {/* Graph canvas area */}
                        <div
                            ref={containerRef}
                            className="relative flex-1 overflow-hidden rounded-lg border border-border/30"
                            style={{
                                backgroundImage:
                                    'radial-gradient(circle, rgba(255,255,255,0.03) 1px, transparent 1px)',
                                backgroundSize: '24px 24px',
                            }}
                            onMouseMove={handleMouseMove}
                            onMouseLeave={handleMouseLeave}
                        >
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
                                clusterAction={lastClusterAction}
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

                            {/* Tooltip on hover */}
                            {hoveredNode && mousePos && (
                                <div
                                    className="pointer-events-none absolute z-20 rounded-md border border-border/50 bg-card/90 px-3 py-2 font-mono text-xs shadow-lg backdrop-blur-sm"
                                    style={{
                                        left: mousePos.x + 12,
                                        top: mousePos.y - 10,
                                        maxWidth: 260,
                                    }}
                                >
                                    <p className="font-semibold text-foreground">
                                        {hoveredNode.name}
                                    </p>
                                    <p className="text-muted-foreground">
                                        {hoveredNode.type}
                                        {hoveredNode.is_cluster
                                            ? ` (${hoveredNode.child_count} entities)`
                                            : hoveredNode.engram_count > 0
                                              ? ` -- ${hoveredNode.engram_count} engram${hoveredNode.engram_count !== 1 ? 's' : ''}`
                                              : ''}
                                    </p>
                                </div>
                            )}

                            {/* Overlay: time range slider (bottom) */}
                            {timeExtent &&
                                timeExtent[1] - timeExtent[0] > 3600 && (
                                    <TimeRangeSlider
                                        timeExtent={timeExtent}
                                        timeRange={timeRange}
                                        histogram={timeHistogram}
                                        onRangeChange={setTimeRange}
                                        onReset={() => setTimeRange(null)}
                                    />
                                )}
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
    )
}

/** Props for the GraphTab component. */
export interface GraphTabProps {
    /** Mutable ref to expose the tab's refresh function to the parent. */
    onRefreshRef?: React.MutableRefObject<(() => void) | null>
}
