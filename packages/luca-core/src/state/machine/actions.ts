/**
 * Fix-loop counter actions (DAD-P1c).
 *
 * The iteration budget is made LIVE here: `incFixLoop` bumps a rework
 * counter, `resetFixLoop` zeroes it on the forward-exit edge. Both are XState
 * `assign` ACTIONS — they mutate `context`, never gate a transition. That is
 * the parity-safety invariant: `.can()` and `next.value` are untouched, so the
 * 169-pair golden harness stays green (adding an `assign` to a legal edge does
 * not change which edges are legal).
 *
 * The actions are PER-EDGE PARAMETERIZED: `checks→execute` and `review→execute`
 * share the destination `execute` but increment different counters, and the
 * `from` leaf is not observable inside an `assign`. So the counter to touch is
 * carried in `params.counter`, wired per-edge in the machine config.
 *
 * The `assign` wrappers themselves are defined INLINE in `pipeline-machine.ts`'s
 * `setup({ actions })` (so XState infers the machine's context+event types);
 * this module owns the PURE patch logic they delegate to, plus the edge map.
 */
import type { PipelineContext } from './pipeline-machine.ts'

/** The three fix-loop counters made live on the rework edges. */
export type FixLoopCounter =
    | 'checksFixIteration'
    | 'verifyIteration'
    | 'reviewIteration'

/** Params carried by both fix-loop actions: which counter to touch. */
export interface FixLoopParams {
    counter: FixLoopCounter
}

/**
 * Edge → fix-loop action descriptor. The single source of truth for which
 * `(from→to)` edges carry a counter action, consumed by:
 *  - `pipeline-machine.ts` (to wire `incFixLoop`/`resetFixLoop` onto the edge),
 *  - `machine-verdict.ts` (to report the post-transition counter value back to
 *    the write path).
 *
 * Rework edges (`incFixLoop`) increment; forward-exit edges (`resetFixLoop`)
 * zero the same loop's counter.
 */
export interface FixLoopEdge {
    action: 'incFixLoop' | 'resetFixLoop'
    counter: FixLoopCounter
}

/** `${from}->${to}` → descriptor. Exactly 6 edges (3 rework + 3 forward-exit). */
export const FIX_LOOP_EDGES: Record<string, FixLoopEdge> = {
    // Rework edges — increment.
    'checks->execute': { action: 'incFixLoop', counter: 'checksFixIteration' },
    'verify->checks': { action: 'incFixLoop', counter: 'verifyIteration' },
    'review->execute': { action: 'incFixLoop', counter: 'reviewIteration' },
    // Forward-exit edges — reset the same loop's counter to 0.
    'checks->verify': { action: 'resetFixLoop', counter: 'checksFixIteration' },
    'verify->review': { action: 'resetFixLoop', counter: 'verifyIteration' },
    'review->learn': { action: 'resetFixLoop', counter: 'reviewIteration' },
}

/**
 * Increment patch for the parameterized counter. Pure — the `incFixLoop`
 * `assign` wrapper applies it.
 *
 * INVARIANT (parity- AND graph-safety): the patch is EMPTY (a no-op) when the
 * counter is not already tracked in context (`undefined`). Only an
 * already-initialized counter advances (`current + 1`). The live write path
 * always seeds every counter (the `LucaState` schema defaults each to 0), so
 * production increments normally (0→1→2…). But the machine's OWN default
 * context is `{}` (no counters) — used by `parityContext()` and, critically, by
 * `getAdjacencyMap`'s structural exploration. If the increment used a nullish
 * base there, exploration would mint an ever-growing counter and diverge into
 * an infinite state space (the snapshot is JSON-serialized WITH context). The
 * no-op-when-untracked rule keeps that exploration's context invariant at `{}`,
 * so the 21-edge graph test terminates and passes UNCHANGED.
 */
export function incFixLoopPatch(
    context: PipelineContext,
    params: FixLoopParams
): Partial<PipelineContext> {
    const current = context[params.counter]
    if (current === undefined) return {}
    const patch: Partial<PipelineContext> = {}
    patch[params.counter] = current + 1
    return patch
}

/**
 * Reset patch: zero the parameterized counter. Pure. Same no-op-when-untracked
 * invariant as {@link incFixLoopPatch} — a reset must not INTRODUCE a counter
 * into the machine's default `{}` context (that would also diverge structural
 * exploration). The live write path always has the counter tracked.
 */
export function resetFixLoopPatch(
    context: PipelineContext,
    params: FixLoopParams
): Partial<PipelineContext> {
    if (context[params.counter] === undefined) return {}
    const patch: Partial<PipelineContext> = {}
    patch[params.counter] = 0
    return patch
}
