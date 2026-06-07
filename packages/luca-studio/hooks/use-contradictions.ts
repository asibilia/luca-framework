'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { useAtomValue } from 'jotai'

import { vaultAtom } from '~/stores/vault'

// -- Types -------------------------------------------------------------------

/** A pair of contradicting engrams identified by MuninnDB. */
export interface ContradictionPair {
    id_a: string
    id_b: string
    concept_a: string
    concept_b: string
    reason: string
}

/** Data returned by the useContradictions hook. */
export interface ContradictionsData {
    contradictions: ContradictionPair[]
    loading: boolean
    error: string | null
    configured: boolean
    lastUpdated: Date | null
    refresh: () => void
    forgetEngram: (engramId: string) => Promise<boolean>
}

// -- Fetch helpers -----------------------------------------------------------

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, init)
    if (res.status === 503) {
        throw createNotConfiguredError('MuninnDB not configured')
    }
    if (!res.ok) {
        throw new Error(`Fetch ${url} failed: ${res.status}`)
    }
    return res.json() as Promise<T>
}

function createNotConfiguredError(message: string): Error {
    const e = new Error(message)
    e.name = 'NotConfiguredError'
    return e
}

// -- Hook --------------------------------------------------------------------

/**
 * React hook for MuninnDB contradiction detection data.
 *
 * Auto-fetches contradictions on mount following the useDecisionTrail pattern:
 * fetchingRef, Promise.allSettled, manual refresh, no polling.
 *
 * Provides `forgetEngram(id)` to remove a contradicting engram and
 * automatically prune matching pairs from the local state.
 *
 * @returns ContradictionsData with contradictions, refresh(), forgetEngram(), and loading state
 */
export function useContradictions(): ContradictionsData {
    const vault = useAtomValue(vaultAtom)
    const [contradictions, setContradictions] = useState<ContradictionPair[]>(
        []
    )
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [configured, setConfigured] = useState(true)
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

    // Prevent double-fetch in React strict mode
    const fetchingRef = useRef(false)

    const fetchAll = useCallback(async () => {
        if (fetchingRef.current) return
        fetchingRef.current = true
        setLoading(true)
        setError(null)

        try {
            const v = encodeURIComponent(vault)
            const [contradictionsRes] = await Promise.allSettled([
                fetchJson<{ contradictions: ContradictionPair[] }>(
                    `/api/muninn/contradictions?vault=${v}`
                ),
            ])

            // Check for 503 (MuninnDB not configured) -- degrade gracefully
            const notConfigured =
                contradictionsRes.status === 'rejected' &&
                contradictionsRes.reason instanceof Error &&
                contradictionsRes.reason.name === 'NotConfiguredError'

            if (notConfigured) {
                setConfigured(false)
                setContradictions([])
                setLastUpdated(new Date())
            } else if (contradictionsRes.status === 'fulfilled') {
                const pairs = contradictionsRes.value.contradictions ?? []
                setContradictions(pairs)
                setLastUpdated(new Date())
            } else {
                // Fetch failed for non-503 reason
                const reason = contradictionsRes.reason
                setError(
                    reason instanceof Error
                        ? reason.message
                        : 'Failed to fetch contradiction data'
                )
            }
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : 'Failed to fetch contradiction data'
            )
        } finally {
            setLoading(false)
            fetchingRef.current = false
        }
    }, [vault])

    // Initial fetch on mount
    useEffect(() => {
        void fetchAll()
    }, [fetchAll])

    const refresh = useCallback(() => {
        void fetchAll()
    }, [fetchAll])

    const forgetEngram = useCallback(
        async (engramId: string): Promise<boolean> => {
            try {
                await fetchJson<{ forgotten: boolean }>('/api/muninn/forget', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ vault, id: engramId }),
                })

                // Remove any contradiction pairs that reference the forgotten engram
                setContradictions((prev) =>
                    prev.filter(
                        (p) => p.id_a !== engramId && p.id_b !== engramId
                    )
                )

                return true
            } catch {
                return false
            }
        },
        [vault]
    )

    return {
        contradictions,
        loading,
        error,
        configured,
        lastUpdated,
        refresh,
        forgetEngram,
    }
}
