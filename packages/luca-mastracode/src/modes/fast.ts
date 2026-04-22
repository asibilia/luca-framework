/**
 * Fast mode — stock speed-optimized mode.
 *
 * Lightweight mode for quick edits and direct answers.
 * Uses a faster model to minimize latency.
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

function loadInstructions(): string {
    return readFileSync(
        join(__dirname, '..', 'instructions', 'fast.md'),
        'utf-8'
    )
}

export function buildFastInstructions(): string {
    return loadInstructions()
}

export function resolveFastModel(): string {
    return 'anthropic/claude-sonnet-4-6'
}

export const fastMode = {
    id: 'fast' as const,
    name: 'Fast',
    description: 'Speed-optimized mode for quick edits and direct answers.',
    color: '#fdac53',
    defaultModelId: 'anthropic/claude-sonnet-4-6',
    buildInstructions: buildFastInstructions,
    resolveModel: resolveFastModel,
}
