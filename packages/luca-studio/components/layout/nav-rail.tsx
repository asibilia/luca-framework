'use client'

import { useCallback } from 'react'
import type { ReactNode } from 'react'

import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { Pin, PinOff } from 'lucide-react'

import { Button } from '~/components/ui/button'
import {
    Tooltip,
    TooltipTrigger,
    TooltipContent,
} from '~/components/ui/tooltip'
import { cn } from '~/lib/utils'
import {
    navRailExpandedAtom,
    navRailHoveredAtom,
    navRailWidthAtom,
    layoutContextAtom,
} from '~/stores/layout'

/**
 * Collapsible navigation rail for the left zone of the layout shell.
 *
 * - Collapsed: 48px wide, icon-only
 * - Expanded: 240px wide, icon + labels
 * - Hover to preview expand, click pin to lock expanded
 * - Auto-collapses when layout context is "editor"
 * - Keyboard shortcut: Cmd+\ toggles pin state
 *
 * Does NOT render navigation items -- accepts children for navigation
 * content that will be populated by Plan 2.
 *
 * @param children - Navigation groups and items rendered by parent
 */
export function NavRail({ children }: { children?: ReactNode }) {
    const [expanded, setExpanded] = useAtom(navRailExpandedAtom)
    const setHovered = useSetAtom(navRailHoveredAtom)
    const width = useAtomValue(navRailWidthAtom)
    const layoutContext = useAtomValue(layoutContextAtom)

    // Force collapsed in editor context regardless of pin state
    const isEditorContext = layoutContext === 'editor'
    const effectiveWidth = isEditorContext ? 48 : width
    const isExpanded = !isEditorContext && (expanded || width === 240)

    const togglePin = useCallback(() => {
        setExpanded((prev) => !prev)
    }, [setExpanded])

    // Keyboard shortcut Cmd+\ is handled by the centralized
    // useKeyboardShortcuts hook in LayoutShell — no local listener needed.

    return (
        <nav
            data-expanded={isExpanded}
            className={cn(
                'group/rail relative flex h-full flex-col border-r bg-sidebar',
                'transition-[width] duration-200 ease-in-out',
                'overflow-hidden'
            )}
            style={{ width: effectiveWidth }}
            onMouseEnter={() => {
                if (!isEditorContext) setHovered(true)
            }}
            onMouseLeave={() => setHovered(false)}
        >
            {/* Pin toggle button -- visible on hover or when expanded */}
            <div
                className={cn(
                    'absolute right-1 top-2 z-10',
                    'opacity-0 transition-opacity duration-150',
                    'group-hover/rail:opacity-100',
                    isExpanded && 'opacity-100'
                )}
            >
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 text-muted-foreground"
                            onClick={togglePin}
                            aria-label={
                                expanded ? 'Unpin navigation' : 'Pin navigation'
                            }
                        >
                            {expanded ? (
                                <PinOff className="size-3.5" />
                            ) : (
                                <Pin className="size-3.5" />
                            )}
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                        <span className="text-xs">
                            {expanded ? 'Unpin (Cmd+\\)' : 'Pin open (Cmd+\\)'}
                        </span>
                    </TooltipContent>
                </Tooltip>
            </div>

            {/* Navigation content slot */}
            <div className="flex flex-1 flex-col overflow-y-auto overflow-x-hidden pt-2">
                {children}
            </div>
        </nav>
    )
}
