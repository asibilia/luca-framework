import { rm } from 'node:fs/promises'

import { afterEach, describe, expect, test } from 'bun:test'

import {
    stepStarted,
    stepEnded,
    journalWith,
    timeOf,
    lastStepSeq,
    headerOf,
} from './current-step-panel-helpers'
import { createHarness, type Harness } from './testing/board-harness'
import {
    agentStarted,
    baselineTests,
    gatesRun,
    ticketWorktreeCreated,
} from './testing/journal-fixtures'

import type { EngineRecord } from '../shared/board-rpc'

/**
 * The current step on the board (#403): the engine's `step_started` and
 * `step_ended` records show what each ticket, and the run, is doing right
 * now and since when, so a long step never looks like a frozen run. The
 * helpers are in `current-step-panel-helpers.ts`; the other topics are in
 * the `current-step-panel-*.test.ts` files beside this one.
 */

let harness: Harness
const extra: Harness[] = []
const dirs: string[] = []

afterEach(async () => {
    await harness.cleanup()
    for (const other of extra.splice(0)) await other.cleanup()
    for (const dir of dirs.splice(0)) {
        await rm(dir, { recursive: true, force: true })
    }
})

const runWith = async ({ records }: { records: EngineRecord[] }) => {
    harness = await createHarness()
    const { run_id, token } = await harness.start()
    await harness.send({ run_id, token, records })
    return { run_id, token }
}

describe('the current step on the panel', () => {
    test("a ticket in a long step shows the step on its card, from the step's start", async () => {
        const records = journalWith({
            entries: [
                ticketWorktreeCreated({ ticket: 11 }),
                stepStarted({ ticket: 11, step: 'run_baseline_tests' }),
            ],
        })
        await runWith({ records })

        const card = await harness.ticket({ number: 11 })
        expect(card.current_step).toEqual({
            text: 'running the baseline tests',
            since: timeOf({ records, seq: records.length }),
        })
        expect((await harness.ticket({ number: 13 })).current_step).toBeNull()
        expect((await harness.state()).current_step).toBeNull()
    })

    test('each ticket shows its own step at the same time', async () => {
        const records = journalWith({
            entries: [
                ticketWorktreeCreated({ ticket: 11 }),
                ticketWorktreeCreated({ ticket: 13 }),
                stepStarted({ ticket: 11, step: 'run_gates' }),
                stepStarted({
                    ticket: 13,
                    step: 'launch_agent:test-writer',
                    role: 'test-writer',
                }),
            ],
        })
        await runWith({ records })

        expect((await harness.ticket({ number: 11 })).current_step).toEqual({
            text: 'running the checks',
            since: timeOf({ records, seq: records.length - 1 }),
        })
        expect((await harness.ticket({ number: 13 })).current_step).toEqual({
            text: 'waiting for the test-writer',
            since: timeOf({ records, seq: records.length }),
        })
    })

    test("a ticket's install shows as installing packages", async () => {
        await runWith({
            records: journalWith({
                entries: [
                    ticketWorktreeCreated({ ticket: 13 }),
                    stepStarted({ ticket: 13, step: 'install_dependencies' }),
                ],
            }),
        })

        expect((await harness.ticket({ number: 13 })).current_step?.text).toBe(
            'installing packages'
        )
    })

    test("a follow-up turn shows as waiting for that agent's role", async () => {
        await runWith({
            records: journalWith({
                entries: [
                    ticketWorktreeCreated({ ticket: 13 }),
                    stepStarted({
                        ticket: 13,
                        step: 'follow_up_agent:implementer',
                        role: 'implementer',
                    }),
                ],
            }),
        })

        expect((await harness.ticket({ number: 13 })).current_step?.text).toBe(
            'waiting for the implementer'
        )
    })

    test("the run's own step shows for the run, not on any ticket", async () => {
        const records = journalWith({
            entries: [
                stepStarted({ ticket: null, step: 'install_dependencies' }),
            ],
        })
        await runWith({ records })

        const state = await harness.state()
        expect(state.current_step).toEqual({
            text: 'installing packages',
            since: timeOf({ records, seq: records.length }),
        })
        for (const card of state.tickets) expect(card.current_step).toBeNull()
    })

    test('a later step replaces the one before it, with its own start', async () => {
        const records = journalWith({
            entries: [
                ticketWorktreeCreated({ ticket: 13 }),
                stepStarted({ ticket: 13, step: 'run_baseline_tests' }),
                baselineTests({ ticket: 13, passed: 4 }),
                stepEnded({ ticket: 13, step: 'run_baseline_tests' }),
                stepStarted({
                    ticket: 13,
                    step: 'launch_agent:test-writer',
                    role: 'test-writer',
                }),
                agentStarted({ ticket: 13, role: 'test-writer' }),
            ],
        })
        await runWith({ records })

        expect((await harness.ticket({ number: 13 })).current_step).toEqual({
            text: 'waiting for the test-writer',
            since: timeOf({
                records,
                seq: lastStepSeq({
                    records,
                    kind: 'step_started',
                    step: 'launch_agent:test-writer',
                    ticket: 13,
                }),
            }),
        })
    })
})

describe('the current step in the chat rows', () => {
    test('the header row lists the current step of each ticket and of the run', async () => {
        const records = journalWith({
            entries: [
                ticketWorktreeCreated({ ticket: 11 }),
                stepStarted({ ticket: 11, step: 'run_baseline_tests' }),
                stepStarted({ ticket: null, step: 'install_dependencies' }),
            ],
        })
        await runWith({ records })

        const steps = headerOf({ board: harness }).current_steps
        expect(steps).toHaveLength(2)
        expect(steps).toEqual(
            expect.arrayContaining([
                {
                    ticket: 11,
                    text: 'running the baseline tests',
                    since: timeOf({ records, seq: records.length - 1 }),
                },
                {
                    ticket: null,
                    text: 'installing packages',
                    since: timeOf({ records, seq: records.length }),
                },
            ])
        )
    })

    test('a step started in a later send updates the header row', async () => {
        const { run_id, token } = await runWith({
            records: journalWith({
                entries: [ticketWorktreeCreated({ ticket: 11 })],
            }),
        })
        expect(headerOf({ board: harness }).current_steps).toEqual([])
        const first_seq = (await harness.state()).event_count + 1

        await harness.send({
            run_id,
            token,
            first_seq,
            entries: [stepStarted({ ticket: 11, step: 'run_gates' })],
        })

        expect(headerOf({ board: harness }).current_steps).toEqual([
            expect.objectContaining({ ticket: 11, text: 'running the checks' }),
        ])
    })
})

describe('how long the current step has been running', () => {
    test('a step that runs across later records keeps the time it started', async () => {
        const records = journalWith({
            entries: [
                ticketWorktreeCreated({ ticket: 11 }),
                ticketWorktreeCreated({ ticket: 13 }),
                stepStarted({ ticket: 11, step: 'run_baseline_tests' }),
                stepStarted({ ticket: 13, step: 'run_gates' }),
                gatesRun({ ticket: 13, ok: true }),
                stepEnded({ ticket: 13, step: 'run_gates' }),
            ],
        })
        await runWith({ records })

        const started = timeOf({
            records,
            seq: lastStepSeq({
                records,
                kind: 'step_started',
                step: 'run_baseline_tests',
                ticket: 11,
            }),
        })
        expect((await harness.ticket({ number: 11 })).current_step?.since).toBe(
            started
        )
        expect(
            headerOf({ board: harness }).current_steps.find(
                ({ ticket }) => ticket === 11
            )?.since
        ).toBe(started)
    })
})
