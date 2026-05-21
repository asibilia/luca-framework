import { loadCurrentState } from '@alecsibilia/luca-core'

import { z, type ToolDescriptor } from '../__schemas/write-surface.schemas.ts'

const inputSchema = z.object({})

/**
 * Return the roadmap[] array from .luca/state.json with light context
 * (currentPhase, totalPhases) so the caller can place each entry on
 * the timeline without a second state read.
 *
 * Pure read — no allowedPhases. Roadmap inspection is useful at every
 * step (e.g. discussion agents want to know what's upcoming; the
 * planner wants to know what's already done).
 */
export const lucaRoadmapReadTool: ToolDescriptor<z.infer<typeof inputSchema>> =
    {
        name: 'luca_roadmap_read',
        description:
            'Read the roadmap array from .luca/state.json, plus currentPhase and totalPhases for context. Each entry is { name, deps, status, complexity? }. Pure read — callable in every pipelineStep.',
        inputSchema,
        async handler(_args, ctx) {
            const state = await loadCurrentState({ cwd: ctx.cwd })

            const payload = {
                currentPhase: state.currentPhase,
                totalPhases: state.roadmap.length,
                roadmap: state.roadmap,
            }

            return {
                content: [
                    { type: 'text', text: JSON.stringify(payload, null, 2) },
                ],
            }
        },
    }
