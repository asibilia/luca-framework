import { phasePathFor } from '@alecsibilia/luca-core'

import { loadCurrentState } from '../../../hook/helpers/load-current-state.ts'
import { z, type ToolDescriptor } from '../../schemas.ts'

const inputSchema = z.object({})

/**
 * Convert a free-form name (e.g. "Auth Rewrite") into a kebab-case slug
 * suffix compatible with PHASE_SLUG_RE.
 */
function kebabCase(s: string): string {
    return s
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
}

export const lucaPhaseCurrentTool: ToolDescriptor<z.infer<typeof inputSchema>> =
    {
        name: 'luca_phase_current',
        description:
            'Return information about the currently active phase: { active, NN, slug, dir }. When no phase is active (currentPhase=0), returns { active: false }.',
        inputSchema,
        async handler(_args, ctx) {
            const state = await loadCurrentState({ cwd: ctx.cwd })

            if (state.currentPhase === 0) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({ active: false }, null, 2),
                        },
                    ],
                }
            }

            if (state.currentPhase < 1 || state.currentPhase > 99) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `currentPhase=${state.currentPhase} is out of range for the .luca/phases/<NN-slug>/ contract (1–99).`,
                        },
                    ],
                    isError: true,
                }
            }

            const roadmapEntry = state.roadmap[state.currentPhase - 1]
            if (!roadmapEntry) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `currentPhase=${state.currentPhase} has no matching entry in state.roadmap (length=${state.roadmap.length}). Update the roadmap before advancing.`,
                        },
                    ],
                    isError: true,
                }
            }

            const NN = String(state.currentPhase).padStart(2, '0')
            const slug = `${NN}-${kebabCase(roadmapEntry.name)}`
            const dir = phasePathFor(slug)

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(
                            { active: true, NN, slug, dir },
                            null,
                            2
                        ),
                    },
                ],
            }
        },
    }
