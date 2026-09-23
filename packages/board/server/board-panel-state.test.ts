import { afterEach, describe, expect, test } from 'bun:test'

import { createHarness, type Harness } from './testing/board-harness'
import {
    finalReviewFixing,
    finalReviewPassed,
    finalReviewStarted,
    finalReviewStuck,
    fixRound,
    gatesRun,
    intakeOfThree,
    lensFinished,
    lensStarted,
    limitWaitEnded,
    limitWaitStarted,
    pullRequestOpened,
    replyReceived,
    ticketSkipped,
    ticketStuck,
    ticketWorktreeCreated,
    usageReading,
    wholeTicket,
    type Entry,
} from './testing/journal-fixtures'

let harness: Harness

afterEach(async () => {
    await harness.cleanup()
})

/** Starts a run and sends intake plus `entries` in one go. */
const runWith = async ({ entries }: { entries: Entry[] }) => {
    harness = await createHarness()
    const { run_id, token } = await harness.start()
    const reply = await harness.send({
        run_id,
        token,
        entries: [...intakeOfThree(), ...entries],
    })
    return { run_id, token, reply, next: reply.next_seq }
}

const rowsOfKind = ({ kind }: { kind: string }) =>
    harness.latestRows().filter(({ row }) => row.kind === kind)

describe('stuck work: "Needs you" and stuck rows', () => {
    test('a stuck ticket goes to Needs you with what was tried and the exact replies', async () => {
        const { run_id } = await runWith({
            entries: [
                ticketWorktreeCreated({ ticket: 13 }),
                gatesRun({ ticket: 13, ok: false }),
                fixRound({ ticket: 13, loop: 'gates', round: 1 }),
                ticketStuck({
                    ticket: 13,
                    reason: 'gates_failed',
                    detail: 'bun test: 2 tests fail in menu.test.ts',
                }),
            ],
        })

        const state = await harness.state()
        expect(state.needs_you).toEqual([
            {
                key: 'ticket-13',
                ticket: 13,
                subject: 'Ticket #13 is stuck: Add the menu item',
                reason: 'The checks failed.',
                detail: 'bun test: 2 tests fail in menu.test.ts',
                tried: [
                    'The checks failed: test',
                    'Fix round 1/3 after the gates',
                ],
                replies: ['retry #13', 'skip #13', 'stop'],
                since: expect.any(String),
            },
        ])
        expect(await harness.ticket({ number: 13 })).toMatchObject({
            stage: 'stuck',
            fix_round: 1,
        })

        const stuck = rowsOfKind({ kind: 'luca-board-stuck' })
        expect(stuck).toHaveLength(1)
        expect(stuck[0]?.row).toMatchObject({
            id: `${run_id}-stuck-13`,
            data: {
                status: 'waiting',
                spec_number: 10,
                replies: ['retry #13', 'skip #13', 'stop'],
            },
        })
    })

    test('the run is stuck only when nothing else is moving', async () => {
        await runWith({
            entries: [
                ticketWorktreeCreated({ ticket: 11 }),
                ticketWorktreeCreated({ ticket: 13 }),
                ticketStuck({ ticket: 13, reason: 'agent_failed', detail: '' }),
            ],
        })
        expect((await harness.state()).run.status).toBe('building')
    })

    test('a skip reply resolves the stuck row in place and skips the ticket', async () => {
        const { run_id, token, next } = await runWith({
            entries: [
                ticketWorktreeCreated({ ticket: 13 }),
                ticketStuck({
                    ticket: 13,
                    reason: 'red_check_failed',
                    detail: 'x',
                }),
            ],
        })
        expect((await harness.state()).run.status).toBe('stuck')

        await harness.send({
            run_id,
            token,
            first_seq: next,
            entries: [
                replyReceived({ word: 'skip', ticket: 13 }),
                ticketSkipped({ ticket: 13 }),
            ],
        })

        const state = await harness.state()
        expect(state.needs_you).toEqual([])
        expect(state.tickets.find((t) => t.number === 13)?.stage).toBe(
            'skipped'
        )
        const stuck = rowsOfKind({ kind: 'luca-board-stuck' })
        expect(stuck).toHaveLength(1)
        expect(stuck[0]?.row).toMatchObject({
            id: `${run_id}-stuck-13`,
            data: { status: 'resolved', resolution: 'You replied `skip #13`.' },
        })
    })
})

describe('the pull request', () => {
    test('pull_request_opened marks the run done with the PR url', async () => {
        await runWith({
            entries: [
                ...wholeTicket({ ticket: 11 }),
                ...wholeTicket({ ticket: 12 }),
                ...wholeTicket({ ticket: 13 }),
                pullRequestOpened({
                    number: 99,
                    url: 'https://github.com/o/r/pull/99',
                }),
            ],
        })

        const state = await harness.state()
        expect(state.run).toMatchObject({
            status: 'done',
            pr_url: 'https://github.com/o/r/pull/99',
            pr_number: 99,
        })
        expect(state.tickets.map((ticket) => ticket.stage)).toEqual([
            'done',
            'done',
            'done',
        ])
        const header = rowsOfKind({ kind: 'luca-board-run' })[0]?.row
        expect(header).toMatchObject({
            data: {
                status: 'done',
                pr_url: 'https://github.com/o/r/pull/99',
                counts: [{ stage: 'done', count: 3 }],
            },
        })
    })
})

