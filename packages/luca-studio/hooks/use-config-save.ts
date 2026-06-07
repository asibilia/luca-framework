'use client'

import { useCallback } from 'react'

import { useAtomValue, useSetAtom } from 'jotai'
import get from 'lodash/get'

import { configDraftAtom, configEtagAtom } from '~/stores/config-atoms'
import { dirtySetAtom, markCleanAtom } from '~/stores/dirty-tracking'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Config section keys that are individually persisted to the server.
 *
 * Each section maps to a PUT endpoint at `/api/config/{section}`.
 * Update this array when new top-level config sections are added.
 */
const CONFIG_SECTIONS = ['complexity', 'gates', 'harness'] as const

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type UseConfigSaveReturn = {
    /** Persist all config sections to the server. */
    save: () => Promise<void>
    /** Discard config draft changes and reset to server state. */
    discard: () => void
}

// ---------------------------------------------------------------------------
// Section PUT helpers
// ---------------------------------------------------------------------------

/**
 * PUT a single config section to its API route with If-Match concurrency.
 *
 * NOTE: The ETag header pattern (Content-Type + conditional If-Match) is shared
 * across save hooks: use-entity-save.ts, use-pipeline-save.ts, use-agent-save.ts,
 * use-skill-save.ts, use-rule-save.ts. If this pattern grows beyond 3-4 lines,
 * consider extracting a shared `buildFetchHeaders` helper in lib/fetch-helpers.ts.
 *
 * @param section - Config section key (e.g., "complexity", "gates", "harness")
 * @param data    - Section payload to write
 * @param etag    - ETag for optimistic concurrency, or null
 */
async function putSection(
    section: string,
    data: unknown,
    etag: string | null
): Promise<void> {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    }
    if (etag) {
        headers['If-Match'] = etag
    }

    const res = await fetch(`/api/config/${section}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(data),
    })

    if (res.status === 409) {
        throw new Error(
            'Conflict: config has been modified externally. Please refresh and try again.'
        )
    }

    if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(
            (body as { error?: string }).error ??
                `Save failed for ${section} with status ${res.status}`
        )
    }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Save and discard logic for the config editor.
 *
 * The `save` function writes each modified config section (complexity,
 * gates, harness) to its respective API route with ETag concurrency.
 * On 409 conflict, throws an error for the SaveBar to display.
 *
 * The `discard` function resets the config draft to null (falls through
 * to server state) and clears the "config" dirty key.
 *
 * @returns Object with save and discard callbacks.
 *
 * @example
 * ```ts
 * const { save, discard } = useConfigSave();
 * ```
 */
export function useConfigSave(): UseConfigSaveReturn {
    const config = useAtomValue(configDraftAtom)
    const etag = useAtomValue(configEtagAtom)
    const dirtySet = useAtomValue(dirtySetAtom)
    const setDraft = useSetAtom(configDraftAtom)
    const markClean = useSetAtom(markCleanAtom)

    const save = useCallback(async () => {
        if (!dirtySet.has('config')) return
        if (!config) return

        // Save each section in parallel
        const promises = CONFIG_SECTIONS.map((section) => {
            const sectionData = get(config, section, null)
            if (sectionData == null) return Promise.resolve()
            return putSection(section, sectionData, etag)
        })

        await Promise.all(promises)
        markClean('config')
    }, [config, dirtySet, etag, markClean])

    const discard = useCallback(() => {
        setDraft(null)
        markClean('config')
    }, [setDraft, markClean])

    return { save, discard }
}
