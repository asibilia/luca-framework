import { muninnProxyHandler, parseQueryParams } from '~/lib/muninn-route-helper'
import { EntityQuerySchema, EntityResponseSchema } from '~/lib/muninn-schemas'

/**
 * GET /api/muninn/entity/[name]
 *
 * Returns an entity aggregate composed from MuninnDB engrams and links.
 * The entity name comes from the dynamic path segment.
 *
 * Query params:
 * - vault (default: "default")
 * - limit (default: 20) -- max engrams to include
 */
export async function GET(
    request: Request,
    { params }: { params: Promise<{ name: string }> }
) {
    const { name } = await params

    const { searchParams } = new URL(request.url)
    const result = parseQueryParams(searchParams, EntityQuerySchema)
    if (!result.success) return result.response

    const { vault, limit } = result.data

    return muninnProxyHandler(
        (client) => client.entity(vault, decodeURIComponent(name), limit),
        'Failed to fetch entity from MuninnDB',
        EntityResponseSchema
    )
}
