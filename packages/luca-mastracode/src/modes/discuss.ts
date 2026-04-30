/**
 * Discuss mode — read-only brainstorming and conversation.
 *
 * Open-ended discussion without the expectation of producing a plan or
 * triggering pipeline transitions. Think of it as rubber-ducking with
 * codebase access.
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { MODES } from './mode-ids.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

function loadInstructions(): string {
    return readFileSync(
        join(__dirname, '..', 'instructions', 'discuss.md'),
        'utf-8'
    )
}

export function buildDiscussInstructions(): string {
    return loadInstructions()
}

export function resolveDiscussModel(): string {
    return 'anthropic/claude-sonnet-4-6'
}

export const discussMode = {
    id: MODES.discuss,
    name: 'luca: Discuss',
    description: 'Read-only brainstorming and open-ended discussion.',
    color: '#f59e0b',
    defaultModelId: 'anthropic/claude-sonnet-4-6',
    buildInstructions: buildDiscussInstructions,
    resolveModel: resolveDiscussModel,
}
