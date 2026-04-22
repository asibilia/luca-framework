'use client'

import {
    forwardRef,
    useCallback,
    useEffect,
    useImperativeHandle,
    useMemo,
    useRef,
} from 'react'

import dynamic from 'next/dynamic'
import type { ForceGraphMethods, NodeObject } from 'react-force-graph-2d'

import type { ClusterAction } from '~/hooks/use-knowledge-graph'
import type { EntityType, GraphData, GraphNode } from '~/lib/graph-types'
import { TYPE_COLORS } from '~/lib/graph-types'

// ForceGraph2D uses generic NodeObject internally. Our GraphNode extends
// those fields, so we cast at the boundary. This type alias keeps things tidy.
type FGNode = NodeObject & GraphNode

// -- Dynamic import (SSR-safe) -----------------------------------------------

/**
 * ForceGraph2D loaded via next/dynamic with ssr: false to prevent
 * Canvas API crashes during server-side rendering.
 */
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
    ssr: false,
    loading: () => (
        <div className="flex h-full w-full items-center justify-center">
            <p className="font-mono text-xs text-muted-foreground">
                Loading graph engine...
            </p>
        </div>
    ),
})

// -- Types -------------------------------------------------------------------

export interface GraphCanvasProps {
    /** Processed graph data for ForceGraph2D. */
    graphData: GraphData
    /** Canvas width in pixels. */
    width: number
    /** Canvas height in pixels. */
    height: number
    /** Called on single-click of a node. */
    onNodeClick?: (node: GraphNode) => void
    /** Called on double-click of a node. */
    onNodeDoubleClick?: (node: GraphNode) => void
    /** Called when hovering on/off a node. */
    onNodeHover?: (node: GraphNode | null) => void
    /** ID of the currently selected node (for visual highlight). */
    selectedNodeId?: string | null
    /** ID of the currently hovered node (for visual highlight). */
    hoveredNodeId?: string | null
    /** Last cluster transition action for cooldown management. */
    clusterAction?: ClusterAction
}

export interface GraphCanvasHandle {
    /** Zoom the graph to fit all nodes in view. */
    zoomToFit: () => void
    /** Zoom in by a step. */
    zoomIn: () => void
    /** Zoom out by a step. */
    zoomOut: () => void
}

// -- Constants ---------------------------------------------------------------

const DOUBLE_CLICK_MS = 300
const COOLDOWN_TICKS = 100

// -- Component ---------------------------------------------------------------

/**
 * ForceGraph2D canvas wrapper with custom node rendering, double-click
 * detection, and imperative zoom controls.
 *
 * Uses next/dynamic with ssr: false to avoid Canvas SSR crash.
 * Renders cluster supernodes and individual nodes with semantic zoom
 * levels, recency glow, and selection/hover highlights.
 */
