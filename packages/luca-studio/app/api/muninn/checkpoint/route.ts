import { access, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import { NextResponse } from 'next/server'
import { z } from 'zod'

import { CheckpointResponseSchema } from '~/lib/muninn-schemas'

/**
 * Walk up from startDir looking for a directory containing `.planning/`.
 * Returns the first match, or null if none found.
 */
async function findProjectRoot(startDir: string): Promise<string | null> {
    let current = resolve(startDir)
    const root = resolve('/')
    while (current !== root) {
        try {
            await access(join(current, '.planning'))
            return current
        } catch {
            /* not found at this level, keep walking up */
        }
        current = resolve(current, '..')
    }
    return null
}

/**
 * Context metrics schema — mirrors the shape written by the statusline
 * and context-monitor hooks to `.planning/.context-metrics.json`.
 *
 * Uses snake_case for API-facing fields per project convention.
 */
const ContextMetricsSchema = z.object({
    zone: z.enum(['peak', 'good', 'degrading', 'stop']),
    usage_percent: z.number().min(0).max(100),
    checked_at: z.string(),
    context_window_size: z.number().int().min(0).optional(),
    total_input_tokens: z.number().int().min(0).optional(),
    total_output_tokens: z.number().int().min(0).optional(),
    cache_read_input_tokens: z.number().int().min(0).optional(),
    transcript_bytes: z.number().int().min(0).optional(),
    source: z.enum(['statusline', 'transcript_heuristic']).optional(),
    thresholds: z
        .object({
            warn_bytes: z.number(),
            alert_bytes: z.number(),
            critical_bytes: z.number(),
        })
        .optional(),
})

/**
 * GET /api/muninn/checkpoint
 *
 * Reads .planning/.context-metrics.json from the project root.
 * This is NOT a MuninnDB proxy — it reads a local file written by
 * the statusline hook (every ~60 seconds) or context-monitor hook.
 *
 * Returns 200 always — file missing means no session data yet (not an error).
 *
 * Workspace root resolution: LUCA_PROJECT_DIR > WORKSPACE_ROOT > findProjectRoot(cwd)
 */
export async function GET() {
    const defaultResponse = {
        zone: null,
        usage_percent: null,
        checked_at: null,
        observation_count: 0,
        checkpoint_age_seconds: null,
    }

    try {
        const rawRoot =
            process.env.LUCA_PROJECT_DIR || process.env.WORKSPACE_ROOT
        const explicitRoot = rawRoot ? resolve(rawRoot) : null
        const workspaceRoot =
            explicitRoot ||
            (await findProjectRoot(process.cwd())) ||
            process.cwd()
        const filePath = join(
            workspaceRoot,
            '.planning',
            '.context-metrics.json'
        )

        const raw = await readFile(filePath, 'utf-8')
        let parsed: unknown
        try {
            parsed = JSON.parse(raw)
        } catch {
            return NextResponse.json(defaultResponse)
        }

        // Parse with ContextMetricsSchema for the live data fields
        const metricsResult = ContextMetricsSchema.safeParse(parsed)
        if (!metricsResult.success) {
            console.error(
                '[checkpoint] Metrics validation failed:',
                metricsResult.error.message
            )
            return NextResponse.json(defaultResponse)
        }

        const metrics = metricsResult.data

        // Compute checkpoint_age_seconds from checked_at
        let checkpointAge: number | null = null
        if (metrics.checked_at) {
            const checkedMs = new Date(metrics.checked_at).getTime()
            if (!isNaN(checkedMs)) {
                checkpointAge = Math.floor((Date.now() - checkedMs) / 1000)
            }
        }

        const response = {
            zone: metrics.zone,
            usage_percent: metrics.usage_percent,
            checked_at: metrics.checked_at,
            observation_count: 0,
            checkpoint_age_seconds: checkpointAge,
        }

        // Validate through CheckpointResponseSchema before returning
        const result = CheckpointResponseSchema.safeParse(response)
        if (!result.success) {
            console.error(
                '[checkpoint] Response validation failed:',
                result.error.message
            )
            return NextResponse.json(defaultResponse)
        }

        return NextResponse.json(result.data)
    } catch {
        // File missing or unreadable — return safe defaults
        return NextResponse.json(defaultResponse)
    }
}
