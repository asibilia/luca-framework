import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import {
    lucaStateSchema,
    machineVerdict,
    type PipelineStep as PipelineStepType,
} from '@alecsibilia/luca-core'

import { decideAdvance, lucaStateAdvanceTool } from './luca-state-advance.ts'

describe('luca_state_advance', () => {
    let cwd: string

    beforeEach(async () => {
        cwd = await mkdtemp(join(tmpdir(), 'luca-mcp-advance-'))
        await mkdir(join(cwd, '.luca'), { recursive: true })
        await writeFile(
            join(cwd, '.luca/state.json'),
            JSON.stringify({ pipelineStep: 'plan' })
        )
    })

    afterEach(async () => {
        await rm(cwd, { recursive: true, force: true })
    })

    test('advances legally and writes the new step', async () => {
        const result = await lucaStateAdvanceTool.handler(
            { toStep: 'plan-review' },
            { cwd }
        )

        expect(result.isError).toBeFalsy()
        const state = JSON.parse(
            await readFile(join(cwd, '.luca/state.json'), 'utf-8')
        )
        expect(state.pipelineStep).toBe('plan-review')
    })

    test('rejects illegal jumps with isError', async () => {
        const result = await lucaStateAdvanceTool.handler(
            { toStep: 'execute' },
            { cwd }
        )

        expect(result.isError).toBe(true)
        const text = (result.content[0] as { text: string }).text
        expect(text).toContain('illegal')

        // state.json unchanged
        const state = JSON.parse(
            await readFile(join(cwd, '.luca/state.json'), 'utf-8')
        )
        expect(state.pipelineStep).toBe('plan')
    })

    test('illegal cross-step error carries the illegal-transition reason code', async () => {
        // plan → execute is an illegal cross-step jump (plan only → plan-review).
        const result = await lucaStateAdvanceTool.handler(
            { toStep: 'execute' },
            { cwd }
        )

        expect(result.isError).toBe(true)
        const text = (result.content[0] as { text: string }).text
        // The machine's reason code is surfaced in the message …
        expect(text).toContain('illegal-transition')
        // … and the legacy `illegal` substring is retained for back-compat.
        expect(text).toContain('illegal')
    })

    test('same-step no-op (plan → plan) is rejected as same-step-no-op, distinct from illegal-transition', async () => {
        // plan → plan is NOT a legal self-loop (plan only → plan-review), so
        // the machine classifies it as `same-step-no-op` — a DIFFERENT reason
        // code from a cross-step `illegal-transition`.
        const result = await lucaStateAdvanceTool.handler(
            { toStep: 'plan' },
            { cwd }
        )

        expect(result.isError).toBe(true)
        const text = (result.content[0] as { text: string }).text
        expect(text).toContain('same-step-no-op')
        // Must NOT be classified as a cross-step illegal transition.
        expect(text).not.toContain('illegal-transition')

        // state.json unchanged
        const state = JSON.parse(
            await readFile(join(cwd, '.luca/state.json'), 'utf-8')
        )
        expect(state.pipelineStep).toBe('plan')
    })

    test('legal self-loop (research → research) is ACCEPTED, not a same-step no-op', async () => {
        await writeFile(
            join(cwd, '.luca/state.json'),
            JSON.stringify({ pipelineStep: 'research' })
        )

        const result = await lucaStateAdvanceTool.handler(
            { toStep: 'research' },
            { cwd }
        )

        expect(result.isError).toBeFalsy()
        const state = JSON.parse(
            await readFile(join(cwd, '.luca/state.json'), 'utf-8')
        )
        expect(state.pipelineStep).toBe('research')
    })

    test('allows loop-back (plan-review → plan)', async () => {
        await writeFile(
            join(cwd, '.luca/state.json'),
            JSON.stringify({ pipelineStep: 'plan-review' })
        )

        const result = await lucaStateAdvanceTool.handler(
            { toStep: 'plan' },
            { cwd }
        )

        expect(result.isError).toBeFalsy()
        const state = JSON.parse(
            await readFile(join(cwd, '.luca/state.json'), 'utf-8')
        )
        expect(state.pipelineStep).toBe('plan')
    })

    test('preserves other state fields on transition', async () => {
        await writeFile(
            join(cwd, '.luca/state.json'),
            JSON.stringify({
                pipelineStep: 'plan',
                currentPhase: 3,
                branchName: 'feat/x',
            })
        )

        await lucaStateAdvanceTool.handler({ toStep: 'plan-review' }, { cwd })

        const state = JSON.parse(
            await readFile(join(cwd, '.luca/state.json'), 'utf-8')
        )
        expect(state.pipelineStep).toBe('plan-review')
        expect(state.currentPhase).toBe(3)
        expect(state.branchName).toBe('feat/x')
    })

    // The 5 iteration counters + 6 caps that P1c will (later) mutate. In P1b
    // the machine adds NO increment logic, so every one of these 11 fields
    // must survive an advance byte-identical.
    const COUNTER_FIELDS = {
        // counters
        checksFixIteration: 1,
        verifyIteration: 1,
        planReviewIteration: 2,
        researchReviewIteration: 1,
        reviewIteration: 2,
        // caps
        maxChecksFixIterations: 4,
        maxVerifyIterations: 3,
        maxPlanReviewIterations: 5,
        maxResearchReviewIterations: 6,
        maxReviewIterations: 7,
        maxPhases: 9,
    } as const

    test('preserves all 11 counter/cap fields on a FORWARD advance', async () => {
        await writeFile(
            join(cwd, '.luca/state.json'),
            JSON.stringify({ pipelineStep: 'plan', ...COUNTER_FIELDS })
        )

        const result = await lucaStateAdvanceTool.handler(
            { toStep: 'plan-review' },
            { cwd }
        )
        expect(result.isError).toBeFalsy()

        const state = JSON.parse(
            await readFile(join(cwd, '.luca/state.json'), 'utf-8')
        )
        expect(state.pipelineStep).toBe('plan-review')
        for (const [field, value] of Object.entries(COUNTER_FIELDS)) {
            expect(state[field]).toBe(value)
        }
    })

    test('preserves all 11 counter/cap fields on a LOOP-BACK advance (checks → execute)', async () => {
        // checks → execute is the fix-loop-back that P1c will eventually
        // increment (checksFixIteration). In P1b it must leave EVERY counter
        // untouched — this is the sharp no-increment-yet guard.
        await writeFile(
            join(cwd, '.luca/state.json'),
            JSON.stringify({ pipelineStep: 'checks', ...COUNTER_FIELDS })
        )

        const result = await lucaStateAdvanceTool.handler(
            { toStep: 'execute' },
            { cwd }
        )
        expect(result.isError).toBeFalsy()

        const state = JSON.parse(
            await readFile(join(cwd, '.luca/state.json'), 'utf-8')
        )
        expect(state.pipelineStep).toBe('execute')
        for (const [field, value] of Object.entries(COUNTER_FIELDS)) {
            expect(state[field]).toBe(value)
        }
    })

    test('creates state.json from defaults when missing (idle → triage)', async () => {
        // Remove pre-existing state
        await rm(join(cwd, '.luca/state.json'), { force: true })

        const result = await lucaStateAdvanceTool.handler(
            { toStep: 'triage' },
            { cwd }
        )

        expect(result.isError).toBeFalsy()
        const state = JSON.parse(
            await readFile(join(cwd, '.luca/state.json'), 'utf-8')
        )
        expect(state.pipelineStep).toBe('triage')
    })

    test('returns from + to in result text', async () => {
        const result = await lucaStateAdvanceTool.handler(
            { toStep: 'plan-review' },
            { cwd }
        )
        const text = (result.content[0] as { text: string }).text
        expect(text).toContain('plan')
        expect(text).toContain('plan-review')
    })
})

