import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, test } from 'bun:test'

import { createHarness, type Harness } from './testing/board-harness'
import {
    agentStarted,
    intakeOfThree,
    stamp,
    ticketStuck,
    ticketWorktreeCreated,
    agentSession,
    rateLimit,
    usageRecorded,
    wholeTicket,
} from './testing/journal-fixtures'

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

const journal = () =>
    stamp({
        entries: [
            ...intakeOfThree(),
            ...wholeTicket({ ticket: 11 }),
            ticketWorktreeCreated({ ticket: 13 }),
            ticketStuck({ ticket: 13, reason: 'gates_failed', detail: 'x' }),
            agentSession({
                ticket: 13,
                role: 'implementer',
                output: 500,
                rate_limits: [
                    rateLimit({ type: 'five_hour', utilization: 0.7 }),
                    rateLimit({ type: 'seven_day', utilization: 0.2 }),
                ],
            }),
        ],
    })

describe('engine.event: seq order', () => {
    test('records already applied are duplicates and change nothing', async () => {
        harness = await createHarness()
        const { run_id, token } = await harness.start()
        const records = journal()
        await harness.send({ run_id, token, records: records.slice(0, 10) })
        const before = await harness.state()

        const reply = await harness.send({
            run_id,
            token,
            records: records.slice(5, 10),
        })

        expect(reply).toMatchObject({ ok: true, next_seq: 11 })
        expect(await harness.state()).toEqual(before)
    })

    test('an overlapping send applies only the new records', async () => {
        harness = await createHarness()
        const { run_id, token } = await harness.start()
        const records = journal()
        await harness.send({ run_id, token, records: records.slice(0, 10) })

        const reply = await harness.send({
            run_id,
            token,
            records: records.slice(5, 15),
        })

        expect(reply).toMatchObject({ ok: true, next_seq: 16 })
        expect((await harness.state()).event_count).toBe(15)
    })

    test('a gap applies nothing past it and asks for a resend', async () => {
        harness = await createHarness()
        const { run_id, token } = await harness.start()
        const records = journal()
        await harness.send({ run_id, token, records: records.slice(0, 5) })

        const reply = await harness.send({
            run_id,
            token,
            records: records.slice(7, 12),
            ended: { ok: true, message: 'done' },
        })

        expect(reply).toMatchObject({ ok: true, next_seq: 6 })
        expect(reply.message).toContain('resend from 6')
        const state = await harness.state()
        expect(state.event_count).toBe(5)
        expect(state.run.engine_ended).toBeNull()
    })

    test('records out of order inside one send are applied in seq order', async () => {
        harness = await createHarness()
        const { run_id, token } = await harness.start()
        const records = journal()

        const reply = await harness.send({
            run_id,
            token,
            records: records.slice(0, 8).toReversed(),
        })

        expect(reply.next_seq).toBe(9)
        expect((await harness.state()).run.branch).toBe('luca/run-10')
    })
})

describe('engine.event: who may send', () => {
    test('an unknown run is rejected', async () => {
        harness = await createHarness()
        await harness.start()

        const reply = await harness.send({
            run_id: 'luca-20260101-000000-zzzz',
            token: 'x',
            records: journal(),
        })

        expect(reply).toMatchObject({ ok: false, next_seq: 0 })
        expect(reply.message).toContain("doesn't know run")
    })

    test('a wrong token is rejected and nothing is applied', async () => {
        harness = await createHarness()
        const { run_id, token } = await harness.start()
        const rows = harness.rows.length

        const reply = await harness.send({
            run_id,
            token: `${token}x`,
            records: journal(),
        })

        expect(reply).toMatchObject({ ok: false, next_seq: 0 })
        expect((await harness.state()).event_count).toBe(0)
        expect(harness.rows).toHaveLength(rows)
    })
})

