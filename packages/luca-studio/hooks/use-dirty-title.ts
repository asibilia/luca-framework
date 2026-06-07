'use client'

import { useEffect, useRef } from 'react'

import { useAtomValue } from 'jotai'

import { dirtySetAtom } from '~/stores/dirty-tracking'

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Prefixes the browser tab title with `[*] ` when any entity matching the
 * given prefix has unsaved changes in `dirtySetAtom`.
 *
 * Restores the original title on cleanup (unmount or when changes are
 * saved/discarded).
 *
 * @param entityPrefix - Prefix to filter dirty keys (e.g., `"agent:"`)
 *
 * @example
 * ```tsx
 * // In the Agents page
 * useDirtyTitle("agent:");
 * // Browser tab shows "[*] Luca Studio" when an agent has unsaved changes
 * ```
 */
export function useDirtyTitle(entityPrefix: string): void {
    const dirtySet = useAtomValue(dirtySetAtom)
    const originalTitleRef = useRef<string | null>(null)

    // Check if any key matching the prefix is dirty
    const hasDirtyEntity = (() => {
        for (const key of dirtySet) {
            if (key.startsWith(entityPrefix)) return true
        }
        return false
    })()

    useEffect(() => {
        // Capture original title on first mount
        if (originalTitleRef.current === null) {
            originalTitleRef.current = document.title
        }

        const baseTitle = originalTitleRef.current

        if (hasDirtyEntity) {
            // Add [*] prefix if not already present
            if (!document.title.startsWith('[*] ')) {
                document.title = `[*] ${baseTitle}`
            }
        } else {
            // Restore original title
            document.title = baseTitle
        }

        return () => {
            // Restore on unmount
            if (originalTitleRef.current !== null) {
                document.title = originalTitleRef.current
            }
        }
    }, [hasDirtyEntity])
}
