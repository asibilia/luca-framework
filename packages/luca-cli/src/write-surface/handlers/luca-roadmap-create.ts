import {
    lucaStateSchema,
    RoadmapPhaseSchema,
    stringifyError,
    type RoadmapPhase,
} from '@alecsibilia/luca-core'

import { z, type ToolDescriptor } from '../__schemas/write-surface.schemas.ts'
import { mutateState } from '../helpers/mutate-state.ts'

const inputSchema = z.object({
    phases: z
        .array(RoadmapPhaseSchema)
        .min(1)
        .describe(
            'Ordered list of roadmap phases. Each entry: { name, deps?, status?, complexity? }. Defaults: deps=[], status=pending.'
        ),
})

/**
 * Replace the roadmap[] array in .luca/state.json with the supplied
 * phases. totalPhases is set to phases.length; currentPhase is set to
 * **1** (the first phase activates immediately) when the roadmap is
 * non-empty, or 0 when it is empty.
 *
 * Why activate phase 1 here: once a roadmap exists there is always a
 * "current phase", and `resolveActiveSlug` treats `currentPhase===0` as
 * "no active phase" — so it can compute no canonical `.luca/phases/<slug>/`
 * path. With currentPhase pinned at 0 and no command anywhere to advance
 * it, the stage-gate hook had no legal artifact path to allow, and the
 * very first phase artifact write (e.g. `research.md`) deadlocked: the
 * Write was blocked as code-write and a raw `mkdir` was blocked as
 * bash-mutate, with no channel to create the phase. Activating phase 1 on
 * roadmap creation closes that chicken-and-egg.
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
        'Replace the roadmap in .luca/state.json with a new ordered list of phases. Activates phase 1 (currentPhase=1) when non-empty; updates totalPhases. Only callable in idle or triage pipelineSteps so an active roadmap cannot be clobbered mid-execution.',
    inputSchema,
    allowedPhases: ['idle', 'triage'],
    async handler(args, ctx) {
        const phases: RoadmapPhase[] = args.phases.map((p) => ({
            ...p,
            deps: p.deps ?? [],
            status: p.status ?? 'pending',
        }))
        const currentPhase = phases.length > 0 ? 1 : 0

        try {
            // Serialized under the state lock so the roadmap replacement +
            // phase-1 activation cannot race a concurrent state write.
            //
            // bootstrapIfMissing: `roadmap create` is a legitimate bootstrap
            // entry point (it activates the first phase to break the
            // currentPhase=0 chicken-and-egg) and may run before `luca init`
            // has written state.json. Seed an absent file from schema defaults
            // under the lock; a present-but-truncated file still throws.
            await mutateState(
                ctx.cwd,
                (state) => ({
                    ...state,
                    roadmap: phases,
                    totalPhases: phases.length,
                    currentPhase,
                }),
                { bootstrapIfMissing: lucaStateSchema.parse({}) }
            )
        } catch (err) {
            return {
                content: [
                    {
                        type: 'text',
                        text: stringifyError(err),
                    },
                ],
                isError: true,
            }
        }

        return {
            content: [
                {
                    type: 'text',
                    text: `wrote .luca/state.json (roadmap replaced with ${phases.length} phase(s); currentPhase=${currentPhase})`,
                },
            ],
        }
    },
}
