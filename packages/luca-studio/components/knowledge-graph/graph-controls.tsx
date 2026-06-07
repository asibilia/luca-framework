'use client'

import { Maximize2, Minimize2, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react'

// -- Types -------------------------------------------------------------------

export interface GraphControlsProps {
    /** Zoom in one step. */
    onZoomIn: () => void
    /** Zoom out one step. */
    onZoomOut: () => void
    /** Fit all nodes in view. */
    onFitView: () => void
    /** Reset layout and view state. */
    onResetView: () => void
    /** Toggle expand all / collapse all. */
    onToggleExpandAll: () => void
    /** Whether all types are currently expanded. */
    allExpanded: boolean
}

// -- Component ---------------------------------------------------------------

/**
 * Zoom and layout controls overlay for the graph canvas.
 *
 * Positioned at top-right of the graph area (absolute). Vertical button
 * group with zoom in/out, fit-to-view, reset layout, and expand/collapse
 * all toggle.
 */
export function GraphControls({
    onZoomIn,
    onZoomOut,
    onFitView,
    onResetView,
    onToggleExpandAll,
    allExpanded,
}: GraphControlsProps) {
    return (
        <div className="absolute right-4 top-4 z-10 flex flex-col gap-1 rounded-lg border border-border/50 bg-card/80 p-1 backdrop-blur-sm">
            <ControlButton
                onClick={onZoomIn}
                title="Zoom In"
                icon={<ZoomIn className="h-4 w-4" />}
            />
            <ControlButton
                onClick={onZoomOut}
                title="Zoom Out"
                icon={<ZoomOut className="h-4 w-4" />}
            />
            <Separator />
            <ControlButton
                onClick={onFitView}
                title="Fit to View"
                icon={<Maximize2 className="h-4 w-4" />}
            />
            <ControlButton
                onClick={onResetView}
                title="Reset Layout"
                icon={<RotateCcw className="h-4 w-4" />}
            />
            <Separator />
            <ControlButton
                onClick={onToggleExpandAll}
                title={allExpanded ? 'Collapse All' : 'Expand All'}
                icon={
                    allExpanded ? (
                        <Minimize2 className="h-4 w-4" />
                    ) : (
                        <Maximize2 className="h-4 w-4" />
                    )
                }
            />
        </div>
    )
}

// -- Sub-components ----------------------------------------------------------

function ControlButton({
    onClick,
    title,
    icon,
}: {
    onClick: () => void
    title: string
    icon: React.ReactNode
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            title={title}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:bg-muted/80"
        >
            {icon}
        </button>
    )
}

function Separator() {
    return <div className="mx-1 border-t border-border/50" />
}
