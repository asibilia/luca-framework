import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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
    agentFinished,
    agentStarted,
    baselineTests,
    dependenciesInstalled,
    gatesRun,
    intakeOfThree,
    stamp,
    ticketWorktreeCreated,
} from './testing/journal-fixtures'

import type { EngineRecord } from '../shared/board-rpc'

/**
 * The current step on the board (#403): finished steps leave nothing running
 * behind. The helpers are in `current-step-panel-helpers.ts`; the other
 * topics are in the `current-step-panel-*.test.ts` files beside this one.
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

describe('finished steps leave nothing running behind', () => {
    test('an ended step clears from the card and the header row', async () => {
        await runWith({
            records: journalWith({
                entries: [
                    ticketWorktreeCreated({ ticket: 11 }),
                    stepStarted({ ticket: 11, step: 'run_baseline_tests' }),
                    baselineTests({ ticket: 11, passed: 4 }),
                    stepEnded({ ticket: 11, step: 'run_baseline_tests' }),
                ],
            }),
        })

        const card = await harness.ticket({ number: 11 })
        expect(card.current_step).toBeNull()
        const header = headerOf({ board: harness })
        expect(header.current_steps).toEqual([])
        expect(JSON.stringify(header)).not.toContain('running the baseline')
    })

    test("the run's ended step clears from the panel and the header row", async () => {
        await runWith({
            records: journalWith({
                entries: [
                    stepStarted({ ticket: null, step: 'install_dependencies' }),
                    dependenciesInstalled({ ok: true }),
                    stepEnded({ ticket: null, step: 'install_dependencies' }),
                ],
            }),
        })

        expect((await harness.state()).current_step).toBeNull()
        expect(headerOf({ board: harness }).current_steps).toEqual([])
    })

    test('a step ended in a later send clears it', async () => {
        const { run_id, token } = await runWith({
            records: journalWith({
                entries: [
                    ticketWorktreeCreated({ ticket: 13 }),
                    stepStarted({
                        ticket: 13,
                        step: 'launch_agent:test-writer',
                        role: 'test-writer',
                    }),
                    agentStarted({ ticket: 13, role: 'test-writer' }),
                ],
            }),
        })
        expect(
            (await harness.ticket({ number: 13 })).current_step
        ).not.toBeNull()
        const first_seq = (await harness.state()).event_count + 1

        await harness.send({
            run_id,
            token,
            first_seq,
            entries: [
                agentFinished({ ticket: 13, role: 'test-writer' }),
                stepEnded({
                    ticket: 13,
                    step: 'launch_agent:test-writer',
                    role: 'test-writer',
                }),
            ],
        })

        expect((await harness.ticket({ number: 13 })).current_step).toBeNull()
        expect(headerOf({ board: harness }).current_steps).toEqual([])
    })

    test("a step a crash cut off shows its redo's start, and clears when the redo ends", async () => {
        const cutOff = journalWith({
            entries: [
                ticketWorktreeCreated({ ticket: 11 }),
                stepStarted({ ticket: 11, step: 'run_baseline_tests' }),
            ],
        })
        const first_seq = cutOff.length
        const redo = stamp({
            entries: [
                ...intakeOfThree(),
                ticketWorktreeCreated({ ticket: 11 }),
                stepStarted({ ticket: 11, step: 'run_baseline_tests' }),
                stepStarted({
                    ticket: 11,
                    step: 'run_baseline_tests',
                    first_seq,
                }),
            ],
        })
        const { run_id, token } = await runWith({ records: redo })

        expect((await harness.ticket({ number: 11 })).current_step).toEqual({
            text: 'running the baseline tests',
            since: timeOf({ records: redo, seq: redo.length }),
        })

        await harness.send({
            run_id,
            token,
            first_seq: redo.length + 1,
            entries: [
                baselineTests({ ticket: 11, passed: 4 }),
                stepEnded({ ticket: 11, step: 'run_baseline_tests' }),
            ],
        })

        expect((await harness.ticket({ number: 11 })).current_step).toBeNull()
        expect(headerOf({ board: harness }).current_steps).toEqual([])
    })

    test('an engine that ended leaves no step running', async () => {
        const { run_id, token } = await runWith({
            records: journalWith({
                entries: [
                    ticketWorktreeCreated({ ticket: 11 }),
                    stepStarted({ ticket: 11, step: 'run_baseline_tests' }),
                    stepStarted({ ticket: null, step: 'install_dependencies' }),
                ],
            }),
        })

        await harness.send({
            run_id,
            token,
            records: [],
            ended: { ok: false, message: 'The engine crashed.' },
        })

        const state = await harness.state()
        expect(state.current_step).toBeNull()
        for (const card of state.tickets) expect(card.current_step).toBeNull()
        expect(headerOf({ board: harness }).current_steps).toEqual([])
    })

    test('after a plugin restart, a replayed journal shows only the steps still running', async () => {
        const registry_dir = await mkdtemp(join(tmpdir(), 'luca-board-reg-'))
        dirs.push(registry_dir)
        harness = await createHarness({ registry_dir })
        const { run_id, token } = await harness.start()
        const records = journalWith({
            entries: [
                stepStarted({ ticket: null, step: 'install_dependencies' }),
                dependenciesInstalled({ ok: true }),
                stepEnded({ ticket: null, step: 'install_dependencies' }),
                ticketWorktreeCreated({ ticket: 11 }),
                stepStarted({ ticket: 11, step: 'run_baseline_tests' }),
                baselineTests({ ticket: 11, passed: 4 }),
                stepEnded({ ticket: 11, step: 'run_baseline_tests' }),
                ticketWorktreeCreated({ ticket: 13 }),
                stepStarted({
                    ticket: 13,
                    step: 'launch_agent:test-writer',
                    role: 'test-writer',
                }),
                agentStarted({ ticket: 13, role: 'test-writer' }),
            ],
        })
        await harness.send({ run_id, token, records })
        const before = await harness.state()

        const restarted = await createHarness({ registry_dir })
        extra.push(restarted)
        await restarted.send({ run_id, token, records })

        const after = await restarted.state()
        expect(after.current_step).toBeNull()
        expect(after.tickets.map(({ current_step }) => current_step)).toEqual(
            before.tickets.map(({ current_step }) => current_step)
        )
        expect(
            after.tickets.find(({ number }) => number === 11)?.current_step
        ).toBeNull()
        expect(
            after.tickets.find(({ number }) => number === 13)?.current_step
        ).toEqual({
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
        expect(headerOf({ board: restarted }).current_steps).toEqual([
            expect.objectContaining({
                ticket: 13,
                text: 'waiting for the test-writer',
            }),
        ])
    })

    test('after a plugin restart, a replayed journal whose steps all ended shows none running', async () => {
        const registry_dir = await mkdtemp(join(tmpdir(), 'luca-board-reg-'))
        dirs.push(registry_dir)
        harness = await createHarness({ registry_dir })
        const { run_id, token } = await harness.start()
        const records = journalWith({
            entries: [
                ticketWorktreeCreated({ ticket: 11 }),
                stepStarted({ ticket: 11, step: 'run_gates' }),
                gatesRun({ ticket: 11, ok: true }),
                stepEnded({ ticket: 11, step: 'run_gates' }),
                stepStarted({ ticket: null, step: 'install_dependencies' }),
                dependenciesInstalled({ ok: true }),
                stepEnded({ ticket: null, step: 'install_dependencies' }),
            ],
        })
        await harness.send({ run_id, token, records })

        const restarted = await createHarness({ registry_dir })
        extra.push(restarted)
        await restarted.send({ run_id, token, records })

        const after = await restarted.state()
        expect(after.current_step).toBeNull()
        for (const card of after.tickets) expect(card.current_step).toBeNull()
        const header = headerOf({ board: restarted })
        expect(header.current_steps).toEqual([])
        expect(JSON.stringify(header)).not.toContain('running the checks')
        expect(JSON.stringify(header)).not.toContain('installing packages')
    })
})
