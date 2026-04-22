'use client'

import type { ReactNode } from 'react'

import {
    Group,
    Panel,
    Separator as PanelSeparator,
} from 'react-resizable-panels'

import { cn } from '~/lib/utils'

/**
 * Thin wrapper around `react-resizable-panels` (v4) providing consistent
 * styling and a simplified API.
 *
 * Uses the v4 API: `Group` (container), `Panel` (pane), `Separator` (handle).
 * The `orientation` prop maps to the library's `orientation` on Group.
 *
 * Used internally by LayoutShell for docked DetailPanel resize, and
 * available for page-level splits (e.g., agent editor tree + editor).
 *
 * @param orientation - "horizontal" or "vertical" split
 * @param children - Exactly two ReactNode children (first panel, second panel)
 * @param defaultFirstSize - Default size percentage for the first panel (0-100)
 * @param minFirstSize - Minimum size percentage for the first panel
 * @param maxFirstSize - Maximum size percentage for the first panel
 * @param className - Additional class name for the Group container
 *
 * @example
 * ```tsx
 * <ResizableSplit orientation="horizontal" defaultFirstSize={70} minFirstSize={30}>
 *   <div>Left panel content</div>
 *   <div>Right panel content</div>
 * </ResizableSplit>
 * ```
 */
export function ResizableSplit({
    orientation,
    children,
    defaultFirstSize,
    minFirstSize,
    maxFirstSize,
    className,
}: {
    orientation: 'horizontal' | 'vertical'
    children: [ReactNode, ReactNode]
    defaultFirstSize?: number
    minFirstSize?: number
    maxFirstSize?: number
    className?: string
}) {
    const [first, second] = children

    return (
        <Group
            orientation={orientation}
            className={cn('h-full w-full', className)}
        >
            <Panel
                defaultSize={defaultFirstSize}
                minSize={minFirstSize}
                maxSize={maxFirstSize}
            >
                {first}
            </Panel>

            <PanelSeparator
                className={cn(
                    'group relative flex items-center justify-center',
                    orientation === 'horizontal'
                        ? 'w-px cursor-col-resize border-l border-border'
                        : 'h-px cursor-row-resize border-t border-border'
                )}
            />

            <Panel>{second}</Panel>
        </Group>
    )
}
