import { muninnProxyHandler } from '~/lib/muninn-route-helper'
import { HealthResponseSchema } from '~/lib/muninn-schemas'

/**
 * GET /api/muninn/health
 *
 * Proxies MuninnDB health status. No query parameters needed —
 * health is a global (vault-agnostic) endpoint.
 */
export async function GET() {
    return muninnProxyHandler(
        (client) => client.health(),
        'Failed to fetch MuninnDB health',
        HealthResponseSchema
    )
}
