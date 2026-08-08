import {
    stringifyError,
    type LucaState,
    type RoadmapPhase,
} from '@alecsibilia/luca-core'

import { z, type ToolDescriptor } from '../__schemas/write-surface.schemas.ts'
import { mutateState } from '../helpers/mutate-state.ts'
import {
    applyPhaseDirMoves,
    removePhaseDirIfEmpty,
    slugAt,
    writeRoadmapMd,
    type PhaseDirMove,
} from '../helpers/roadmap-phases.ts'

const inputSchema = z.object({
    nn: z
        .number()
        .int()
        .min(1)
        .describe(
            'The 1-based phase number to remove. Must be AFTER the active phase — a completed or in-flight phase cannot be removed.'
        ),
})

/**
 * Remove one future phase from `state.roadmap`, RENUMBER every later phase,
 * rename their `.luca/phases/` directories, and regenerate `.luca/roadmap.md`.
 *
 * Renumbering is the honest choice: phase directories are addressed by
 * `<NN>-<slug>` and `resolveActiveSlug` derives `NN` from the roadmap INDEX,
 * so leaving a gap would desynchronize every later phase's directory from the
 * number the pipeline computes for it. Decimal numbering is not an escape
 * hatch either — `PHASE_SLUG_RE` rejects it.
 *
 * Guardrail: only phases strictly after `currentPhase` may be removed. The
 * active phase (and everything before it) is either in flight or already
 * shipped; removing it would renumber history out from under committed
 * artifacts.
 *
 * The removed phase's directory is deleted ONLY when empty. A directory
 * holding artifacts is preserved under its old name and reported back — this
 * is a roadmap operation, not a delete-my-work operation.
 *
 * Deliberately PHASE-AGNOSTIC (`[]` in WRITE_COMMAND_PHASES), same rationale
 * as `roadmap add-phase`: roadmap grooming happens mid-run, and the
 * active-phase guardrail above — not a pipelineStep restriction — is what
 * keeps it safe.
 */
export const lucaRoadmapRemovePhaseTool: ToolDescriptor<
    z.infer<typeof inputSchema>
> = {
    name: 'luca_roadmap_remove_phase',
    description:
        'Remove one FUTURE phase (nn > currentPhase) from the roadmap in .luca/state.json, RENUMBER every later phase, rename their .luca/phases/ directories, and regenerate .luca/roadmap.md. The removed phase directory is deleted only if empty. Callable in every pipelineStep.',
    inputSchema,
    async handler(args, ctx) {
        let plan:
            | {
                  nn: string
                  slug: string
                  name: string
                  moves: PhaseDirMove[]
              }
            | undefined
        let nextState: LucaState

        try {
            nextState = await mutateState(ctx.cwd, (state) => {
                if (args.nn > state.roadmap.length) {
                    throw new Error(
                        `nn=${args.nn} is out of range: the roadmap has ${state.roadmap.length} phase(s).`
                    )
                }
                if (args.nn <= state.currentPhase) {
                    throw new Error(
                        `refusing to remove phase ${args.nn}: it is at or before the active phase (currentPhase=${state.currentPhase}). Only future phases can be removed, because renumbering a completed or in-flight phase would desynchronize its committed artifacts from its directory.`
                    )
                }

                const removeIndex = args.nn - 1
                const removedEntry = state.roadmap[removeIndex]!
                const removed = slugAt(state, state.roadmap, args.nn)
                if (!removed.ok) throw new Error(removed.error)

                const roadmap: RoadmapPhase[] = [
                    ...state.roadmap.slice(0, removeIndex),
                    ...state.roadmap.slice(removeIndex + 1),
                ]

                // Renumbering moves: every phase after the removed one shifts
                // down. Applied lowest-first so a rename never lands on an
                // occupied destination.
                const moves: PhaseDirMove[] = []
                for (let j = removeIndex; j < roadmap.length; j += 1) {
                    const from = slugAt(state, state.roadmap, j + 2)
                    const to = slugAt(state, roadmap, j + 1)
                    if (!from.ok || !to.ok) continue
                    moves.push({ from: from.slug, to: to.slug })
                }

                plan = {
                    nn: removed.NN,
                    slug: removed.slug,
                    name: removedEntry.name,
                    moves,
                }

                // currentPhase is strictly less than the removed position
                // (guarded above), so it never moves.
                return {
                    ...state,
                    roadmap,
                    totalPhases: roadmap.length,
                }
            })
        } catch (err) {
            return {
                content: [{ type: 'text', text: stringifyError(err) }],
                isError: true,
            }
        }

        if (!plan) {
            return {
                content: [
                    {
                        type: 'text',
                        text: 'internal error: roadmap remove-phase produced no plan',
                    },
                ],
                isError: true,
            }
        }

        let renamed: PhaseDirMove[]
        let removedDir: string | null
        try {
            // Free the removed slot BEFORE the shift-down renames, otherwise
            // the first rename lands on an occupied destination.
            removedDir = await removePhaseDirIfEmpty(ctx.cwd, plan.slug)
            renamed = await applyPhaseDirMoves(ctx.cwd, plan.moves)
            await writeRoadmapMd(ctx.cwd, nextState)
        } catch (err) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `roadmap updated in .luca/state.json, but the filesystem reconciliation failed — ${stringifyError(
                            err
                        )}`,
                    },
                ],
                isError: true,
            }
        }

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(
                        {
                            removed: {
                                nn: plan.nn,
                                slug: plan.slug,
                                name: plan.name,
                            },
                            totalPhases: nextState.totalPhases,
                            currentPhase: nextState.currentPhase,
                            renamed,
                            removedDir,
                        },
                        null,
                        2
                    ),
                },
            ],
        }
    },
}
