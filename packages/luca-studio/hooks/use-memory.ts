'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { useAtomValue } from 'jotai'

import type {
    MuninnActivation,
    MuninnEngram,
    MuninnSessionEntry,
    MuninnStatsResponse,
} from '~/lib/muninn-types'
import { vaultAtom } from '~/stores/vault'

// -- Client-side type aliases (re-export shared types) ---------------------

/** Alias for MuninnActivation, used by client components. */
export type ActivationItem = MuninnActivation

/** Alias for MuninnEngram, used by client components. */
export type Engram = MuninnEngram

/** Alias for MuninnSessionEntry, used by client components. */
export type SessionEntry = MuninnSessionEntry

/** Alias for MuninnStatsResponse, used by client components. */
export type StatsResponse = MuninnStatsResponse

/** Data returned by the useMemory hook. */
export interface MuninnMemoryData {
    /** Brain tree engrams from semantic recall. */
    brain: ActivationItem[]
    /** All engrams for categorization. */
    engrams: Engram[]
    /** Recent session activity. */
    session: SessionEntry[]
    /** Vault statistics. */
    stats: StatsResponse | null
    /** Whether MuninnDB is reachable and configured. */
    configured: boolean
    /** Timestamp of last successful fetch. */
    lastUpdated: Date | null
    /** Manual refresh trigger (no polling). */
    refresh: () => void
    /** Loading state — true during initial fetch or refresh. */
    loading: boolean
    /** Error message if the last fetch failed. */
    error: string | null
}

// -- Fetch helpers ----------------------------------------------------------

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

// -- Hook -------------------------------------------------------------------

/**
 * React hook for MuninnDB memory data via server-side proxy routes.
 *
 * Fetches engrams, brain activations, session activity, and vault stats
 * from /api/muninn/* Route Handlers. Never imports @muninndb/client or
 * accesses MUNINN_DB_API_KEY — all authentication stays server-side.
 *
 * @returns MuninnMemoryData with structured engram data, refresh(), and staleness tracking
 */
export function useMemory(): MuninnMemoryData {
    const vault = useAtomValue(vaultAtom)
    const [brain, setBrain] = useState<ActivationItem[]>([])
    const [engrams, setEngrams] = useState<Engram[]>([])
    const [session, setSession] = useState<SessionEntry[]>([])
    const [stats, setStats] = useState<StatsResponse | null>(null)
    const [configured, setConfigured] = useState(true)
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    // Prevent double-fetch in React strict mode
    const fetchingRef = useRef(false)

    const fetchAll = useCallback(async () => {
        if (fetchingRef.current) return
        fetchingRef.current = true
        setLoading(true)
        setError(null)

        try {
            const v = encodeURIComponent(vault)
            const [brainRes, engramsRes, sessionRes, statsRes] =
                await Promise.allSettled([
                    fetchJson<{ activations: ActivationItem[] }>(
                        '/api/muninn/activate',
                        {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                context: ['project identity', 'brain tree'],
                                vault,
                                limit: 20,
                            }),
                        }
                    ),
                    fetchJson<{ engrams: Engram[] }>(
                        `/api/muninn/engrams?vault=${v}&limit=200`
                    ),
                    fetchJson<{ entries: SessionEntry[] }>(
                        `/api/muninn/session?vault=${v}&limit=50`
                    ),
                    fetchJson<StatsResponse>(`/api/muninn/stats?vault=${v}`),
                ])

            // Check if any endpoint returned 503 (not configured)
            const notConfigured = [
                brainRes,
                engramsRes,
                sessionRes,
                statsRes,
            ].some(
                (r) =>
                    r.status === 'rejected' &&
                    r.reason instanceof Error &&
                    r.reason.name === 'NotConfiguredError'
            )
            if (notConfigured) {
                setConfigured(false)
            }

            // Apply results (use defaults for failed fetches)
            if (brainRes.status === 'fulfilled') {
                setBrain(brainRes.value.activations ?? [])
            }
            if (engramsRes.status === 'fulfilled') {
                setEngrams(engramsRes.value.engrams ?? [])
            }
            if (sessionRes.status === 'fulfilled') {
                setSession(sessionRes.value.entries ?? [])
            }
            if (statsRes.status === 'fulfilled') {
                setStats(statsRes.value)
            }

            // If all failed, set error
            const allFailed = [
                brainRes,
                engramsRes,
                sessionRes,
                statsRes,
            ].every((r) => r.status === 'rejected')
            if (allFailed) {
                const firstError =
                    brainRes.status === 'rejected' ? brainRes.reason : null
                setError(
                    firstError instanceof Error
                        ? firstError.message
                        : 'Failed to fetch MuninnDB data'
                )
            } else {
                setLastUpdated(new Date())
            }
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : 'Failed to fetch MuninnDB data'
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

    return {
        brain,
        engrams,
        session,
        stats,
        configured,
        lastUpdated,
        refresh,
        loading,
        error,
    }
}
