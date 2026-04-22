import { NextResponse } from 'next/server'

import { muninnProxyHandler } from '~/lib/muninn-route-helper'
import { ForgetRequestSchema, ForgetResponseSchema } from '~/lib/muninn-schemas'

/**
 * POST /api/muninn/forget
 *
 * Proxies MuninnDB engram deletion (forget). Accepts JSON body:
 * - vault: string (default: "default")
 * - id: string (required) -- engram ID to forget
 */
export async function POST(request: Request) {
    let body: unknown
    try {
        body = await request.json()
    } catch {
        return NextResponse.json(
            { error: 'Invalid JSON body' },
            { status: 400 }
        )
    }

    const parsed = ForgetRequestSchema.safeParse(body)
    if (!parsed.success) {
        return NextResponse.json(
            { error: parsed.error.issues.map((i) => i.message).join('; ') },
            { status: 400 }
        )
    }

    const { vault, id } = parsed.data

    return muninnProxyHandler(
        (client) => client.forget(vault, id),
        'Failed to forget engram in MuninnDB',
        ForgetResponseSchema
    )
}
