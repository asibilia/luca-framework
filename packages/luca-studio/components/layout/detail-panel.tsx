'use client'

import { useCallback, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

import { useAtom } from 'jotai'
import { X } from 'lucide-react'

import { Button } from '~/components/ui/button'
import { cn } from '~/lib/utils'
import { detailPanelStateAtom, detailPanelWidthAtom } from '~/stores/layout'
import type { DetailPanelState } from '~/stores/layout'

/**
 * Right-side detail panel with three display states.
 *
 * - **closed**: not rendered (display: none)
 * - **floating**: absolute overlay on right, does not push content, has backdrop shadow
 * - **docked**: part of grid flow, pushes content left, resizable within 400-600px
 *
 * Animates open/close with translateX transition and `data-state` attribute.
 * Keyboard shortcut: Cmd+. toggles between closed and last-open state.
 *
 * @param children - Panel content
 * @param title - Optional header title
 */
export function DetailPanel({
    children,
    title,
}: {
    children?: ReactNode
    title?: string
}) {
    const [panelState, setPanelState] = useAtom(detailPanelStateAtom)
    const [panelWidth] = useAtom(detailPanelWidthAtom)
    const lastOpenStateRef =
        useRef<Exclude<DetailPanelState, 'closed'>>('floating')

    // Track the last non-closed state for toggle behavior
    useEffect(() => {
        if (panelState !== 'closed') {
            lastOpenStateRef.current = panelState
        }
    }, [panelState])

    const close = useCallback(() => {
        setPanelState('closed')
    }, [setPanelState])

    const toggle = useCallback(() => {
        setPanelState((prev) =>
            prev === 'closed' ? lastOpenStateRef.current : 'closed'
        )
    }, [setPanelState])

    // Keyboard shortcut: Cmd+. to toggle detail panel
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === '.') {
                e.preventDefault()
                toggle()
            }
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [toggle])

    // Clamp width to valid range
    const clampedWidth = Math.min(600, Math.max(400, panelWidth))

    if (panelState === 'closed') {
        return null
    }

    const isFloating = panelState === 'floating'

    return (
        <aside
            data-state={panelState}
            className={cn(
                'flex h-full flex-col border-l bg-background',
                'transition-transform duration-200 ease-in-out',
                isFloating && 'absolute right-0 top-0 z-30 shadow-xl',
                !isFloating && 'relative'
            )}
            style={{ width: clampedWidth }}
        >
            {/* Header */}
            <div className="flex h-12 shrink-0 items-center justify-between border-b px-4">
                <span className="text-sm font-medium text-foreground">
                    {title ?? 'Details'}
                </span>
                <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-muted-foreground"
                    onClick={close}
                    aria-label="Close detail panel"
                >
                    <X className="size-4" />
                </Button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">{children}</div>
        </aside>
    )
}
