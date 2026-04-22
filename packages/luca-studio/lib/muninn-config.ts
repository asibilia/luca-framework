/**
 * Server-only MuninnDB configuration and client.
 *
 * NEVER import this from client components — the API key must stay server-side.
 * Client components should fetch from /api/muninn/* proxy routes instead.
 *
 * MuninnDB REST API endpoints used:
 * - GET  /api/engrams?vault=V&limit=N&offset=N&tags=T  — paginated engram listing
 * - POST /api/activate { vault, context[], limit }      — semantic recall
 * - GET  /api/stats?vault=V                             — vault statistics
 * - GET  /api/session?vault=V&limit=N                   — session activity
 * - GET  /api/health                                    — connectivity check
 * - GET  /api/contradictions?vault=V                    — contradiction pairs
 * - POST /api/traverse { vault, start_id, ... }         — graph traversal
 * - POST /api/explain { vault, engram_id, query }       — scoring explanation
 * - POST /api/forget { vault, id }                      — engram deletion
 *
 * Composed (built from engrams + links primitives):
 * - findByEntity    — engrams by entity tag
 * - entity          — entity aggregate (engrams + links)
 * - entityTimeline  — chronological entity engrams
 * - entityClusters  — tag co-occurrence pairs
 * - exportGraph     — JSON-LD graph export
 */

import filter from 'lodash/filter'
import orderBy from 'lodash/orderBy'

import type {
    MuninnActivation,
    MuninnEngram,
    MuninnEntity,
    MuninnEntityCluster,
    MuninnEntityTimeline,
    MuninnExplainResult,
    MuninnSessionEntry,
    MuninnStatsResponse,
} from './muninn-types'

export type {
    MuninnActivation,
    MuninnEngram,
    MuninnEntity,
    MuninnEntityCluster,
    MuninnEntityTimeline,
    MuninnExplainResult,
    MuninnSessionEntry,
    MuninnStatsResponse,
}

const MUNINN_BASE_URL = process.env.MUNINN_DB_URL ?? 'http://127.0.0.1:8476'
const MUNINN_TIMEOUT = 10_000

/**
 * Loopback validation for MUNINN_DB_URL.
 *
 * Ensures requests are only sent to loopback addresses, preventing a
 * compromised env var from redirecting MuninnDB traffic to an external host.
 * Mirrors the pattern in src/hooks/__helpers/muninn.ts.
 */
const ALLOWED_ORIGINS = ['http://127.', 'http://localhost', 'http://[::1]']

const validateMuninnUrl = (url: string): boolean =>
    ALLOWED_ORIGINS.some((origin) => url.startsWith(origin))

/**
 * Resolve the API key for a specific MuninnDB vault.
 *
 * Lookup order:
 * 1. `MUNINN_DB_<VAULT_SCREAMING_SNAKE>_API_KEY` (e.g., MUNINN_DB_PERCENT_UI_API_KEY)
 * 2. `MUNINN_DB_API_KEY` (generic fallback)
 * 3. Empty string (no auth — local development)
 *
 * @param vault - Vault name (e.g., "default", "percent-ui")
 * @returns The resolved API key string
 */
function resolveVaultApiKey(vault?: string): string {
    if (vault) {
        const envKey = `MUNINN_DB_${vault.toUpperCase().replace(/-/g, '_')}_API_KEY`
        const vaultKey = process.env[envKey]
        if (vaultKey) return vaultKey
    }
    return process.env.MUNINN_DB_API_KEY ?? ''
}

// -- Response types unique to server-side ----------------------------------

export interface MuninnHealthResponse {
    status: string
    version: string
    uptime_seconds: number
    db_writable: boolean
}

// -- Client ----------------------------------------------------------------

/**
 * Lightweight MuninnDB REST client (server-side only).
 *
 * Uses the MuninnDB HTTP API directly instead of the unpublished @muninndb/client
 * SDK. Provides the same functionality needed by the Route Handler proxy layer.
 */
export interface MuninnClient {
    listEngrams(
        vault: string,
        limit?: number,
        offset?: number,
        tags?: string
    ): Promise<{ engrams: MuninnEngram[]; total: number }>

    activate(
        vault: string,
        context: string[],
        limit?: number
    ): Promise<{ activations: MuninnActivation[]; total_found: number }>

