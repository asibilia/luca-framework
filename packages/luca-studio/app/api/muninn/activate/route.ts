import { NextResponse } from 'next/server'

import { muninnProxyHandler } from '~/lib/muninn-route-helper'
import {
    ActivateRequestSchema,
    ActivateResponseSchema,
} from '~/lib/muninn-schemas'

/**
 * POST /api/muninn/activate
 *
 * Proxies MuninnDB semantic recall (activate). Accepts JSON body:
 * - context: string[] (required) -- search terms for semantic recall
 * - vault: string (default: "default")
 * - limit: number (default: 20)
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

    const parsed = ActivateRequestSchema.safeParse(body)
    if (!parsed.success) {
        return NextResponse.json(
            { error: parsed.error.issues.map((i) => i.message).join('; ') },
            { status: 400 }
        )
    }

    const { vault, context, limit } = parsed.data

    return muninnProxyHandler(
        (client) => client.activate(vault, context, limit),
        'Failed to activate MuninnDB recall',
        ActivateResponseSchema
    )
}
