/**
 * Write-surface handler: `luca state set-current-phase`.
 *
 * Positions `currentPhase` directly to a given 1-based phase number and marks
 * that phase `in-progress`. This is the missing RECOVERY primitive (v13 run
 * report M2): `luca roadmap create` always activates phase 1, and the only
 * forward motion is `luca phase advance` (+1, allowed only at the `learn`
 * step) — so after a wiped/mispositioned roadmap there was no way to jump
 * `currentPhase` back to N without walking the pipeline to `learn` once per
 * phase. This command sets it in one shot.
 *
 * Lock-serialized + strict via `mutateState` (a concurrent agent cannot revert
 * it mid-write). Phase-agnostic: usable in any pipelineStep, including right
 * after `roadmap create` (idle/triage) during recovery.
 *
 * Deliberately surgical — it moves the pointer and marks the target phase
 * in-progress; it does NOT rewrite the status of the other phases (the
 * caller's roadmap statuses, or the natural lifecycle, own those).
 */
import { stringifyError } from '@alecsibilia/luca-core'

import { z, type ToolDescriptor } from '../__schemas/write-surface.schemas.ts'
import { mutateState } from '../helpers/mutate-state.ts'

const inputSchema = z.object({
    currentPhase: z
        .number()
        .int()
        .positive()
        .describe(
            'Target phase number (1-based). Must be within 1..totalPhases.'
        ),
})

export const lucaStateSetCurrentPhaseTool: ToolDescriptor<
    z.infer<typeof inputSchema>
> = {
    name: 'luca_state_set_current_phase',
    description:
        'Set currentPhase directly to a 1-based phase number and mark that ' +
        'phase in-progress. Recovery primitive for restoring position after a ' +
        'roadmap reset/wipe. Errors if there is no roadmap or the number is ' +
        'out of range.',
    inputSchema,
    async handler({ currentPhase }, ctx) {
        let total!: number
        try {
            await mutateState(ctx.cwd, (state) => {
                total = state.totalPhases
                if (total === 0) {
                    throw new Error(
                        'no roadmap to position into (totalPhases=0). Create one first (`luca roadmap create`).'
                    )
                }
                if (currentPhase > total) {
                    throw new Error(
                        `currentPhase must be within 1..${total} (got ${currentPhase}).`
                    )
                }
                const roadmap = state.roadmap.map((phase, index) =>
                    index === currentPhase - 1
                        ? { ...phase, status: 'in-progress' as const }
                        : phase
                )
                return { ...state, currentPhase, roadmap }
            })
        } catch (err) {
            return {
                content: [
                    {
                        type: 'text' as const,
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
                    text: `currentPhase set to ${currentPhase} of ${total} (marked in-progress)`,
                },
            ],
        }
    },
}