describe('plan usage', () => {
    test.each([
        [59, 'ok'],
        [60, 'warn'],
        [85, 'warn'],
        [86, 'high'],
    ])('%d%% reads as %s', async (percent, level) => {
        await runWith({
            entries: [usageReading({ five_hour: percent, weekly: 10 })],
        })

        expect((await harness.state()).usage).toMatchObject({
            five_hour_percent: percent,
            five_hour_level: level,
            weekly_level: 'ok',
        })
        const header = rowsOfKind({ kind: 'luca-board-run' })[0]?.row
        expect(header).toMatchObject({
            data: { usage: { five_hour_level: level } },
        })
    })

    test('no reading yet means no usage', async () => {
        await runWith({ entries: [] })
        expect((await harness.state()).usage).toBeNull()
    })
})

describe('limit waits', () => {
    test('a limit wait shows a banner and a limit row, and both clear when it ends', async () => {
        const resets_at = '2026-09-23T17:00:00.000Z'
        const { run_id, token, next } = await runWith({
            entries: [
                usageReading({ five_hour: 100, weekly: 40 }),
                limitWaitStarted({ resets_at }),
            ],
        })

        const waiting = await harness.state()
        expect(waiting.limit_wait).toEqual({
            resets_at,
            since: expect.any(String),
        })
        expect(waiting.run.status).toBe('limit_wait')
        expect(rowsOfKind({ kind: 'luca-board-limit' })[0]?.row).toMatchObject(
            {
                id: `${run_id}-limit`,
                data: {
                    status: 'waiting',
                    resets_at,
                    usage: { five_hour_level: 'high' },
                },
            }
        )

        await harness.send({
            run_id,
            token,
            first_seq: next,
            entries: [limitWaitEnded()],
        })

        const over = await harness.state()
        expect(over.limit_wait).toBeNull()
        expect(over.run.status).toBe('building')
        const limit = rowsOfKind({ kind: 'luca-board-limit' })
        expect(limit).toHaveLength(1)
        expect(limit[0]?.row).toMatchObject({ data: { status: 'over' } })
    })
})

describe('the final review', () => {
    test('its lenses are a dimmed second stack until every ticket is done or skipped', async () => {
        const { run_id, token, next } = await runWith({
            entries: [...wholeTicket({ ticket: 11 })],
        })

        const early = await harness.state()
        expect(early.final_review).toMatchObject({
            state: 'waiting',
            active: false,
        })
        expect(early.final_review.lenses.map((lens) => lens.name)).toEqual([
            'architecture',
            'simplification',
            'security',
            'integration',
            'rules',
        ])

        const rest = [
            ...wholeTicket({ ticket: 12 }),
            ticketWorktreeCreated({ ticket: 13 }),
            ticketStuck({ ticket: 13, reason: 'gates_failed', detail: '' }),
            replyReceived({ word: 'skip', ticket: 13 }),
            ticketSkipped({ ticket: 13 }),
            finalReviewStarted(),
            lensStarted({ lens: 'security' }),
            lensStarted({ lens: 'rules' }),
            lensFinished({
                lens: 'rules',
                findings: { blocker: 0, should_fix: 0, nit: 2 },
            }),
            lensFinished({
                lens: 'security',
                findings: { blocker: 1, should_fix: 0, nit: 0 },
            }),
        ]
        await harness.send({ run_id, token, first_seq: next, entries: rest })

        const reviewing = await harness.state()
        expect(reviewing.run.status).toBe('final_review')
        expect(reviewing.final_review).toMatchObject({
            state: 'reviewing',
            active: true,
            round: 1,
        })
        expect(
            reviewing.final_review.lenses.map(({ name, state }) => [name, state])
        ).toEqual([
            ['architecture', 'waiting'],
            ['simplification', 'waiting'],
            ['security', 'fixing'],
            ['integration', 'waiting'],
            ['rules', 'clean'],
        ])
        expect(
            reviewing.final_review.lenses.find((lens) => lens.name === 'rules')
                ?.findings
        ).toEqual({ blocker: 0, should_fix: 0, nit: 2 })
    })

    test('a stuck final review asks for retry, stop, or ship; passing clears it', async () => {
        const { run_id, token, next } = await runWith({
            entries: [
                ...wholeTicket({ ticket: 11 }),
                ...wholeTicket({ ticket: 12 }),
                ...wholeTicket({ ticket: 13 }),
                finalReviewStarted(),
                finalReviewFixing({ round: 3 }),
                finalReviewStuck({
                    reason: 'fix_loop_capped',
                    detail: 'The security blocker is still there.',
                }),
            ],
        })

        const stuck = await harness.state()
        expect(stuck.run.status).toBe('stuck')
        expect(stuck.needs_you).toEqual([
            expect.objectContaining({
                key: 'final',
                ticket: null,
                subject: 'The final review is stuck',
                replies: ['retry', 'stop', 'ship'],
                tried: ['Fix round 3/3 on the lenses\' findings'],
            }),
        ])
        expect(
            rowsOfKind({ kind: 'luca-board-stuck' })[0]?.row
        ).toMatchObject({
            id: `${run_id}-stuck-final`,
            data: { status: 'waiting', replies: ['retry', 'stop', 'ship'] },
        })

        await harness.send({
            run_id,
            token,
            first_seq: next,
            entries: [
                replyReceived({ word: 'retry', ticket: null }),
                finalReviewPassed(),
            ],
        })

        const passed = await harness.state()
        expect(passed.needs_you).toEqual([])
        expect(passed.final_review.state).toBe('passed')
        expect(
            passed.final_review.lenses.every((lens) => lens.state === 'clean')
        ).toBe(true)
        expect(rowsOfKind({ kind: 'luca-board-stuck' })[0]?.row).toMatchObject(
            { data: { status: 'resolved', resolution: 'You replied `retry`.' } }
        )
    })
})
