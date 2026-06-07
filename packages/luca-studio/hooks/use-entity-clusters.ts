'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { useAtomValue } from 'jotai'

import { vaultAtom } from '~/stores/vault'

/** Entity cluster pair from the entity-clusters API. */
export interface ClusterPair {
    entity_a: string
    entity_b: string
    count: number
}

/** Return value of the useEntityClusters hook. */
export interface EntityClustersData {
    /** Top entity cluster pairs sorted by co-occurrence count. */
    clusters: ClusterPair[]
    /** Whether the initial fetch is in progress. */
    loading: boolean
    /** Error message if the fetch failed, null otherwise. */
    error: string | null
}

/**
 * React hook for entity cluster co-occurrence data.
 *
 * Fetches top entity pairs from /api/muninn/entity-clusters and returns
 * the result as a stable data object. Follows the canonical hook pattern
 * used by useCheckpoint and useObservations: fetchingRef guard, single
 * fetch on mount, no polling (data changes infrequently).
 *
 * @param topN - Maximum number of pairs to return (default: 15)
 * @param minCount - Minimum co-occurrence count to include (default: 2)
 * @returns EntityClustersData with clusters, loading, and error state
 */
export function useEntityClusters(topN = 15, minCount = 2): EntityClustersData {
    const vault = useAtomValue(vaultAtom)
    const [clusters, setClusters] = useState<ClusterPair[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const fetchingRef = useRef(false)

    const fetchClusters = useCallback(async () => {
        if (fetchingRef.current) return
        fetchingRef.current = true

        try {
            const v = encodeURIComponent(vault)
            const res = await fetch(
                `/api/muninn/entity-clusters?vault=${v}&top_n=${topN}&min_count=${minCount}`
            )
            if (!res.ok) {
                setError(`Failed to fetch clusters (${res.status})`)
                return
            }
            const data = (await res.json()) as {
                clusters?: ClusterPair[]
                count?: number
            }
            setClusters(data.clusters ?? [])
            setError(null)
        } catch {
            setError('Failed to fetch entity clusters')
        } finally {
            setLoading(false)
            fetchingRef.current = false
        }
    }, [vault, topN, minCount])

    useEffect(() => {
        void fetchClusters()
    }, [fetchClusters])

    return { clusters, loading, error }
}
