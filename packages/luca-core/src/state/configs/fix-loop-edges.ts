/**
 * Fix-loop edge table.
 *
 * The single source of truth for which `(from→to)` pipeline edges carry a
 * fix-loop counter side-effect. Three REWORK edges increment their loop's
 * counter; three FORWARD-EXIT edges zero it.
 *
 * This table was previously consumed by the generated pipeline machine (to
 * wire `assign` actions onto the edge) and by its verdict adapter. The machine is
 * gone; the table survives unchanged and is now consumed directly by:
 *  - `helpers/fix-loop-counters.ts` — computes the counter write-back the
 *    `luca state advance` write path persists,
 *  - `helpers/graph-render.ts` — labels the annotated Mermaid edges.
 *
 * PURE DATA. No behaviour, no dependencies.
 */

/** The three fix-loop counters made live on the rework edges. */
export type FixLoopCounter =
    | 'checksFixIteration'
    | 'verifyIteration'
    | 'reviewIteration'

/** The cap paired with each fix-loop counter (used by advisory telemetry / enforce). */
export type FixLoopCap =
    | 'maxChecksFixIterations'
    | 'maxVerifyIterations'
    | 'maxReviewIterations'

/**
 * What a fix-loop edge does to its counter.
 *
 * `incFixLoop` / `resetFixLoop` are retained as the action NAMES because they
 * are the labels rendered by `luca graph --format mermaid --annotate` (and
 * pinned byte-for-byte by the annotated golden).
 */
export interface FixLoopEdge {
    action: 'incFixLoop' | 'resetFixLoop'
    counter: FixLoopCounter
    /** The counter's cap. Set only on rework (`incFixLoop`) edges — a reset needs none. */
    cap?: FixLoopCap
}

/** `${from}->${to}` → descriptor. Exactly 6 edges (3 rework + 3 forward-exit). */
export const FIX_LOOP_EDGES: Record<string, FixLoopEdge> = {
    // Rework edges — increment. `cap` pairs the counter for advisory telemetry / enforce.
    'checks->execute': {
        action: 'incFixLoop',
        counter: 'checksFixIteration',
        cap: 'maxChecksFixIterations',
    },
    'verify->checks': {
        action: 'incFixLoop',
        counter: 'verifyIteration',
        cap: 'maxVerifyIterations',
    },
    'review->execute': {
        action: 'incFixLoop',
        counter: 'reviewIteration',
        cap: 'maxReviewIterations',
    },
    // Forward-exit edges — reset the same loop's counter to 0.
    'checks->verify': { action: 'resetFixLoop', counter: 'checksFixIteration' },
    'verify->review': { action: 'resetFixLoop', counter: 'verifyIteration' },
    'review->learn': { action: 'resetFixLoop', counter: 'reviewIteration' },
}

/**
 * Derived single-source map of the 3 rework edges → their cap field. Consumers
 * (the CLI advance handler's `fixloop-counted` budget resolution) import this
 * instead of re-declaring the edge→cap mapping — so the rework-edge set has ONE
 * home (`FIX_LOOP_EDGES`).
 */
export const REWORK_EDGE_CAPS: Record<string, FixLoopCap> = Object.fromEntries(
    Object.entries(FIX_LOOP_EDGES)
        .filter(([, e]) => e.action === 'incFixLoop' && e.cap)
        .map(([edge, e]) => [edge, e.cap as FixLoopCap])
)
