'use client'

import { Handle, Position } from '@xyflow/react'

import { cn } from '~/lib/utils'

// -- Shared Handle styling ----------------------------------------------------

/** Standard Handle classes for card-type nodes (agent, skill, gate). */
const HANDLE_CLASS =
    '!bg-muted-foreground/40 !border-border/40 !w-2 !h-2 !border'

// -- Types --------------------------------------------------------------------

interface NodeCardProps {
    /** Tailwind border class for the card accent color. */
    borderClass: string
    /** Header slot: colored bar with title, badges, etc. */
    header: React.ReactNode
    /** Tailwind bg class for the header background. */
    headerBg: string
    /** Body slot: description, badges, etc. */
    body?: React.ReactNode
    /** Card width (default: 250px). */
    width?: string
}

// -- Component ----------------------------------------------------------------

/**
 * Shared card wrapper for workflow editor node types.
 *
 * Provides a consistent structure for agent, gate, and skill nodes:
 * - Rounded card with configurable border accent
 * - Colored header bar
 * - Body content area
 * - Standardized Handle elements (top target, bottom source)
 *
 * @example
 * ```tsx
 * <NodeCard
 *   borderClass="border-sky-500/40"
 *   headerBg="bg-sky-500/10"
 *   header={<span>Agent Name</span>}
 *   body={<p>Description</p>}
 * />
 * ```
 */
export function NodeCard({
    borderClass,
    header,
    headerBg,
    body,
    width = 'w-[250px]',
}: NodeCardProps) {
    return (
        <div
            className={cn(
                'rounded-lg border bg-card/95 shadow-md shadow-black/10 overflow-hidden',
                width,
                borderClass
            )}
        >
            <Handle
                type="target"
                position={Position.Top}
                className={HANDLE_CLASS}
            />
            {/* Header */}
            <div className={cn('flex items-center gap-2 px-3 py-2', headerBg)}>
                {header}
            </div>
            {/* Body */}
            {body && <div className="px-3 py-2 space-y-1.5">{body}</div>}
            <Handle
                type="source"
                position={Position.Bottom}
                className={HANDLE_CLASS}
            />
        </div>
    )
}