describe('engine.event: bad and unknown records', () => {
    test('an unknown kind is skipped safely; a bad record is skipped and logged', async () => {
        harness = await createHarness()
        const { run_id, token } = await harness.start()
        const records = stamp({
            entries: [
                ...intakeOfThree(),
                usageRecorded({
                    ticket: null,
                    windows: { five_hour: { from: 0, to: 1, used: 1 } },
                }),
                {
                    kind: 'jev_label',
                    ticket: null,
                    role: null,
                    content: { any: 'thing' },
                },
                {
                    kind: 'ticket_stuck',
                    ticket: 13,
                    role: null,
                    content: { nope: true },
                },
                agentStarted({ ticket: 13, role: 'test-writer' }),
            ],
        })

        const reply = await harness.send({ run_id, token, records })

        expect(reply).toMatchObject({ ok: true, next_seq: 12 })
        const state = await harness.state()
        expect(state.event_count).toBe(11)
        expect(state.run_plan_used).toEqual([
            { window: 'five-hour', percent: 1 },
        ])
        expect(state.needs_you).toEqual([])
        expect(state.tickets.find((t) => t.number === 13)?.step).toBe(0)
        expect(harness.logs.join('\n')).toContain(
            'skipped record 10 (ticket_stuck)'
        )
        expect(harness.logs.join('\n')).not.toContain('usage_recorded')
    })
})

describe('a plugin restart', () => {
    test('the new plugin knows the run, asks for seq 1, and a resend rebuilds the same board', async () => {
        const registry_dir = await mkdtemp(join(tmpdir(), 'luca-board-reg-'))
        dirs.push(registry_dir)
        harness = await createHarness({ registry_dir })
        const { run_id, token } = await harness.start()
        const records = journal()
        await harness.send({ run_id, token, records })
        const before = await harness.state()

        const restarted = await createHarness({ registry_dir })
        extra.push(restarted)
        const { selected } = await restarted.read()
        expect(selected?.run).toMatchObject({ run_id, status: 'starting' })
        expect(selected?.event_count).toBe(0)

        const partial = await restarted.send({
            run_id,
            token,
            records: records.slice(-2),
        })
        expect(partial).toMatchObject({ ok: true, next_seq: 1 })

        const full = await restarted.send({ run_id, token, records })
        expect(full.next_seq).toBe(records.length + 1)
        const after = await restarted.state()
        expect(after).toEqual({
            ...before,
            run: { ...before.run, last_time: after.run.last_time },
        })
        expect(after.run.last_time).toBe(before.run.last_time)
    })

    test('a broken registry file starts empty and is logged', async () => {
        const registry_dir = await mkdtemp(join(tmpdir(), 'luca-board-reg-'))
        dirs.push(registry_dir)
        await Bun.write(
            join(registry_dir, 'runs.json'),
            '{"version":1,"runs":[{}]}'
        )

        harness = await createHarness({ registry_dir })

        expect((await harness.read()).runs).toEqual([])
        expect(harness.logs.join('\n')).toContain('not valid')
    })
})

