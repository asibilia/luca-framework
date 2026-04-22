import { muninnProxyHandler, parseQueryParams } from '~/lib/muninn-route-helper'
import {
    ContradictionsQuerySchema,
    ContradictionsResponseSchema,
} from '~/lib/muninn-schemas'

/**
 * GET /api/muninn/contradictions
 *
 * Proxies MuninnDB contradiction detection. Accepts optional query param:
 * - vault (default: "default")
 */
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const result = parseQueryParams(searchParams, ContradictionsQuerySchema)
    if (!result.success) return result.response

    const { vault } = result.data

    return muninnProxyHandler(
        (client) => client.contradictions(vault),
        'Failed to fetch contradictions from MuninnDB',
        ContradictionsResponseSchema
    )
}
