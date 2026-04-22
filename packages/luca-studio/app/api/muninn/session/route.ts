import { muninnProxyHandler, parseQueryParams } from '~/lib/muninn-route-helper'
import { SessionQuerySchema, SessionResponseSchema } from '~/lib/muninn-schemas'

/**
 * GET /api/muninn/session
 *
 * Proxies MuninnDB session activity. Accepts optional query params:
 * - vault (default: "default")
 * - limit (default: 50)
 */
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const result = parseQueryParams(searchParams, SessionQuerySchema)
    if (!result.success) return result.response

    const { vault, limit } = result.data

    return muninnProxyHandler(
        (client) => client.session(vault, limit),
        'Failed to fetch MuninnDB session data',
        SessionResponseSchema
    )
}
