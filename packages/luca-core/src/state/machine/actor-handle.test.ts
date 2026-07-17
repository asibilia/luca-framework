/**
 * DAD-P2 actor-handle + machine-purity guardrail.
 *
 * Two contracts are locked here:
 *
 *  1. ACTOR-VS-COLD PARITY GUARDRAIL (ac-11). The persistent runner mirrors an
 *     advance into a LIVE actor (`.send`), while the authoritative write goes
 *     through the pure cold path (`decideAdvance` → `machineVerdict`, which uses
 *     `transition()`). Both execute the machine's actions identically ONLY as
 *     long as every action is a pure `assign` (a context patch) and NO node
 *     declares an `entry`/`exit` action. A future non-`assign` `entry`/`exit`
 *     (e.g. a `raise`, `sendTo`, `log`, or a side-effecting function) would run
 *     inside the live actor but is a category the mirror must never carry — it
 *     would diverge the actor path from the cold path. This test fails loudly if
 *     such an action is ever added.
 *
 *  2. HANDLE BEHAVIOUR. The opaque handle seeds at a step, mirrors advances, and
 *     reports a JSON-serializable snapshot (ac-12) — with no `xstate` types
 *     crossing the boundary.
 */
import { describe, expect, test } from 'bun:test'

import {
    createPipelineActorHandle,
    type PipelineActorHandle,
} from './actor-handle.ts'
import { pipelineMachine } from './pipeline-machine.ts'

/**
 * Recursively collect every state node's declared `entry`/`exit` actions,
 * keyed by node path. An empty result means the machine has no lifecycle
 * (entry/exit) actions at all — the strongest form of the guardrail.
 */
function collectLifecycleActions(
    node: { entry?: unknown[]; exit?: unknown[]; states?: Record<string, unknown> },
    path: string,
    acc: Record<string, number>
): void {
    const entry = node.entry ?? []
    const exit = node.exit ?? []
    if (entry.length > 0 || exit.length > 0) {
        acc[path || '<root>'] = entry.length + exit.length
    }
    for (const [key, child] of Object.entries(node.states ?? {})) {
        collectLifecycleActions(
            child as Parameters<typeof collectLifecycleActions>[0],
            path ? `${path}.${key}` : key,
            acc
        )
    }
}

describe('machine purity guardrail (actor-vs-cold parity)', () => {
    test('no state node declares entry/exit actions', () => {
        const lifecycle: Record<string, number> = {}
        collectLifecycleActions(
            pipelineMachine.root as Parameters<
                typeof collectLifecycleActions
            >[0],
            '',
            lifecycle
        )
        // A future entry/exit action would run in the live actor but not in the
        // pure cold write path — diverging the mirror. Keep this at zero.
        expect(lifecycle).toEqual({})
    })

    test('every registered action implementation is an xstate.assign', () => {
        const actions =
            (
                pipelineMachine as unknown as {
                    implementations?: { actions?: Record<string, unknown> }
                }
            ).implementations?.actions ?? {}
        const names = Object.keys(actions)
        // Sanity: the two known fix-loop actions are registered.
        expect(names.sort()).toEqual(['incFixLoop', 'resetFixLoop'])
        for (const name of names) {
            const fn = actions[name] as { type?: string }
            // xstate stamps `assign(...)` results with `type === 'xstate.assign'`.
            expect(fn.type).toBe('xstate.assign')
        }
    })
})

describe('createPipelineActorHandle', () => {
    let handle: PipelineActorHandle

    test('seeds at the requested step', () => {
        handle = createPipelineActorHandle('execute')
        expect(handle.contextSnapshot().step).toBe('execute')
        handle.stop()
    })

    test('mirrors a forward advance', () => {
        handle = createPipelineActorHandle('execute')
        handle.send('checks')
        expect(handle.contextSnapshot().step).toBe('checks')
        handle.stop()
    })

    test('mirrors a rework loop-back', () => {
        handle = createPipelineActorHandle('execute')
        handle.send('checks')
        handle.send('execute')
        expect(handle.contextSnapshot().step).toBe('execute')
        handle.stop()
    })

    test('contextSnapshot is JSON-serializable (ac-12)', () => {
        handle = createPipelineActorHandle('verify')
        const snap = handle.contextSnapshot()
        // Round-trips with no functions/actor-refs.
        expect(() => JSON.stringify(snap)).not.toThrow()
        const parsed = JSON.parse(JSON.stringify(snap))
        expect(parsed.step).toBe('verify')
        expect(typeof parsed.context).toBe('object')
        handle.stop()
    })
})
