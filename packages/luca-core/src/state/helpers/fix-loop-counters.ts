/**
 * Fix-loop counter write-back.
 *
 * The three fix-loop counters (`checksFixIteration`, `verifyIteration`,
 * `reviewIteration`) are LIVE: a rework advance increments its loop's counter,
 * and the loop's forward-exit advance zeroes it. This module computes the
 * post-transition value the `luca state advance` write path persists inside its
 * atomic `mutateState` write.
 *
 * HISTORY: this used to be a pair of machine `assign` actions
 * (`incFixLoop`/`resetFixLoop`) wired onto the 6 fix-loop edges, with the value
 * read back off the post-`transition()` machine context by `machineVerdict`.
 * The machine is gone; the counter arithmetic was always pure, so it moved here
 * verbatim. Behaviour is IDENTICAL — including the no-op-when-untracked rule
 * below, which is what `machineVerdict` surfaced as "counterUpdate present only
 * when the input carried that counter".
 */
import {
    FIX_LOOP_EDGES,
    type FixLoopCounter,
} from '../configs/fix-loop-edges.ts'
import type { PipelineStep } from '../schemas.ts'

/**
 * The post-transition value of the counter mutated on a fix-loop edge, ready
 * for the write path to persist. Produced only when the advance traversed one
 * of the 6 fix-loop edges AND the counter was tracked in the input.
 */
export interface CounterUpdate {
    field: FixLoopCounter
    value: number
}

/** The persisted fix-loop counters, as read off `.luca/state.json`. */
export type FixLoopCounters = Partial<Record<FixLoopCounter, number>>

/**
 * Compute the counter write-back for an advance across `from → to`.
 *
 * Returns `undefined` when:
 *  - the edge is not one of the 6 fix-loop edges, or
 *  - the edge's counter is NOT tracked in `counters` (`undefined`).
 *
 * The second rule is load-bearing: an untracked counter is never MINTED. The
 * live write path always seeds every counter (the `LucaState` schema defaults
 * each to 0), so production increments normally (0→1→2…); a caller that passes
 * a partial/empty counter bag (the runner's position mirror) gets no update
 * rather than a fabricated `1`.
 *
 * @param from - the current pipelineStep
 * @param to - the requested pipelineStep (assumed already validated as legal)
 * @param counters - the persisted counters
 */
export function fixLoopCounterUpdate(
    from: PipelineStep,
    to: PipelineStep,
    counters: FixLoopCounters
): CounterUpdate | undefined {
    const edge = FIX_LOOP_EDGES[`${from}->${to}`]
    if (edge === undefined) return undefined

    const current = counters[edge.counter]
    if (current === undefined) return undefined

    return {
        field: edge.counter,
        value: edge.action === 'incFixLoop' ? current + 1 : 0,
    }
}