export const GraphCanvas = forwardRef<GraphCanvasHandle, GraphCanvasProps>(
    function GraphCanvas(
        {
            graphData,
            width,
            height,
            onNodeClick,
            onNodeDoubleClick,
            onNodeHover,
            selectedNodeId,
            hoveredNodeId,
            clusterAction,
        },
        ref
    ) {
        const fgRef = useRef<ForceGraphMethods | undefined>(undefined)

        // Reheat simulation on cluster transitions for smooth repositioning
        useEffect(() => {
            if (clusterAction && fgRef.current) {
                fgRef.current.d3ReheatSimulation()
            }
        }, [clusterAction])

        // Compute cooldown ticks based on cluster action
        const cooldownTicks =
            clusterAction === 'expand'
                ? 50
                : clusterAction === 'collapse'
                  ? 30
                  : COOLDOWN_TICKS

        // -- Connection highlighting (hover) ----------------------------------------
        // Pre-compute a neighbors map for O(1) lookup during rendering.
        // ForceGraph2D links can have source/target as string IDs or as node objects
        // (once the simulation runs). We handle both forms.

        const nodeNeighbors = useMemo(() => {
            const neighbors = new Map<string, Set<string>>()
            for (const link of graphData.links) {
                const srcId =
                    typeof link.source === 'string'
                        ? link.source
                        : (link.source as unknown as { id: string }).id
                const tgtId =
                    typeof link.target === 'string'
                        ? link.target
                        : (link.target as unknown as { id: string }).id

                if (!neighbors.has(srcId)) neighbors.set(srcId, new Set())
                if (!neighbors.has(tgtId)) neighbors.set(tgtId, new Set())
                neighbors.get(srcId)!.add(tgtId)
                neighbors.get(tgtId)!.add(srcId)
            }
            return neighbors
        }, [graphData.links])

        // Set of node IDs that should remain bright when a hover is active
        const highlightedNodeIds = useMemo(() => {
            if (!hoveredNodeId) return null
            const set = new Set<string>([hoveredNodeId])
            const neighborSet = nodeNeighbors.get(hoveredNodeId)
            if (neighborSet) {
                for (const id of neighborSet) {
                    set.add(id)
                }
            }
            return set
        }, [hoveredNodeId, nodeNeighbors])

        // -- Double-click detection -----------------------------------------------
        // ForceGraph2D has no built-in double-click prop. We use a click timer
        // pattern: if second click within DOUBLE_CLICK_MS on same node, fire
        // onNodeDoubleClick instead of onNodeClick.
        const lastClickRef = useRef<{ nodeId: string; time: number } | null>(
            null
        )
        const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

        const handleNodeClick = useCallback(
            (raw: NodeObject) => {
                const node = raw as FGNode
                const now = Date.now()
                const last = lastClickRef.current

                if (
                    last &&
                    last.nodeId === node.id &&
                    now - last.time < DOUBLE_CLICK_MS
                ) {
                    // Double-click detected
                    if (clickTimerRef.current) {
                        clearTimeout(clickTimerRef.current)
                        clickTimerRef.current = null
                    }
                    lastClickRef.current = null
                    onNodeDoubleClick?.(node)
                    return
                }

                lastClickRef.current = { nodeId: node.id, time: now }

                // Delay single-click to allow double-click detection
                if (clickTimerRef.current) {
                    clearTimeout(clickTimerRef.current)
                }
                clickTimerRef.current = setTimeout(() => {
                    clickTimerRef.current = null
                    onNodeClick?.(node)
                }, DOUBLE_CLICK_MS)
            },
            [onNodeClick, onNodeDoubleClick]
        )

        const handleNodeHover = useCallback(
            (raw: NodeObject | null) => {
                onNodeHover?.(raw ? (raw as FGNode) : null)
            },
            [onNodeHover]
        )

        // -- Imperative handle ----------------------------------------------------

        useImperativeHandle(
            ref,
            () => ({
                zoomToFit: () => {
                    fgRef.current?.zoomToFit(400, 60)
                },
                zoomIn: () => {
                    const currentZoom = fgRef.current?.zoom() ?? 1
                    fgRef.current?.zoom(currentZoom * 1.4, 300)
                },
                zoomOut: () => {
                    const currentZoom = fgRef.current?.zoom() ?? 1
                    fgRef.current?.zoom(currentZoom / 1.4, 300)
                },
            }),
            []
        )

        // -- Custom node rendering ------------------------------------------------

        const nodeCanvasObject = useCallback(
            (
                raw: NodeObject,
                ctx: CanvasRenderingContext2D,
                globalScale: number
            ) => {
                const node = raw as FGNode
                const x = node.x ?? 0
                const y = node.y ?? 0
                const color =
                    TYPE_COLORS[node.type as EntityType] ?? TYPE_COLORS.other
                const isSelected = node.id === selectedNodeId
                const isHovered = node.id === hoveredNodeId

                // Connection highlighting: dim nodes not connected to hovered node
                const isDimmed =
                    highlightedNodeIds !== null &&
                    !highlightedNodeIds.has(node.id)
                if (isDimmed) {
                    ctx.globalAlpha = 0.15
                }

                // -- Recency glow (last 24h) -----------------------------------------
                const now = Date.now() / 1000
                const isRecent =
                    node.last_seen !== null && now - node.last_seen < 86400

                if (isRecent) {
                    ctx.save()
                    ctx.shadowColor = color
                    ctx.shadowBlur = 12 / globalScale
                }

                if (node.is_cluster) {
                    // -- Cluster supernode rendering ------------------------------------
                    const radius = Math.sqrt(node.child_count) * 4

                    // Fill (semi-transparent)
                    ctx.beginPath()
                    ctx.arc(x, y, radius, 0, 2 * Math.PI)
                    ctx.fillStyle = color + '66' // ~0.4 alpha
                    ctx.fill()

                    // Stroke
                    ctx.strokeStyle = color
                    ctx.lineWidth = 1.5 / globalScale
                    ctx.stroke()

                    // Count badge (always visible)
                    const countText = String(node.child_count)
                    const fontSize = Math.max(10, 12 / globalScale)
                    ctx.font = `bold ${fontSize}px monospace`
                    ctx.textAlign = 'center'
                    ctx.textBaseline = 'middle'
                    ctx.fillStyle = '#ffffff'
                    ctx.fillText(countText, x, y)

                    // Semantic zoom: label below circle
                    if (globalScale >= 0.5) {
                        const labelFontSize = Math.max(8, 10 / globalScale)
                        ctx.font = `${labelFontSize}px sans-serif`
                        ctx.fillStyle = 'rgba(255,255,255,0.7)'
                        ctx.fillText(
                            node.name,
                            x,
                            y + radius + labelFontSize + 2
                        )

                        // At high zoom, show hint
                        if (globalScale > 1.5) {
                            const hintFontSize = Math.max(6, 8 / globalScale)
                            ctx.font = `italic ${hintFontSize}px sans-serif`
                            ctx.fillStyle = 'rgba(255,255,255,0.4)'
                            ctx.fillText(
                                'double-click to expand',
                                x,
                                y + radius + labelFontSize + hintFontSize + 6
                            )
                        }
                    }
                } else {
                    // -- Individual node rendering --------------------------------------
                    const baseRadius = 4
                    const radius = isHovered ? baseRadius * 1.2 : baseRadius

                    // Selected ring
                    if (isSelected) {
                        ctx.beginPath()
                        ctx.arc(x, y, radius + 2 / globalScale, 0, 2 * Math.PI)
                        ctx.strokeStyle = '#ffffff'
                        ctx.lineWidth = 2 / globalScale
                        ctx.stroke()
                    }

                    // Hovered ring
                    if (isHovered && !isSelected) {
                        ctx.beginPath()
                        ctx.arc(
                            x,
                            y,
                            radius + 1.5 / globalScale,
                            0,
                            2 * Math.PI
                        )
                        ctx.strokeStyle = 'rgba(255,255,255,0.5)'
                        ctx.lineWidth = 1 / globalScale
                        ctx.setLineDash([2 / globalScale, 2 / globalScale])
                        ctx.stroke()
                        ctx.setLineDash([])
                    }

                    // Fill
                    ctx.beginPath()
                    ctx.arc(x, y, radius, 0, 2 * Math.PI)
                    ctx.fillStyle = color
                    ctx.fill()

                    // Semantic zoom: labels
                    if (globalScale >= 0.5) {
                        const labelFontSize = Math.max(8, 10 / globalScale)
                        ctx.font = `${labelFontSize}px sans-serif`
                        ctx.textAlign = 'center'
                        ctx.textBaseline = 'top'
                        ctx.fillStyle = 'rgba(255,255,255,0.7)'

                        let label = node.name
                        if (globalScale < 1.5 && label.length > 20) {
                            label = label.slice(0, 18) + '...'
                        }
                        ctx.fillText(label, x, y + radius + 2)

                        // At high zoom, show engram count badge
                        if (globalScale > 1.5 && node.engram_count > 0) {
                            const badgeFontSize = Math.max(6, 8 / globalScale)
                            ctx.font = `${badgeFontSize}px monospace`
                            ctx.fillStyle = 'rgba(255,255,255,0.4)'
                            ctx.fillText(
                                `${node.engram_count} engram${node.engram_count !== 1 ? 's' : ''}`,
                                x,
                                y + radius + labelFontSize + 6
                            )
                        }
                    }
                }

                if (isRecent) {
                    ctx.restore()
                }

                // Restore alpha if dimmed
                if (isDimmed) {
                    ctx.globalAlpha = 1
                }
            },
            [selectedNodeId, hoveredNodeId, highlightedNodeIds]
        )

        // -- Pointer area paint (hit detection) -----------------------------------

        const nodePointerAreaPaint = useCallback(
            (
                raw: NodeObject,
                paintColor: string,
                ctx: CanvasRenderingContext2D
            ) => {
                const node = raw as FGNode
                const x = node.x ?? 0
                const y = node.y ?? 0
                const radius = node.is_cluster
                    ? Math.sqrt(node.child_count) * 4
                    : 6 // slightly larger than visual for easier clicking

                ctx.beginPath()
                ctx.arc(x, y, radius, 0, 2 * Math.PI)
                ctx.fillStyle = paintColor
                ctx.fill()
            },
            []
        )

        // -- Link styling callbacks -----------------------------------------------

        const linkColor = useCallback(
            (link: Record<string, unknown>) => {
                if (!hoveredNodeId) return 'rgba(255,255,255,0.15)'

                // ForceGraph2D may have source/target as objects with id after simulation
                const srcId =
                    typeof link.source === 'string'
                        ? link.source
                        : ((link.source as { id?: string })?.id ?? '')
                const tgtId =
                    typeof link.target === 'string'
                        ? link.target
                        : ((link.target as { id?: string })?.id ?? '')

                const isConnected =
                    srcId === hoveredNodeId || tgtId === hoveredNodeId
                return isConnected
                    ? 'rgba(255,255,255,0.4)'
                    : 'rgba(255,255,255,0.04)'
            },
            [hoveredNodeId]
        )

        const linkWidth = useCallback(
            (link: Record<string, unknown>) =>
                Math.max(0.5, Math.min(3, (Number(link.weight) || 1) / 2)),
            []
        )

        return (
            <ForceGraph2D
                ref={fgRef}
                graphData={graphData}
                width={width}
                height={height}
                nodeCanvasObject={nodeCanvasObject}
                nodeCanvasObjectMode={() => 'replace'}
                nodePointerAreaPaint={nodePointerAreaPaint}
                enableNodeDrag={true}
                enableZoomInteraction={true}
                autoPauseRedraw={true}
                cooldownTicks={cooldownTicks}
                backgroundColor="transparent"
                linkColor={linkColor}
                linkWidth={linkWidth}
                onNodeClick={handleNodeClick}
                onNodeHover={handleNodeHover}
            />
        )
    }
)
