import { NextResponse } from 'next/server'

import { muninnProxyHandler } from '~/lib/muninn-route-helper'
import {
    FindByEntityRequestSchema,
    FindByEntityResponseSchema,
} from '~/lib/muninn-schemas'

/**
 * POST /api/muninn/find-by-entity
 *
 * Finds engrams associated with a named entity. Composed from MuninnDB
 * engrams endpoint using tag-based filtering.
 *
 * Accepts JSON body:
 * - entity_name: string (required) -- entity to search for
 * - vault: string (default: "default")
 * - limit: number (default: 50)
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

    const parsed = FindByEntityRequestSchema.safeParse(body)
    if (!parsed.success) {
        return NextResponse.json(
            { error: parsed.error.issues.map((i) => i.message).join('; ') },
            { status: 400 }
        )
    }

    const { vault, entity_name, limit } = parsed.data

    return muninnProxyHandler(
        (client) => client.findByEntity(vault, entity_name, limit),
        'Failed to find engrams by entity in MuninnDB',
        FindByEntityResponseSchema
    )
}
