/**
 * Build mode — stock interactive build mode.
 *
 * Full-access mode for implementing changes. This is the default mode
 * when the Luca pipeline is not active.
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

function loadInstructions(): string {
    return readFileSync(
        join(__dirname, '..', 'instructions', 'build.md'),
        'utf-8'
    )
}

export function buildBuildInstructions(): string {
    return loadInstructions()
}

export function resolveBuildModel(): string {
    return 'anthropic/claude-opus-4-7'
}

export const buildMode = {
    id: 'build' as const,
    name: 'Build',
    description: 'Full-access build mode for implementing changes.',
    color: '#16c858',
    defaultModelId: 'anthropic/claude-opus-4-7',
    buildInstructions: buildBuildInstructions,
    resolveModel: resolveBuildModel,
}
