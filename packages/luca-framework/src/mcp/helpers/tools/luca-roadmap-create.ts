import { join } from 'node:path'

import {
    lucaRootPaths,
    RoadmapPhaseSchema,
    type RoadmapPhase,
} from '@alecsibilia/luca-core'

import { loadCurrentState } from '../../../hook/helpers/load-current-state.ts'
import { z, type ToolDescriptor } from '../../schemas.ts'
import { writeAtomicFile } from '../write-atomic.ts'

const inputSchema = z.object({
    phases: z
        .array(RoadmapPhaseSchema)
        .min(1)
        .describe(
            'Ordered list of roadmap phases. Each entry: { name, deps?, status?, complexity? }. Defaults: deps=[], status=pending.',
        ),
})

/**
 * Replace the roadmap[] array in .luca/state.json with the supplied
 * phases. totalPhases is set to phases.length; currentPhase is reset to
 * 0 (no active phase — orchestrator will advance to phase 1 on the next
 * triage→research transition).
 *
 * Restricted to `idle` and `triage` pipelineSteps so a mid-execution
 * orchestrator cannot accidentally clobber an in-progress roadmap.
 * Other state fields (sessionId, oversight, iteration counters, etc.)
 * are preserved verbatim.
 */
export const lucaRoadmapCreateTool: ToolDescriptor<
    z.infer<typeof inputSchema>
> = {
    name: 'luca_roadmap_create',
    description:
        'Replace the roadmap in .luca/state.json with a new ordered list of phases. Resets currentPhase to 0; updates totalPhases. Only callable in idle or triage pipelineSteps so an active roadmap cannot be clobbered mid-execution.',
    inputSchema,
    allowedPhases: ['idle', 'triage'],
    async handler(args, ctx) {
        const state = await loadCurrentState({ cwd: ctx.cwd })

        const phases: RoadmapPhase[] = args.phases.map((p) => ({
            ...p,
            deps: p.deps ?? [],
            status: p.status ?? 'pending',
        }))

        const next = {
            ...state,
            roadmap: phases,
            totalPhases: phases.length,
            currentPhase: 0,
        }

        const absPath = join(ctx.cwd, lucaRootPaths.state)
        await writeAtomicFile(absPath, JSON.stringify(next, null, 2) + '\n')

        return {
            content: [
                {
                    type: 'text',
                    text: `wrote .luca/state.json (roadmap replaced with ${phases.length} phase(s); currentPhase reset to 0)`,
                },
            ],
        }
    },
}
