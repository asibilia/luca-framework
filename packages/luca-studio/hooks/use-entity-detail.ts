'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { useSetAtom } from 'jotai'
import { RESET } from 'jotai-history'

import type { EntityDetailConfig } from '~/hooks/schemas/entity-hook-config'
import type { EntityDetail } from '~/lib/entity-route-helpers'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type UseEntityDetailReturn = {
    /** Full entity detail from the API, or null if not yet loaded. */
    detail: EntityDetail | null
    /** Whether the detail is currently loading. */
    loading: boolean
    /** Error message if the fetch failed. */
    error: string | null
    /** The ETag from the last successful GET (used for optimistic concurrency). */
    etag: string | null
    /** Manually refetch the entity detail. */
    refresh: () => void
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Generic hook that fetches a single entity's full config from the API and
 * populates the corresponding draft and history atoms.
 *
 * When `name` is `null`, no fetch occurs and the hook returns idle state.
 * Uses a nameRef guard to prevent stale fetch updates when the entity
 * name changes mid-flight.
 *
 * @param name   - Kebab-case entity name, or null to skip fetching.
 * @param config - Entity-specific detail configuration (endpoint, atom factories).
 * @returns Entity detail data, status indicators, and the ETag for concurrency.
 *
 * @example
 * ```ts
 * const { detail, loading, error, etag, refresh } = useEntityDetail("lu-router", AGENT_DETAIL_CONFIG);
 * ```
 */
export function useEntityDetail(
    name: string | null,
    config: EntityDetailConfig
): UseEntityDetailReturn {
    const [detail, setDetail] = useState<EntityDetail | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [etag, setEtag] = useState<string | null>(null)

    const atomKey = name ?? `${config.entityType}:__noop__`
    const setDraft = useSetAtom(config.draftAtomFactory(atomKey))
    const resetHistory = useSetAtom(config.historyAtomFactory(atomKey))

    // Track which name we last fetched to avoid stale updates
    const nameRef = useRef(name)
    nameRef.current = name

    const fetchDetail = useCallback(async () => {
        if (!name) return
        setLoading(true)
        setError(null)
        try {
            const res = await fetch(
                `${config.endpoint}/${encodeURIComponent(name)}`
            )
            if (!res.ok) {
                throw new Error(
                    `Failed to fetch ${config.entityType.slice(0, -1)}: ${res.status}`
                )
            }
            const json = (await res.json()) as { data: EntityDetail }
            const etagHeader = res.headers.get('ETag')

            // Only apply if we haven't switched entities mid-flight
            if (nameRef.current === name) {
                setDetail(json.data)
                setEtag(etagHeader)
                // Populate the draft atom with raw config + metadata for the form
                setDraft({
                    ...json.data.metadata,
                    rawConfigText: json.data.rawConfigText,
                    name: json.data.name,
                    domain: json.data.domain,
                } as Record<string, unknown>)
                // Reset undo history so users cannot undo back to the empty state
                // that existed before the server data arrived.
                resetHistory(RESET)
            }
        } catch (err) {
            if (nameRef.current === name) {
                const message =
                    err instanceof Error
                        ? err.message
                        : `Failed to load ${config.entityType.slice(0, -1)} detail`
                setError(message)
            }
        } finally {
            if (nameRef.current === name) {
                setLoading(false)
            }
        }
    }, [name, config.endpoint, config.entityType, setDraft, resetHistory])

    useEffect(() => {
        if (name) {
            setDetail(null)
            setEtag(null)
            void fetchDetail()
        } else {
            setDetail(null)
            setEtag(null)
            setLoading(false)
            setError(null)
        }
    }, [name, fetchDetail])

    return { detail, loading, error, etag, refresh: fetchDetail }
}
