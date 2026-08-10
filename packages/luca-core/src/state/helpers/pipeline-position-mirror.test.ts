/**
 * Pipeline position-mirror coverage (replaces `machine/actor-handle.test.ts`).
 *
 * The runner (`luca start`) holds this handle as a re-derivable view of the
 * pipeline position. It must seed at a step, mirror legal advances, refuse to
 * move on an ILLEGAL advance (the deleted actor stayed put when no guard
 * fired), and report a JSON-serializable snapshot.
 */
import { describe, expect, test } from 'bun:test'

import {
    createPipelineActorHandle,
    type PipelineActorHandle,
} from './pipeline-position-mirror.ts'

describe('createPipelineActorHandle', () => {
    test('seeds at the requested step', () => {
        const handle = createPipelineActorHandle('execute')
        expect(handle.contextSnapshot().step).toBe('execute')
        handle.stop()
    })

    test('mirrors a forward advance', () => {
        const handle = createPipelineActorHandle('execute')
        handle.send('checks')
        expect(handle.contextSnapshot().step).toBe('checks')
        handle.stop()
    })

    test('mirrors a rework loop-back', () => {
        const handle = createPipelineActorHandle('execute')
        handle.send('checks')
        handle.send('execute')
        expect(handle.contextSnapshot().step).toBe('execute')
        handle.stop()
    })

    test('mirrors the legal research self-loop', () => {
        const handle = createPipelineActorHandle('research')
        handle.send('research')
        expect(handle.contextSnapshot().step).toBe('research')
        handle.stop()
    })

    test('an ILLEGAL advance leaves the mirror where it is', () => {
        const handle = createPipelineActorHandle('plan')
        handle.send('execute') // plan → execute must go via plan-review
        expect(handle.contextSnapshot().step).toBe('plan')
        handle.stop()
    })

    test('contextSnapshot is JSON-serializable', () => {
        const handle = createPipelineActorHandle('verify')
        const snap = handle.contextSnapshot()
        expect(() => JSON.stringify(snap)).not.toThrow()
        const parsed = JSON.parse(JSON.stringify(snap))
        expect(parsed.step).toBe('verify')
        expect(typeof parsed.context).toBe('object')
        handle.stop()
    })

    test('counters are NEVER minted into the mirror (state.json is authoritative)', () => {
        // The mirror seeds an EMPTY counter bag, so a rework advance must not
        // fabricate a counter — matching the deleted actor, whose `assign`
        // no-opped on an untracked counter.
        const handle = createPipelineActorHandle('checks')
        handle.send('execute')
        expect(handle.contextSnapshot().context).toEqual({})
        handle.stop()
    })

    test('the snapshot is a copy — mutating it cannot corrupt the mirror', () => {
        const handle: PipelineActorHandle = createPipelineActorHandle('checks')
        const snap = handle.contextSnapshot()
        snap.context.checksFixIteration = 42
        expect(handle.contextSnapshot().context).toEqual({})
        handle.stop()
    })
})
