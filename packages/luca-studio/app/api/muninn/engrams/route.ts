import { muninnProxyHandler, parseQueryParams } from '~/lib/muninn-route-helper'
import { EngramsQuerySchema, EngramsResponseSchema } from '~/lib/muninn-schemas'
import type { MuninnEngram } from '~/lib/muninn-types'

/**
 * GET /api/muninn/engrams
 *
 * Proxies MuninnDB engram listing with optional filtering. Accepts query params:
 * - vault (default: "default")
 * - limit (default: 100)
 * - offset (default: 0)
 * - tag — server-side tag filter (passed to MuninnDB)
 * - type — client-side concept-prefix filter (matches engrams whose concept starts with `{type}:`)
 * - entity — client-side entity tag filter (searches engram tags)
 * - since — client-side timestamp filter (engrams created after this epoch)
 */
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const result = parseQueryParams(searchParams, EngramsQuerySchema)
    if (!result.success) return result.response

    const { vault, limit, offset, tag, type, entity, since } = result.data

    const hasClientFilters = type || entity || since

    return muninnProxyHandler(
        async (client) => {
            // When client-side filters are active, fetch more data to filter from.
            // The tag filter is server-side (passed to MuninnDB), so it narrows results first.
            const fetchLimit = hasClientFilters
                ? Math.min(limit * 5, 1000)
                : limit

            const data = await client.listEngrams(
                vault,
                fetchLimit,
                offset,
                tag
            )
            let engrams: MuninnEngram[] = data.engrams ?? []

            // Apply client-side filters
            if (type) {
                engrams = engrams.filter((e) =>
                    e.concept?.startsWith(type + ':')
                )
            }
            if (entity) {
                engrams = engrams.filter((e) => e.tags?.includes(entity))
            }
            if (since) {
                engrams = engrams.filter((e) => e.created_at >= since)
            }

            // Slice to requested limit after filtering
            if (hasClientFilters) {
                engrams = engrams.slice(0, limit)
            }

            return { engrams, total: engrams.length }
        },
        'Failed to fetch engrams from MuninnDB',
        EngramsResponseSchema
    )
}
