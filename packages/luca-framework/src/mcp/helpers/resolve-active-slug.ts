import type { LucaState } from '@alecsibilia/luca-core'

function kebabCase(s: string): string {
    return s
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
}

export interface ResolveActiveSlugOk {
    ok: true
    NN: string
    slug: string
}
export interface ResolveActiveSlugFail {
    ok: false
    error: string
}
export type ResolveActiveSlugResult =
    | ResolveActiveSlugOk
    | ResolveActiveSlugFail

/**
 * Derive the active phase slug from workflow state. Returns an error
 * result (rather than throwing) so MCP tool handlers can surface a clean
 * isError result to the LLM.
 */
export function resolveActiveSlug(state: LucaState): ResolveActiveSlugResult {
    if (state.currentPhase === 0) {
        return {
            ok: false,
            error: 'no active phase (currentPhase=0). Advance the roadmap before writing phase artifacts.',
        }
    }
    if (state.currentPhase < 1 || state.currentPhase > 99) {
        return {
            ok: false,
            error: `currentPhase=${state.currentPhase} is out of range (1–99).`,
        }
    }
    const entry = state.roadmap[state.currentPhase - 1]
    if (!entry) {
        return {
            ok: false,
            error: `currentPhase=${state.currentPhase} has no matching roadmap entry. Update state.roadmap first.`,
        }
    }
    const NN = String(state.currentPhase).padStart(2, '0')
    const slug = `${NN}-${kebabCase(entry.name)}`
    return { ok: true, NN, slug }
}
