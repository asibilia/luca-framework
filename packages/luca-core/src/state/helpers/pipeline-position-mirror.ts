/**
 * Pipeline position mirror.
 *
 * A tiny, table-driven mirror of the pipeline position for the persistent
 * runner (`luca start`). The runner holds it as a RE-DERIVABLE view of where
 * the pipeline is; the authoritative `state.json` write always flows through
 * `decideAdvance` + `mutateState`. The mirror NEVER writes `state.json`
 * (anti-03) and is never persisted (anti-05) — it is re-seeded from
 * `state.json.pipelineStep` on every (re)start.
 *
 * HISTORY: this was `createPipelineActorHandle` — a thin wrapper over
 * `createActor(pipelineMachine)` whose whole purpose was keeping the
 * state-machine library out of luca-cli. With the machine deleted there is no
 * actor left to wrap: an `ADVANCE` is a `PIPELINE_TRANSITIONS` lookup and a
 * counter patch. The exported NAMES are retained so the runner's import surface
 * is unchanged.
 *
 * Position-only: `context` mirrors the fix-loop counters, but the
 * AUTHORITATIVE counters live in `state.json` (written by `mutateState`). The
 * mirror is seeded with an EMPTY counter bag, so — exactly as with the actor —
 * its counters never mint (see `fixLoopCounterUpdate`'s no-op-when-untracked
 * rule) and `context` stays `{}`. `luca status` reports counters from
 * `state.json`, not from `contextSnapshot().context`.
 */
import { isLegalTransition } from '../configs/pipeline-transitions.ts'
import type { PipelineStep } from '../schemas.ts'
import {
    fixLoopCounterUpdate,
    type FixLoopCounters,
} from './fix-loop-counters.ts'

/**
 * The JSON-serializable snapshot the runner reports for introspection. `step`
 * is the current position; `context` is the (advisory) fix-loop counter bag —
 * NOT the authoritative counters (those are in `state.json`).
 */
export interface PipelineActorSnapshot {
    step: PipelineStep
    context: FixLoopCounters
}

/**
 * Opaque position handle. Deliberately narrow — only plain values cross this
 * boundary.
 */
export interface PipelineActorHandle {
    /** Mirror an ADVANCE (position only; no state.json write). Illegal advances are ignored. */
    send(to: PipelineStep): void
    /** JSON-serializable snapshot: current step + advisory counter context. */
    contextSnapshot(): PipelineActorSnapshot
    /** Release the handle. A no-op today; kept so callers own a symmetric lifecycle. */
    stop(): void
}

/**
 * Create a position mirror seeded at `step`.
 *
 * `send` applies the same legality rule as the write path
 * (`PIPELINE_TRANSITIONS`): a legal advance moves the mirror and applies the
 * edge's fix-loop counter patch; an ILLEGAL advance leaves the mirror where it
 * is — matching the deleted machine, which stayed put when no guard fired.
 */
export function createPipelineActorHandle(
    step: PipelineStep
): PipelineActorHandle {
    let current: PipelineStep = step
    const context: FixLoopCounters = {}

    return {
        send(to: PipelineStep): void {
            if (!isLegalTransition(current, to)) return
            const update = fixLoopCounterUpdate(current, to, context)
            if (update !== undefined) context[update.field] = update.value
            current = to
        },
        contextSnapshot(): PipelineActorSnapshot {
            return { step: current, context: { ...context } }
        },
        stop(): void {
            // No resource to release — the mirror is plain data.
        },
    }
}
