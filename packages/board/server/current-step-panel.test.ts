import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, test } from 'bun:test'

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
    type Entry,
} from './testing/journal-fixtures'

import type { EngineRecord } from '../shared/board-rpc'

/**
 * The current step on the board (#403): the engine's `step_started` and
 * `step_ended` records show what each ticket, and the run, is doing right
 * now and since when, so a long step never looks like a frozen run.
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

/**
 * `step_started` as the engine journals it: `key` is the ticket's number,
 * or `run` for the run's own steps; `step` is the action type, plus
 * `:<role>` for an agent's turn.
 */
const stepStarted = ({
    ticket,
    step,
    role = null,
    first_seq = null,
}: {
    ticket: number | null
    step: string
    role?: string | null
    first_seq?: number | null
}): Entry => ({
    kind: 'step_started',
    ticket,
    role,
    content: {
        key: ticket === null ? 'run' : String(ticket),
        step,
        first_seq,
    },
})

/** `step_ended` as the engine journals it once the step settles. */
const stepEnded = ({
    ticket,
    step,
    role = null,
}: {
    ticket: number | null
    step: string
    role?: string | null
}): Entry => ({
    kind: 'step_ended',
    ticket,
    role,
    content: { key: ticket === null ? 'run' : String(ticket), step },
})

/** The journal: three tickets through intake, then `entries`. */
const journalWith = ({ entries }: { entries: Entry[] }): EngineRecord[] =>
    stamp({ entries: [...intakeOfThree(), ...entries] })

/** The stamped time of the record at `seq`. */
const timeOf = ({
    records,
    seq,
}: {
    records: EngineRecord[]
    seq: number
}): string => {
    const found = records.find((record) => record.seq === seq)
    if (!found) throw new Error(`no record ${seq}`)
    return found.time
}

/** The seq of the last record of `kind` whose content has `step`. */
const lastStepSeq = ({
    records,
    kind,
    step,
    ticket,
}: {
    records: EngineRecord[]
    kind: string
    step: string
    ticket: number | null
}): number => {
    const found = records.findLast(
        (record) =>
            record.kind === kind &&
            record.ticket === ticket &&
            (record.content as { step: string }).step === step
    )
    if (!found) throw new Error(`no ${kind} for ${step}`)
    return found.seq
}

const runWith = async ({ records }: { records: EngineRecord[] }) => {
    harness = await createHarness()
    const { run_id, token } = await harness.start()
    await harness.send({ run_id, token, records })
    return { run_id, token }
}

/** The run's header row as the chat shows it now. */
const headerOf = ({ board }: { board: Harness }) => {
    const found = board
        .latestRows()
        .find(({ row }) => row.kind === 'luca-board-run')
    if (!found || found.row.kind !== 'luca-board-run') {
        throw new Error('no header row')
    }
    return found.row.data
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
