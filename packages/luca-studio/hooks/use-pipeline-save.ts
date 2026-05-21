'use client'

import { useCallback } from 'react'

import { useAtom } from 'jotai'
import cloneDeep from 'lodash/cloneDeep'

import {
    configAtom,
    configDraftAtom,
    configEtagAtom,
} from '~/stores/config-atoms'
import { markCleanAtom } from '~/stores/dirty-tracking'

// -- Types --------------------------------------------------------------------

/** Return type for the usePipelineSave hook. */
interface PipelineSaveActions {
    /** Save all pipeline changes to the server. */
    handleSave: () => Promise<void>
    /** Discard all pipeline changes and revert to server state. */
    handleDiscard: () => void
}

// -- Hook ---------------------------------------------------------------------

/**
 * Hook providing save and discard logic for the pipeline editor.
 *
 * - **Save**: PUTs the workflow section of `configDraftAtom` to
 *   `/api/config/workflow`, then clears dirty tracking.
 * - **Discard**: Resets `configDraftAtom` to the server state and clears
 *   config dirty tracking. Pipeline nodes/edges are intentionally NOT
 *   reset — their topology comes from a separate API and a full page
 *   reload is the path to a complete reset.
 *
 * @returns Object with `handleSave` and `handleDiscard` callbacks.
 *
 * @example
 * ```tsx
 * const { handleSave, handleDiscard } = usePipelineSave();
 * <SaveBar onSave={handleSave} onDiscard={handleDiscard} />
 * ```
 */
export function usePipelineSave(): PipelineSaveActions {
    const [configDraft] = useAtom(configDraftAtom)
    const [serverConfig] = useAtom(configAtom)
    const [, markClean] = useAtom(markCleanAtom)
    const [, setConfigDraft] = useAtom(configDraftAtom)
    const [configEtag, setConfigEtag] = useAtom(configEtagAtom)

    const handleSave = useCallback(async () => {
        if (!configDraft) return

        // Extract the workflow section from the config draft
        const workflowSection =
            (configDraft as Record<string, unknown>).workflow ?? {}

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        }

        if (configEtag) {
            headers['If-Match'] = configEtag
        }

        const response = await fetch('/api/config/workflow', {
            method: 'PUT',
            headers,
            body: JSON.stringify(workflowSection),
        })

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}))
            const errorObj = errorData as Record<string, unknown>

            // 409 Conflict -- another tab or SSE update changed config.json
            if (response.status === 409) {
                throw new Error(
                    'Save conflict: the configuration was modified by another ' +
                        'source. Please reload and try again.'
                )
            }

            // 428 Precondition Required -- client lost its ETag
            if (response.status === 428) {
                throw new Error(
                    'Save failed: concurrency token missing. Please reload the page.'
                )
            }

            const message = errorObj?.error ?? `Save failed: ${response.status}`
            throw new Error(String(message))
        }

        // Update ETag from response for next save round-trip
        const freshEtag = response.headers.get('ETag')
        if (freshEtag) {
            setConfigEtag(freshEtag)
        }

        // Clear dirty state on success
        markClean('config')
    }, [configDraft, configEtag, setConfigEtag, markClean])

    const handleDiscard = useCallback(() => {
        // Reset config draft to server state
        if (serverConfig) {
            setConfigDraft(cloneDeep(serverConfig) as Record<string, unknown>)
        }

        // Note: We intentionally do NOT reset pipeline nodes/edges here.
        // The topology comes from a different API (/api/workflow/topology)
        // and would require a full re-fetch. The user can reload the page
        // for a complete reset. This matches the plan's save/discard spec
        // which focuses on config changes.
        markClean('config')
    }, [serverConfig, setConfigDraft, markClean])

    return { handleSave, handleDiscard }
}