    stats(vault: string): Promise<MuninnStatsResponse>

    session(
        vault: string,
        limit?: number
    ): Promise<{ entries: MuninnSessionEntry[]; total: number }>

    health(): Promise<MuninnHealthResponse>

    contradictions(vault: string): Promise<{ contradictions: unknown[] }>

    traverse(
        vault: string,
        startId: string,
        maxHops?: number,
        maxNodes?: number,
        followEntities?: boolean,
        relTypes?: string[]
    ): Promise<{ nodes: unknown[]; edges: unknown[]; total_reachable: number }>

    explain(
        vault: string,
        engramId: string,
        query: string[]
    ): Promise<MuninnExplainResult>

    forget(vault: string, id: string): Promise<{ forgotten: boolean }>

    findByEntity(
        vault: string,
        entityName: string,
        limit?: number
    ): Promise<{ entity: string; engrams: unknown[]; count: number }>

    entity(vault: string, name: string, limit?: number): Promise<MuninnEntity>

    entityTimeline(
        vault: string,
        entityName: string,
        limit?: number
    ): Promise<MuninnEntityTimeline>

    entityClusters(
        vault: string,
        topN?: number,
        minCount?: number
    ): Promise<{ clusters: MuninnEntityCluster[]; count: number }>

    exportGraph(
        vault: string,
        format?: string,
        includeEngrams?: boolean
    ): Promise<{
        data: string
        node_count: number
        edge_count: number
        format: string
    }>
}

