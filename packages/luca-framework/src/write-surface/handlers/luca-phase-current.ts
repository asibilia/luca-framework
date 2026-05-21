import {
    phasePathFor,
    loadCurrentState,
    resolveActiveSlug,
} from '@alecsibilia/luca-core'

import { z, type ToolDescriptor } from '../__schemas/write-surface.schemas.ts'

const inputSchema = z.object({})

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

            // Reuse the shared slug resolver — it owns range checks, roadmap
            // lookup, and slug validation, so this tool can't drift from the
            // write tools' slug logic or hand an invalid slug to phasePathFor.
            const resolved = resolveActiveSlug(state)
            if (!resolved.ok) {
                return {
                    content: [{ type: 'text', text: resolved.error }],
                    isError: true,
                }
            }

            const dir = phasePathFor(resolved.slug)

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(
                            {
                                active: true,
                                NN: resolved.NN,
                                slug: resolved.slug,
                                dir,
                            },
                            null,
                            2
                        ),
                    },
                ],
            }
        },
    }
