'use client'

import { useCallback } from 'react'

import orderBy from 'lodash/orderBy'

import type { EntityType } from '~/lib/graph-types'
import { TYPE_COLORS, TYPE_DISPLAY } from '~/lib/graph-types'

// -- Types -------------------------------------------------------------------

export interface ClusterLegendProps {
    /** Count of nodes per entity type. */
    typeCounts: Record<string, number>
    /** Set of types that are currently expanded (showing individual nodes). */
    expandedTypes: Set<string>
    /** Toggle expand/collapse for a type. */
    onToggleType: (type: string) => void
}

// -- Component ---------------------------------------------------------------

/**
 * Compact legend showing entity type colors, counts, and expand/collapse state.
 *
 * Positioned at bottom-left of the graph area (absolute). Each entry is
 * clickable to toggle cluster expansion for that type. Expanded types
 * show a filled dot; collapsed types show an outlined dot.
 */
export function ClusterLegend({
    typeCounts,
    expandedTypes,
    onToggleType,
}: ClusterLegendProps) {
    // Sort types by count (descending) for consistent display
    const entries = orderBy(
        Object.entries(typeCounts).filter(([, count]) => count > 0),
        ([, count]) => count,
        'desc'
    )

    if (entries.length === 0) return null

    return (
        <div className="absolute left-4 top-4 z-10 rounded-lg border border-border/50 bg-card/80 px-3 py-1.5 backdrop-blur-sm">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {entries.map(([type, count]) => (
                    <LegendEntry
                        key={type}
                        type={type}
                        count={count}
                        expanded={expandedTypes.has(type)}
                        onToggle={onToggleType}
                    />
                ))}
            </div>
        </div>
    )
}

// -- Legend entry -------------------------------------------------------------

function LegendEntry({
    type,
    count,
    expanded,
    onToggle,
}: {
    type: string
    count: number
    expanded: boolean
    onToggle: (type: string) => void
}) {
    const color = TYPE_COLORS[type as EntityType] ?? TYPE_COLORS.other
    const display = TYPE_DISPLAY[type as EntityType] ?? TYPE_DISPLAY.other

    const handleClick = useCallback(() => {
        onToggle(type)
    }, [onToggle, type])

    return (
        <button
            type="button"
            onClick={handleClick}
            className="flex items-center gap-2 rounded px-1 py-0.5 text-left transition-colors hover:bg-muted/50"
            title={
                expanded
                    ? `Collapse ${display.label}`
                    : `Expand ${display.label}`
            }
        >
            {/* Dot: filled when expanded, outlined when collapsed */}
            <span
                className="inline-block h-2 w-2 shrink-0 rounded-full"
                style={
                    expanded
                        ? { backgroundColor: color }
                        : {
                              backgroundColor: 'transparent',
                              border: `1.5px solid ${color}`,
                          }
                }
            />
            <span className="font-mono text-xs text-muted-foreground">
                {display.label}
            </span>
            <span className="font-mono text-xs text-muted-foreground/50">
                {count}
            </span>
        </button>
    )
}
