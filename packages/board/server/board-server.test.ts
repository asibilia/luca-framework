import { afterEach, describe, expect, test } from 'bun:test'

import { createHarness, type Harness } from './testing/board-harness'
import {
    agentFinished,
    agentStarted,
    baselineTests,
    commitMade,
    gatesRun,
    intakeOfThree,
    leftoverScan,
    redCheck,
    ticketJoined,
    ticketWorktreeCreated,
    type Entry,
} from './testing/journal-fixtures'

let harness: Harness

afterEach(async () => {
    await harness.cleanup()
})

describe('engine.event: records in, board state out', () => {
    test('intake records put the tickets in stages, blocked ones in Blocked', async () => {
        harness = await createHarness()
        const { run_id, token } = await harness.start()

        const reply = await harness.send({
            run_id,
            token,
            entries: intakeOfThree(),
        })

        expect(reply).toEqual({
            ok: true,
            next_seq: 8,
            message: expect.any(String),
        })
        const state = await harness.state()
        expect(state.run).toMatchObject({
            run_id,
            spec_number: 10,
            spec_title: 'Add CSV export',
            branch: 'luca/run-10',
            status: 'building',
        })
        expect(
            state.tickets.map(({ number, stage, refactor, step }) => ({
                number,
                stage,
                refactor,
                step,
            }))
        ).toEqual([
            { number: 11, stage: 'building', refactor: true, step: -1 },
            { number: 12, stage: 'blocked', refactor: false, step: -1 },
            { number: 13, stage: 'building', refactor: false, step: -1 },
        ])
        expect(state.event_count).toBe(7)
    })

    test('a ticket moves through tests, red check, code, checks, review, and joins', async () => {
        harness = await createHarness()
        const { run_id, token } = await harness.start()
        await harness.send({ run_id, token, entries: intakeOfThree() })
        const ticket = 13
        const steps: { entries: Entry[]; expected: object }[] = [
            {
                entries: [
                    ticketWorktreeCreated({ ticket }),
                    baselineTests({ ticket, passed: 4 }),
                    agentStarted({ ticket, role: 'test-writer' }),
                ],
                expected: {
                    stage: 'building',
                    step: 0,
                    activity: 'writing tests',
                    role: 'test-writer',
                },
            },
            {
                entries: [
                    agentFinished({
                        ticket,
                        role: 'test-writer',
                        usage: { total_tokens: 1200 },
                    }),
                    redCheck({ ticket, ok: true, failing: 2, passing: 4 }),
                ],
                expected: {
                    stage: 'building',
                    step: 2,
                    activity: 'red check passed',
                    role: null,
                    tests: { failing: 2, total: 6 },
                    tokens: 1200,
                },
            },
            {
                entries: [
                    leftoverScan({ ticket, stage: 'red' }),
                    commitMade({ ticket, stage: 'red' }),
                    agentStarted({ ticket, role: 'implementer' }),
                ],
                expected: { step: 2, activity: 'coding', role: 'implementer' },
            },
            {
                entries: [
                    agentFinished({
                        ticket,
                        role: 'implementer',
                        usage: { total_tokens: 800 },
                    }),
                ],
                expected: { step: 3, activity: 'checks', tokens: 2000 },
            },
            {
                entries: [
                    gatesRun({ ticket, ok: true }),
                    leftoverScan({ ticket, stage: 'green' }),
                    commitMade({ ticket, stage: 'green' }),
                    agentStarted({ ticket, role: 'ticket-reviewer' }),
                ],
                expected: {
                    stage: 'reviewing',
                    step: 4,
                    activity: 'reviewing',
                    review_round: 1,
                },
            },
            {
                entries: [
                    agentFinished({ ticket, role: 'ticket-reviewer' }),
                    ticketJoined({ ticket }),
                ],
                expected: {
                    stage: 'done',
                    step: 5,
                    activity: 'joined',
                    findings: { blocker: 0, should_fix: 0, nit: 0 },
                },
            },
        ]

        let first_seq = 8
        for (const { entries, expected } of steps) {
            await harness.send({ run_id, token, entries, first_seq })
            first_seq += entries.length
            expect(await harness.ticket({ number: ticket })).toMatchObject(
                expected
            )
        }

        const events = harness
            .latestRows()
            .filter(({ row }) => row.kind === 'luca-board-event')
            .map(({ row }) =>
                row.kind === 'luca-board-event' ? row.data.text : ''
            )
        expect(events).toContain('#13: red check passed (2 new tests fail).')
        expect(events).toContain('#13: joined the run branch.')
        expect(events.join('\n')).not.toContain('leftover')
    })

    test('a refactor ticket starts at code, its first two steps skipped', async () => {
        harness = await createHarness()
        const { run_id, token } = await harness.start()
        await harness.send({ run_id, token, entries: intakeOfThree() })

        await harness.send({
            run_id,
            token,
            first_seq: 8,
            entries: [
                ticketWorktreeCreated({ ticket: 11 }),
                agentStarted({ ticket: 11, role: 'implementer' }),
            ],
        })

        expect(await harness.ticket({ number: 11 })).toMatchObject({
            refactor: true,
            step: 2,
            activity: 'coding',
        })
        expect(await harness.ticket({ number: 12 })).toMatchObject({
            stage: 'blocked',
            activity: 'waits on #11',
        })
    })

    test('a blocked ticket leaves Blocked once its blocker is done', async () => {
        harness = await createHarness()
        const { run_id, token } = await harness.start()
        await harness.send({ run_id, token, entries: intakeOfThree() })

        await harness.send({
            run_id,
            token,
            first_seq: 8,
            entries: [
                ticketWorktreeCreated({ ticket: 11 }),
                ticketJoined({ ticket: 11 }),
            ],
        })

        expect(await harness.ticket({ number: 12 })).toMatchObject({
            stage: 'building',
            activity: 'queued',
        })
    })
})
