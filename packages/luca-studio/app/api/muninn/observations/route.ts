import { filterByConceptPrefix } from '~/lib/muninn-helpers'
import { muninnProxyHandler, parseQueryParams } from '~/lib/muninn-route-helper'
import {
    ObservationsQuerySchema,
    ObservationsResponseSchema,
} from '~/lib/muninn-schemas'

/**
 * GET /api/muninn/observations
 *
 * Recalls recent session:observation-* engrams from MuninnDB.
 *
 * Fetches engrams without a tag filter (MuninnDB tags do exact matching,
 * not prefix matching), then filters client-side using concept.startsWith().
 *
 * Accepts optional query params:
 * - vault (default: "default")
 * - limit (default: 50)
 */
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const result = parseQueryParams(searchParams, ObservationsQuerySchema)
    if (!result.success) return result.response

    const { vault, limit } = result.data

    return muninnProxyHandler(
        async (client) => {
            const observations = await filterByConceptPrefix(
                client,
                vault,
                ['session:observation'],
                limit
            )
            return {
                observations,
                total: observations.length,
            }
        },
        'Failed to fetch MuninnDB observations',
        ObservationsResponseSchema
    )
}
