'use client'

import { useCallback, useRef, useState } from 'react'

import { useAtomValue } from 'jotai'

import type { MuninnActivation, MuninnExplainResult } from '~/lib/muninn-types'
import { vaultAtom } from '~/stores/vault'

// -- Types -------------------------------------------------------------------

/** Advanced search options (stored locally; only core fields sent to API). */
export interface SearchOptions {
    mode?: 'semantic' | 'recent' | 'balanced' | 'deep'
    profile?:
        | 'default'
        | 'causal'
        | 'confirmatory'
        | 'adversarial'
        | 'structural'
    threshold?: number
}

/** A single semantic search result with optional explain data. */
export interface SemanticSearchResult {
    id: string
    concept: string
    content: string
    score: number
    confidence: number
    score_components?: Record<string, number>
    tags?: string[]
    memory_type?: string
    why?: string
    /** Populated on-demand via explainResult(). */
    explain?: MuninnExplainResult
}

/** Data returned by the useSemanticSearch hook. */
export interface SemanticSearchData {
    results: SemanticSearchResult[]
    loading: boolean
    error: string | null
    configured: boolean
    lastQuery: string | null
    lastUpdated: Date | null
    totalFound: number
    search: (query: string, options?: SearchOptions) => void
    explainResult: (engramId: string) => Promise<void>
    refresh: () => void
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

// -- Mapping helpers ---------------------------------------------------------

/**
 * Map a MuninnActivation to a SemanticSearchResult.
 *
 * Preserves all activation fields and adds the optional explain slot.
 */
function toSearchResult(activation: MuninnActivation): SemanticSearchResult {
    return {
        id: activation.id,
        concept: activation.concept,
        content: activation.content,
        score: activation.score,
        confidence: activation.confidence,
        score_components: activation.score_components,
        tags: activation.tags,
        memory_type: activation.memory_type,
        why: activation.why,
    }
}

// -- Hook --------------------------------------------------------------------

/**
 * React hook for on-demand MuninnDB semantic search.
 *
 * Unlike useMemory (auto-fetch on mount), this hook is on-demand: the consumer
 * calls `search(query)` to trigger a search. Results are stored in state and
 * can be enriched with `explainResult(engramId)`.
 *
 * Follows the established hook pattern: fetchJson, fetchingRef, local
 * createNotConfiguredError, Promise.allSettled error handling.
 *
 * @returns SemanticSearchData with results, search(), explainResult(), and loading state
 */
export function useSemanticSearch(): SemanticSearchData {
    const vault = useAtomValue(vaultAtom)
    const [results, setResults] = useState<SemanticSearchResult[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [configured, setConfigured] = useState(true)
    const [lastQuery, setLastQuery] = useState<string | null>(null)
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
    const [totalFound, setTotalFound] = useState(0)

    // Store last options for refresh()
    const lastOptionsRef = useRef<SearchOptions | undefined>(undefined)

    // Prevent double-fetch in React strict mode
    const fetchingRef = useRef(false)

    const search = useCallback(
        (query: string, options?: SearchOptions) => {
            if (fetchingRef.current) return
            fetchingRef.current = true
            setLoading(true)
            setError(null)
            setLastQuery(query)
            lastOptionsRef.current = options

            // Fire async search (not awaited -- hook is synchronous)
            void (async () => {
                try {
                    const [activateRes] = await Promise.allSettled([
                        fetchJson<{
                            activations: MuninnActivation[]
                            total_found: number
                        }>('/api/muninn/activate', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                context: [query],
                                vault,
                                limit: 20,
                            }),
                        }),
                    ])

                    // Check for 503 (MuninnDB not configured)
                    const notConfigured =
                        activateRes.status === 'rejected' &&
                        activateRes.reason instanceof Error &&
                        activateRes.reason.name === 'NotConfiguredError'

                    if (notConfigured) {
                        setConfigured(false)
                        setResults([])
                        setTotalFound(0)
                        setLastUpdated(new Date())
                    } else if (activateRes.status === 'fulfilled') {
                        const activations = activateRes.value.activations ?? []
                        setResults(activations.map(toSearchResult))
                        setTotalFound(
                            activateRes.value.total_found ?? activations.length
                        )
                        setLastUpdated(new Date())
                    } else {
                        const reason = activateRes.reason
                        setError(
                            reason instanceof Error
                                ? reason.message
                                : 'Failed to perform semantic search'
                        )
                    }
                } catch (err) {
                    setError(
                        err instanceof Error
                            ? err.message
                            : 'Failed to perform semantic search'
                    )
                } finally {
                    setLoading(false)
                    fetchingRef.current = false
                }
            })()
        },
        [vault]
    )

    const explainResult = useCallback(
        async (engramId: string): Promise<void> => {
            if (!lastQuery) return

            try {
                const explanation = await fetchJson<MuninnExplainResult>(
                    '/api/muninn/explain',
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            vault,
                            engram_id: engramId,
                            query: [lastQuery],
                        }),
                    }
                )

                // Merge explain data into matching result
                setResults((prev) =>
                    prev.map((r) =>
                        r.id === engramId ? { ...r, explain: explanation } : r
                    )
                )
            } catch {
                // Silently degrade -- no error shown for explain failures
            }
        },
        [vault, lastQuery]
    )

    const refresh = useCallback(() => {
        if (!lastQuery) return
        search(lastQuery, lastOptionsRef.current)
    }, [lastQuery, search])

    return {
        results,
        loading,
        error,
        configured,
        lastQuery,
        lastUpdated,
        totalFound,
        search,
        explainResult,
        refresh,
    }
}
