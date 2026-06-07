import { muninnProxyHandler, parseQueryParams } from '~/lib/muninn-route-helper'
import {
    EntityTimelineQuerySchema,
    EntityTimelineResponseSchema,
} from '~/lib/muninn-schemas'

/**
 * GET /api/muninn/entity/[name]/timeline
 *
 * Returns chronologically sorted engrams for a named entity.
 * The entity name comes from the dynamic path segment.
 *
 * Query params:
 * - vault (default: "default")
 * - limit (default: 50) -- max timeline entries
 */
export async function GET(
    request: Request,
    { params }: { params: Promise<{ name: string }> }
) {
    const { name } = await params

    const { searchParams } = new URL(request.url)
    const result = parseQueryParams(searchParams, EntityTimelineQuerySchema)
    if (!result.success) return result.response

    const { vault, limit } = result.data

    return muninnProxyHandler(
        (client) =>
            client.entityTimeline(vault, decodeURIComponent(name), limit),
        'Failed to fetch entity timeline from MuninnDB',
        EntityTimelineResponseSchema
    )
}
