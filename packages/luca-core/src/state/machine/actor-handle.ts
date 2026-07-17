/**
 * Opaque pipeline-actor handle (DAD-P2).
 *
 * A THIN wrapper over `createActor(pipelineMachine)` that keeps `xstate` from
 * leaking into luca-cli: the persistent runner (`luca start`) holds this handle
 * as a re-derivable MIRROR of the pipeline position, but the actual `state.json`
 * write always flows through the existing `decideAdvance` + `mutateState` cold
 * path. The actor NEVER writes `state.json` (anti-03) and no snapshot is ever
 * persisted (anti-05) — it is re-seeded from `state.json.pipelineStep` on every
 * (re)start.
 *
 * The returned handle exposes ONLY plain values (a `send(to)` that takes a
 * `PipelineStep`, a JSON-serializable `contextSnapshot()`, and `stop()`), so a
 * consumer can import it without importing `xstate` (ac-01).
 *
 * Position-only mirror: the machine `context` tracks the fix-loop counters via
 * `assign` actions, but those are advisory here — the AUTHORITATIVE counters
 * live in `state.json` (written by `mutateState`). `luca status` therefore
 * reports counters from `state.json`, not from `contextSnapshot().context`.
 */
import { createActor } from 'xstate'

import type { PipelineStep } from '../schemas.ts'
import {
    pipelineMachine,
    stateValueToLeaf,
    STEP_TO_STATE_VALUE,
    type PipelineContext,
} from './pipeline-machine.ts'

/**
 * The JSON-serializable snapshot the runner reports for introspection. `step`
 * is the current leaf; `context` is the machine's (advisory) fix-loop context —
 * NOT the authoritative counters (those are in `state.json`).
 */
export interface PipelineActorSnapshot {
    step: PipelineStep
    context: PipelineContext
}

/**
 * Opaque actor handle. Deliberately narrow — no `xstate` types cross this
 * boundary, so luca-cli holds a mirror without depending on `xstate`.
 */
export interface PipelineActorHandle {
    /** Mirror an ADVANCE into the actor (position only; no state.json write). */
    send(to: PipelineStep): void
    /** JSON-serializable snapshot: current leaf step + advisory context. */
    contextSnapshot(): PipelineActorSnapshot
    /** Stop the underlying actor. */
    stop(): void
}

/**
 * Create a started actor handle seeded at `step`.
 *
 * The actor is rehydrated via `pipelineMachine.resolveState` at the leaf for
 * `step` (empty context — counters are advisory here) and started immediately.
 * Callers own the lifecycle: call {@link PipelineActorHandle.stop} when done.
 */
export function createPipelineActorHandle(
    step: PipelineStep
): PipelineActorHandle {
    const snapshot = pipelineMachine.resolveState({
        value: STEP_TO_STATE_VALUE[step],
        context: {},
    })
    const actor = createActor(pipelineMachine, { snapshot })
    actor.start()

    return {
        send(to: PipelineStep): void {
            actor.send({ type: 'ADVANCE', to })
        },
        contextSnapshot(): PipelineActorSnapshot {
            const snap = actor.getSnapshot()
            return {
                step: stateValueToLeaf(snap.value),
                context: snap.context,
            }
        },
        stop(): void {
            actor.stop()
        },
    }
}