describe('chat rows', () => {
    test('two runs in one chat get distinct row ids; each header id is stable', async () => {
        harness = await createHarness()
        const first = await harness.start({ args: '10' })
        const second = await harness.start({ args: '#20' })
        for (const { run_id, token } of [first, second]) {
            await harness.send({ run_id, token, entries: intakeOfThree() })
            await harness.send({
                run_id,
                token,
                first_seq: 8,
                entries: [ticketWorktreeCreated({ ticket: 11 })],
            })
        }

        expect(first.run_id).not.toBe(second.run_id)
        const ids = harness.rows.map(({ row }) => row.id)
        const firstIds = ids.filter((id) => id.startsWith(first.run_id))
        const secondIds = ids.filter((id) => id.startsWith(second.run_id))
        expect(firstIds.length + secondIds.length).toBe(ids.length)
        expect(new Set(firstIds).size).toBeGreaterThan(1)
        expect(firstIds.some((id) => secondIds.includes(id))).toBe(false)

        const headers = harness.rows.filter(
            ({ row }) => row.kind === 'luca-board-run'
        )
        expect(new Set(headers.map(({ row }) => row.id))).toEqual(
            new Set([`${first.run_id}-run`, `${second.run_id}-run`])
        )
        expect(headers.length).toBeGreaterThan(2)
        expect(
            harness.rows.every(({ agent_id }) => agent_id === 'agent-1')
        ).toBe(true)
    })

    test('the header row is appended at start as "starting"', async () => {
        harness = await createHarness()
        const { run_id } = await harness.start()

        expect(harness.rows).toEqual([
            {
                agent_id: 'agent-1',
                row: expect.objectContaining({
                    id: `${run_id}-run`,
                    kind: 'luca-board-run',
                    data: expect.objectContaining({
                        status: 'starting',
                        spec_number: 10,
                    }),
                }),
            },
        ])
    })

    test('every row is well under 64 KiB, even with a huge stuck detail', async () => {
        harness = await createHarness()
        const { run_id, token } = await harness.start()
        await harness.send({
            run_id,
            token,
            entries: [
                ...intakeOfThree(),
                ticketWorktreeCreated({ ticket: 13 }),
                ticketStuck({
                    ticket: 13,
                    reason: 'gates_failed',
                    detail: 'x'.repeat(200_000),
                }),
            ],
        })

        for (const { row } of harness.rows) {
            expect(JSON.stringify(row.data).length).toBeLessThan(16 * 1024)
        }
    })

    test('a chat that is gone stops getting rows, but the board keeps its state', async () => {
        harness = await createHarness({ fail_appends: true })
        const { run_id, token } = await harness.start()

        const reply = await harness.send({
            run_id,
            token,
            entries: intakeOfThree(),
        })

        expect(reply).toMatchObject({ ok: true, next_seq: 8 })
        expect((await harness.state()).tickets).toHaveLength(3)
        expect(harness.logs.join('\n')).toContain('stopped adding rows')
    })
})

describe('the engine ending', () => {
    test('ended marks the engine stopped with its message in the header row', async () => {
        harness = await createHarness()
        const { run_id, token } = await harness.start()

        await harness.send({
            run_id,
            token,
            entries: intakeOfThree(),
            ended: { ok: false, message: 'The Claude login check failed.' },
        })

        const state = await harness.state()
        expect(state.run.engine_ended).toEqual({
            ok: false,
            message: 'The Claude login check failed.',
        })
        expect(state.run.status).toBe('ended_with_error')
        const header = harness
            .latestRows()
            .find(({ row }) => row.kind === 'luca-board-run')
        expect(header?.row).toMatchObject({
            data: {
                status: 'ended_with_error',
                engine_ended: {
                    ok: false,
                    message: 'The Claude login check failed.',
                },
            },
        })
    })

    test('ended with no new records still updates the header', async () => {
        harness = await createHarness()
        const { run_id, token } = await harness.start()
        const headers = () =>
            harness.rows.filter(({ row }) => row.kind === 'luca-board-run')
                .length
        const count = headers()

        await harness.send({
            run_id,
            token,
            records: [],
            ended: { ok: true, message: 'Nothing to do.' },
        })

        expect(headers()).toBe(count + 1)
        expect((await harness.state()).run.engine_ended?.ok).toBe(true)
    })
})

describe('board.read', () => {
    test("lists only this workspace's runs, newest first, and selects by id", async () => {
        harness = await createHarness()
        const older = await harness.start({ args: '10' })
        const newer = await harness.start({ args: 'demo' })
        await harness.start({ args: '30', workspace_id: 'ws-2' })

        const { runs, selected } = await harness.read()
        expect(runs.map((run) => run.run_id)).toEqual([
            newer.run_id,
            older.run_id,
        ])
        expect(runs[0]).toMatchObject({ demo: true, spec_number: null })
        expect(selected?.run.run_id).toBe(newer.run_id)

        const picked = await harness.read({ run_id: older.run_id })
        expect(picked.selected?.run.run_id).toBe(older.run_id)
        expect(
            (await harness.read({ workspace_id: 'ws-9' })).selected
        ).toBeNull()
    })
})