/**
 * Equivalence harness: the handler's pure decision seam (`decideAdvance`) must
 * agree with `machineVerdict` on accept/reject AND the resulting step for every
 * representative transition class. This proves the P1b swap is a true drop-in —
 * the persisted mutation and the machine oracle can never disagree.
 */
describe('decideAdvance ⇔ machineVerdict equivalence', () => {
    const pairs: Array<{ from: string; to: string; kind: string }> = [
        { from: 'plan', to: 'plan-review', kind: 'legal forward' },
        { from: 'checks', to: 'execute', kind: 'legal loop-back' },
        { from: 'research', to: 'research', kind: 'legal self-loop' },
        { from: 'plan', to: 'execute', kind: 'illegal cross-step' },
        { from: 'plan', to: 'plan', kind: 'same-step no-op' },
        { from: 'plan', to: 'not-a-real-step', kind: 'unknown requested' },
    ]

    for (const { from, to, kind } of pairs) {
        test(`${kind}: ${from} → ${to}`, () => {
            const state = lucaStateSchema.parse({ pipelineStep: from })
            const verdict = machineVerdict({
                currentStep: from,
                requestedStep: to,
                complexity: state.complexity,
                oversight: state.oversight,
            })

            if (verdict.allowed) {
                // Accept: decideAdvance returns the machine's resulting step in
                // `.pipelineStep`. Compare as strings (decideAdvance is typed to
                // the PipelineStep union; machineVerdict.resultingStep is flat).
                expect(
                    decideAdvance(state, to as PipelineStepType)
                        .pipelineStep as string
                ).toBe(verdict.resultingStep)
            } else {
                // Reject: decideAdvance throws (generic Error the caller catches).
                expect(() =>
                    decideAdvance(state, to as PipelineStepType)
                ).toThrow()
            }
        })
    }

    test('unknown current step: decideAdvance rejects cleanly, no TypeError on the allowed-list guard', () => {
        // A persisted pipelineStep that is not a table key is unreachable via
        // the Zod-validated read, but the exported seam must surface a clean
        // unknown-current-step rejection rather than TypeError-ing on the
        // `PIPELINE_TRANSITIONS[from].join` lookup (the `?? []` guard). A
        // TypeError message would not match /unknown-current-step/.
        const state = {
            ...lucaStateSchema.parse({}),
            pipelineStep: 'bogus-current',
        } as unknown as Parameters<typeof decideAdvance>[0]
        expect(() =>
            decideAdvance(state, 'triage' as PipelineStepType)
        ).toThrow(/unknown-current-step/)
    })

    test('barrel-import smoke: machineVerdict resolves from @alecsibilia/luca-core (no cycle)', () => {
        // If exporting machineVerdict through the state barrel introduced an
        // import cycle, this symbol would evaluate to `undefined` at module
        // load. A live function reference is the no-cycle probe.
        expect(typeof machineVerdict).toBe('function')
    })
})
