'use client'

import { useEffect, useRef, useState } from 'react'

import { useAtomValue } from 'jotai'

import { cn } from '~/lib/utils'
import { dirtySetAtom } from '~/stores/dirty-tracking'

/**
 * Size presets for the dirty indicator dot.
 *
 * - `sm` (6px): Default. Used in entity tree items and tab headers.
 * - `md` (8px): Used in page titles where more visibility is needed.
 */
const SIZE_MAP = {
    sm: 'size-1.5',
    md: 'size-2',
} as const

type DirtyIndicatorSize = keyof typeof SIZE_MAP

type DirtyIndicatorProps = {
    /** Entity key to check against dirtySetAtom (atom-driven mode). */
    entityKey?: string
    /** Explicit dirty state override (controlled mode). Takes precedence over entityKey. */
    isDirty?: boolean
    /** Size variant for the indicator dot. Defaults to "sm" (6px). */
    size?: DirtyIndicatorSize
    /** Additional CSS classes for the outer wrapper. */
    className?: string
}

/**
 * Minimal amber dot that signals unsaved changes.
 *
 * Supports two usage modes:
 * - **Atom-driven**: Pass `entityKey` to read dirty state from `dirtySetAtom`.
 * - **Controlled**: Pass `isDirty` boolean directly.
 *
 * If both are provided, `isDirty` takes precedence.
 *
 * The dot plays a single pulse animation on first appearance, then remains
 * static until hidden and re-shown.
 *
 * @example
 * ```tsx
 * // Atom-driven mode (in entity tree)
 * <DirtyIndicator entityKey="agent:lu-router" />
 *
 * // Controlled mode (page title aggregating multiple keys)
 * <DirtyIndicator isDirty={hasUnsavedChanges} size="md" />
 * ```
 */
export function DirtyIndicator({
    entityKey,
    isDirty,
    size = 'sm',
    className,
}: DirtyIndicatorProps) {
    const dirtySet = useAtomValue(dirtySetAtom)
    const [showPulse, setShowPulse] = useState(false)
    const prevVisibleRef = useRef(false)

    // Resolve visibility: controlled mode takes precedence over atom-driven
    const visible =
        isDirty !== undefined
            ? isDirty
            : entityKey !== undefined
              ? dirtySet.has(entityKey)
              : false

    // Trigger pulse animation on rising edge (hidden -> visible)
    useEffect(() => {
        if (visible && !prevVisibleRef.current) {
            setShowPulse(true)
            const timer = setTimeout(() => setShowPulse(false), 1000)
            return () => clearTimeout(timer)
        }
        if (!visible) {
            setShowPulse(false)
        }
        prevVisibleRef.current = visible
    }, [visible])

    if (!visible) return null

    return (
        <span
            role="status"
            aria-label="Unsaved changes"
            className={cn(
                'relative inline-flex items-center justify-center',
                className
            )}
        >
            {showPulse && (
                <span
                    className={cn(
                        'absolute inline-flex rounded-full bg-amber-500 opacity-75 animate-ping',
                        SIZE_MAP[size]
                    )}
                />
            )}
            <span
                className={cn(
                    'relative inline-flex rounded-full bg-amber-500',
                    SIZE_MAP[size]
                )}
            />
        </span>
    )
}