async function muninnFetch(
    path: string,
    init?: RequestInit,
    vault?: string
): Promise<Response> {
    if (!validateMuninnUrl(MUNINN_BASE_URL)) {
        return Promise.reject(
            new Error(
                'MUNINN_DB_URL must be a loopback address (127.x.x.x, localhost, or [::1])'
            )
        )
    }
    const url = `${MUNINN_BASE_URL}${path}`
    const vaultKey = resolveVaultApiKey(vault)
    const genericKey = process.env.MUNINN_DB_API_KEY ?? ''

    const doFetch = async (apiKey: string): Promise<Response> => {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            ...(init?.headers as Record<string, string>),
        }
        if (apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`
        }
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), MUNINN_TIMEOUT)
        try {
            return await fetch(url, {
                ...init,
                headers,
                signal: controller.signal,
            })
        } finally {
            clearTimeout(timeout)
        }
    }

    // Try vault-specific key first
    const res = await doFetch(vaultKey)

    // If vault key fails with 401 and a different generic key exists, retry with it
    if (res.status === 401 && genericKey && genericKey !== vaultKey) {
        return doFetch(genericKey)
    }

    return res
}

function createMuninnClient(): MuninnClient {
    return {
        async listEngrams(vault, limit = 100, offset = 0, tags?) {
            let url = `/api/engrams?vault=${encodeURIComponent(vault)}&limit=${limit}&offset=${offset}`
            if (tags) url += `&tags=${encodeURIComponent(tags)}`
            const res = await muninnFetch(url, undefined, vault)
            if (!res.ok) throw new Error(`MuninnDB engrams: ${res.status}`)
            return res.json()
        },

        async activate(vault, context, limit = 20) {
            const res = await muninnFetch(
                '/api/activate',
                {
                    method: 'POST',
                    body: JSON.stringify({ vault, context, limit }),
                },
                vault
            )
            if (!res.ok) throw new Error(`MuninnDB activate: ${res.status}`)
            return res.json()
        },

        async stats(vault) {
            const res = await muninnFetch(
                `/api/stats?vault=${encodeURIComponent(vault)}`,
                undefined,
                vault
            )
            if (!res.ok) throw new Error(`MuninnDB stats: ${res.status}`)
            return res.json()
        },

        async session(vault, limit = 50) {
            const res = await muninnFetch(
                `/api/session?vault=${encodeURIComponent(vault)}&limit=${limit}`,
                undefined,
                vault
            )
            if (!res.ok) throw new Error(`MuninnDB session: ${res.status}`)
            return res.json()
        },

        async health() {
            const res = await muninnFetch('/api/health')
            if (!res.ok) throw new Error(`MuninnDB health: ${res.status}`)
            return res.json()
        },

        // -- Direct REST proxy methods (3) -----------------------------------------

        async contradictions(vault) {
            const res = await muninnFetch(
                `/api/contradictions?vault=${encodeURIComponent(vault)}`,
                undefined,
                vault
            )
            if (!res.ok)
                throw new Error(`MuninnDB contradictions: ${res.status}`)
            return res.json()
        },

        async traverse(
            vault,
            startId,
            maxHops = 2,
            maxNodes = 50,
            followEntities = true,
            relTypes?
        ) {
            const res = await muninnFetch(
                '/api/traverse',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        vault,
                        start_id: startId,
                        max_hops: maxHops,
                        max_nodes: maxNodes,
                        follow_entities: followEntities,
                        rel_types: relTypes,
                    }),
                },
                vault
            )
            if (!res.ok) throw new Error(`MuninnDB traverse: ${res.status}`)
            return res.json()
        },

        async explain(vault, engramId, query) {
            const res = await muninnFetch(
                '/api/explain',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        vault,
                        engram_id: engramId,
                        query,
                    }),
                },
                vault
            )
            if (!res.ok) throw new Error(`MuninnDB explain: ${res.status}`)
            return res.json()
        },

        async forget(vault, id) {
            const res = await muninnFetch(
                '/api/forget',
                {
                    method: 'POST',
                    body: JSON.stringify({ vault, id }),
                },
                vault
            )
            if (!res.ok) throw new Error(`MuninnDB forget: ${res.status}`)
            return res.json()
        },

        // -- Composed methods (5) --------------------------------------------------

        async findByEntity(vault, entityName, limit = 50) {
            const res = await muninnFetch(
                `/api/engrams?vault=${encodeURIComponent(vault)}&tags=${encodeURIComponent(entityName)}&limit=${limit}`,
                undefined,
                vault
            )
            if (!res.ok) throw new Error(`MuninnDB findByEntity: ${res.status}`)
            const data = (await res.json()) as {
                engrams?: Record<string, unknown>[]
            }
            return {
                entity: entityName,
                engrams: (data.engrams ?? []).map((e) => ({
                    id: e.id as string,
                    concept: e.concept as string,
                    summary: (e.content as string) ?? '',
                    state: (e.state as string) ?? 'active',
                })),
                count: data.engrams?.length ?? 0,
            }
        },

        async entity(vault, name, limit = 20) {
            const engramsRes = await muninnFetch(
                `/api/engrams?vault=${encodeURIComponent(vault)}&tags=${encodeURIComponent(name)}&limit=${limit}`,
                undefined,
                vault
            )
            if (!engramsRes.ok)
                throw new Error(`MuninnDB entity engrams: ${engramsRes.status}`)
            const engramsData = (await engramsRes.json()) as {
                engrams?: Record<string, unknown>[]
            }
            const engrams = engramsData.engrams ?? []

            let relationships: unknown[] = []
            if (engrams.length > 0) {
                try {
                    const engramId = engrams[0]!.id as string
                    if (!engramId || !/^[a-zA-Z0-9_-]+$/.test(engramId)) {
                        // Skip links fetch — invalid engram ID
                    } else {
                        const linksRes = await muninnFetch(
                            `/api/engrams/${engramId}/links`,
                            undefined,
                            vault
                        )
                        if (linksRes.ok) {
                            const linksData = (await linksRes.json()) as Record<
                                string,
                                unknown
                            >
                            relationships =
                                (linksData.associations as unknown[]) ??
                                (linksData.links as unknown[]) ??
                                []
                        }
                    }
                } catch {
                    /* links fetch is best-effort */
                }
            }

            return {
                name,
                type: 'unknown',
                confidence: 1,
                state: 'active',
                mention_count: engrams.length,
                first_seen:
                    engrams.length > 0
                        ? (engrams[engrams.length - 1]!.created_at as string)
                        : null,
                updated_at:
                    engrams.length > 0
                        ? (engrams[0]!.created_at as string)
                        : null,
                engrams: engrams.map((e) => ({
                    id: e.id as string,
                    concept: e.concept as string,
                    created_at: e.created_at as string,
                })),
                relationships,
                co_occurring: [],
            }
        },

        async entityTimeline(vault, entityName, limit = 50) {
            const engramsRes = await muninnFetch(
                `/api/engrams?vault=${encodeURIComponent(vault)}&tags=${encodeURIComponent(entityName)}&limit=${limit}`,
                undefined,
                vault
            )
            if (!engramsRes.ok)
                throw new Error(`MuninnDB entityTimeline: ${engramsRes.status}`)
            const data = (await engramsRes.json()) as {
                engrams?: Record<string, unknown>[]
            }
            const engrams = data.engrams ?? []

            const sorted = orderBy(
                engrams,
                (e) => new Date(e.created_at as string).getTime(),
                'asc'
            )

            return {
                entity: entityName,
                first_seen:
                    sorted.length > 0
                        ? (sorted[0]!.created_at as string)
                        : null,
                mention_count: sorted.length,
                timeline: sorted.map((e) => ({
                    engram_id: e.id as string,
                    concept: e.concept as string,
                    created_at: e.created_at as string,
                    summary: (e.content as string) ?? '',
                })),
                count: sorted.length,
            }
        },

        async entityClusters(vault, topN = 20, minCount = 2) {
            const res = await muninnFetch(
                `/api/engrams?vault=${encodeURIComponent(vault)}&limit=1000`,
                undefined,
                vault
            )
            if (!res.ok)
                throw new Error(`MuninnDB entityClusters: ${res.status}`)
            const data = (await res.json()) as {
                engrams?: Array<{ tags?: string[] }>
            }
            const engrams = data.engrams ?? []

            const pairCounts = new Map<string, number>()
            for (const engram of engrams) {
                const tags: string[] = engram.tags ?? []
                for (let i = 0; i < tags.length; i++) {
                    for (let j = i + 1; j < tags.length; j++) {
                        const pair = [tags[i]!, tags[j]!].sort().join('|||')
                        pairCounts.set(pair, (pairCounts.get(pair) ?? 0) + 1)
                    }
                }
            }

            const filtered = filter(
                Array.from(pairCounts.entries()),
                ([, count]) => count >= minCount
            )
            const clusters = orderBy(filtered, ([, count]) => count, 'desc')
                .slice(0, topN)
                .map(([pair, count]) => {
                    const [entity_a, entity_b] = pair.split('|||')
                    return {
                        entity_a: entity_a!,
                        entity_b: entity_b!,
                        count,
                    }
                })

            return { clusters, count: clusters.length }
        },

        async exportGraph(vault, format = 'json-ld', includeEngrams = false) {
            const res = await muninnFetch(
                `/api/engrams?vault=${encodeURIComponent(vault)}&limit=1000`,
                undefined,
                vault
            )
            if (!res.ok) throw new Error(`MuninnDB exportGraph: ${res.status}`)
            const data = (await res.json()) as {
                engrams?: Array<{
                    id: string
                    concept: string
                    created_at: string
                    tags?: string[]
                }>
            }
            const engrams = data.engrams ?? []

            const entitySet = new Set<string>()
            for (const engram of engrams) {
                for (const tag of engram.tags ?? []) {
                    entitySet.add(tag)
                }
            }

            const graph: Record<string, unknown>[] = Array.from(entitySet).map(
                (name) => ({
                    '@id': `entity:${name}`,
                    '@type': 'Entity',
                    name,
                })
            )

            if (includeEngrams) {
                for (const engram of engrams) {
                    graph.push({
                        '@id': `engram:${engram.id}`,
                        '@type': 'Engram',
                        concept: engram.concept,
                        created_at: engram.created_at,
                    })
                }
            }

            const jsonLd = JSON.stringify({
                '@context': { '@vocab': 'https://muninndb.com/schema/' },
                '@graph': graph,
            })

            return {
                data: jsonLd,
                node_count:
                    entitySet.size + (includeEngrams ? engrams.length : 0),
                edge_count: 0,
                format,
            }
        },
    }
}

/** Singleton MuninnDB client (server-side only). */
let _client: MuninnClient | null = null

/**
 * Returns a singleton MuninnDB client.
 *
 * API key resolution per vault (checked in order):
 * 1. MUNINN_DB_<VAULT_SCREAMING_SNAKE>_API_KEY (e.g., MUNINN_DB_PERCENT_UI_API_KEY)
 * 2. MUNINN_DB_API_KEY (generic fallback)
 * 3. No auth (local development where MuninnDB has no auth)
 */
export function getMuninnClient(): MuninnClient {
    if (!_client) {
        _client = createMuninnClient()
    }
    return _client
}
