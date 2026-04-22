import { resolveEntityType } from '~/lib/graph-types'
import type { EntityType } from '~/lib/graph-types'
import { muninnProxyHandler, parseQueryParams } from '~/lib/muninn-route-helper'
import {
    GraphDataQuerySchema,
    GraphDataResponseSchema,
} from '~/lib/muninn-schemas'
import type { MuninnEngram, MuninnEntityCluster } from '~/lib/muninn-types'

/**
 * Aggregate entity data from engrams.
 *
 * Groups engrams by tag, resolves each entity's type, and computes
 * aggregate metadata (engram_count, first_seen, last_seen).
 */
interface EntityAggregate {
    name: string
    type: EntityType
    engram_count: number
    first_seen: number | null
    last_seen: number | null
}

function buildEntityAggregates(engrams: MuninnEngram[]): EntityAggregate[] {
    const entityMap = new Map<
        string,
        {
            type: EntityType
            count: number
            firstSeen: number | null
            lastSeen: number | null
        }
    >()

    for (const engram of engrams) {
        const tags: string[] = engram.tags ?? []
        const resolvedType = resolveEntityType(
            engram.memory_type,
            engram.concept
        )
        const ts = engram.created_at

        for (const tag of tags) {
            const existing = entityMap.get(tag)
            if (existing) {
                existing.count += 1
                // Assign the type from the most recent engram that references this entity
                // (but prefer non-"other" types)
                if (resolvedType !== 'other' || existing.type === 'other') {
                    existing.type = resolvedType
                }
                if (
                    existing.firstSeen === null ||
                    (ts !== null && ts < existing.firstSeen)
                ) {
                    existing.firstSeen = ts
                }
                if (
                    existing.lastSeen === null ||
                    (ts !== null && ts > existing.lastSeen)
                ) {
                    existing.lastSeen = ts
                }
            } else {
                entityMap.set(tag, {
                    type: resolvedType,
                    count: 1,
                    firstSeen: ts ?? null,
                    lastSeen: ts ?? null,
                })
            }
        }
    }

    const aggregates: EntityAggregate[] = []
    for (const [name, data] of entityMap) {
        aggregates.push({
            name,
            type: data.type,
            engram_count: data.count,
            first_seen: data.firstSeen,
            last_seen: data.lastSeen,
        })
    }

    return aggregates
}

/**
 * Build graph links from entity cluster co-occurrence data.
 *
 * Filters to only include links where both endpoints exist in the entity set.
 */
function buildGraphLinks(
    clusters: MuninnEntityCluster[],
    entityNames: Set<string>
): Array<{ source: string; target: string; weight: number }> {
    const links: Array<{ source: string; target: string; weight: number }> = []

    for (const cluster of clusters) {
        if (
            entityNames.has(cluster.entity_a) &&
            entityNames.has(cluster.entity_b)
        ) {
            links.push({
                source: cluster.entity_a,
                target: cluster.entity_b,
                weight: cluster.count,
            })
        }
    }

    return links
}

/**
 * GET /api/muninn/graph-data
 *
 * Returns nodes + links for the Knowledge Graph Explorer. Builds the graph
 * by combining engram tag data (for nodes) with entity cluster co-occurrence
 * data (for links).
 *
 * This is the dedicated graph route that fixes the exportGraph JSON-LD
 * limitation (which returns zero edges).
 *
 * Query params:
 * - vault (default: "default")
 * - limit (default: 500, max: 2000) -- max engrams to fetch
 */
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const result = parseQueryParams(searchParams, GraphDataQuerySchema)
    if (!result.success) return result.response

    const { vault, limit } = result.data

    return muninnProxyHandler(
        async (client) => {
            // Fetch engrams and clusters in parallel
            const [engramsResult, clustersResult] = await Promise.all([
                client.listEngrams(vault, limit),
                client.entityClusters(vault, 100, 1),
            ])

            const engrams = (engramsResult.engrams ?? []) as MuninnEngram[]
            const clusters = (clustersResult.clusters ??
                []) as MuninnEntityCluster[]

            // Build entity nodes from engram tags
            const entityAggregates = buildEntityAggregates(engrams)

            const nodes = entityAggregates.map((entity) => ({
                id: entity.name,
                name: entity.name,
                type: entity.type,
                engram_count: entity.engram_count,
                first_seen: entity.first_seen,
                last_seen: entity.last_seen,
                is_cluster: false,
                child_count: 0,
                val: Math.max(1, Math.log2(entity.engram_count + 1)),
            }))

            // Build links from cluster co-occurrence data
            const entityNames = new Set(entityAggregates.map((e) => e.name))
            const links = buildGraphLinks(clusters, entityNames)

            return {
                nodes,
                links,
                total_nodes: nodes.length,
                total_links: links.length,
            }
        },
        'Failed to build graph data from MuninnDB',
        GraphDataResponseSchema
    )
}
