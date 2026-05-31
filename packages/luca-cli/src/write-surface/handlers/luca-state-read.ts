import { loadCurrentState } from '@alecsibilia/luca-core'

import { z, type ToolDescriptor } from '../__schemas/write-surface.schemas.ts'

const inputSchema = z.object({})

export const lucaStateReadTool: ToolDescriptor<z.infer<typeof inputSchema>> = {
    name: 'luca_state_read',
    description:
        'Read the current workflow state from .luca/state.json. Returns the parsed JSON including pipelineStep, currentPhase, iteration counters, and the roadmap.',
    inputSchema,
    // No allowedPhases — read-only tool available in every phase.
    async handler(_args, ctx) {
        const state = await loadCurrentState({ cwd: ctx.cwd })
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(state, null, 2),
                },
            ],
        }
    },
}
