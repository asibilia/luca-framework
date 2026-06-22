import { stringifyError } from '@alecsibilia/luca-core'

import { z, type ToolDescriptor } from '../__schemas/write-surface.schemas.ts'
import { mutateState } from '../helpers/mutate-state.ts'

const inputSchema = z.object({})

/**
 * Advance the active roadmap phase by one: `currentPhase → currentPhase + 1`,
 * marking the completed phase `complete` and the next one `in-progress`.
 *
 * This closes the second half of the phase-lifecycle gap. `roadmap create`
 * activates phase 1, but nothing advanced `currentPhase` between phases, so a
 * multi-phase roadmap stalled at the phase-1→2 boundary (every phase-2 artifact
 * path resolved against the stale phase-1 slug, or none at all). The orchestrator
 * calls this at the phase boundary (the `learn` step) when more phases remain;
 * the final phase routes to the `finalize` step instead of advancing.
 *
 * Restricted to the `learn` pipelineStep — the canonical end-of-phase moment in
 * the `/lu` loop, just before advancing the step to `plan` for the next phase.
 */
export const lucaPhaseAdvanceTool: ToolDescriptor<z.infer<typeof inputSchema>> =
    {
        name: 'luca_phase_advance',
        description:
            'Advance the active roadmap phase by one (currentPhase → currentPhase+1), marking the completed phase `complete` and the next `in-progress`. Call at the phase boundary (learn step) when more phases remain; the final phase routes to the milestone step instead. Errors if no phase is active (currentPhase=0) or already at the final phase.',
        inputSchema,
        allowedPhases: ['learn'],
        async handler(_args, ctx) {
            let from!: number
            let total!: number
            try {
                // Serialized + strict under the state lock — a concurrent agent
                // cannot revert currentPhase mid-advance.
                await mutateState(ctx.cwd, (state) => {
                    const { currentPhase, totalPhases } = state
                    from = currentPhase
                    total = totalPhases
                    if (currentPhase === 0) {
                        throw new Error(
                            'no active phase to advance (currentPhase=0). Create a roadmap first (`luca roadmap create`).'
                        )
                    }
                    if (currentPhase >= totalPhases) {
                        throw new Error(
                            `already at the final phase (${currentPhase}/${totalPhases}); there is no next phase. Advance to the finalize step instead.`
                        )
                    }
                    // Mark the leaving phase complete, the entering phase
                    // in-progress. (Indices 0-based; currentPhase 1-based.)
                    const roadmap = state.roadmap.map((phase, index) => {
                        if (index === currentPhase - 1) {
                            return { ...phase, status: 'complete' as const }
                        }
                        if (index === currentPhase) {
                            return { ...phase, status: 'in-progress' as const }
                        }
                        return phase
                    })
                    return { ...state, roadmap, currentPhase: currentPhase + 1 }
                })
            } catch (err) {
                return errorResult(stringifyError(err))
            }

            return {
                content: [
                    {
                        type: 'text',
                        text: `phase advanced: ${from} → ${from + 1} of ${total} (phase ${from} marked complete, phase ${from + 1} in-progress)`,
                    },
                ],
            }
        },
    }

function errorResult(message: string) {
    return {
        content: [{ type: 'text' as const, text: message }],
        isError: true,
    }
}
