import { afterEach, describe, expect, test } from 'bun:test'

import { createHarness, type Harness } from './testing/board-harness'
import {
    agentFailed,
    agentFinished,
    agentSession,
    agentStarted,
    finalReviewFixing,
    finalReviewPassed,
    finalReviewStarted,
    finalReviewStuck,
    gatesRun,
    intakeOfThree,
    jevAnswered,
    jevAsked,
    jevFailed,
    lensFinished,
    lensStarted,
    limitWaitEnded,
    limitWaitStarted,
    pullRequestOpened,
    rateLimit,
    redCheck,
    replyReceived,
    runStopped,
    sessionOf,
    ticketSkipped,
    ticketStuck,
    ticketWorktreeCreated,
    wholeTicket,
    worktreeReset,
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

/** The chat's event rows, as text and tone, oldest first. */
const eventRows = () =>
    harness
        .latestRows()
        .flatMap(({ row }) =>
            row.kind === 'luca-board-event'
                ? [{ text: row.data.text, tone: row.data.tone }]
                : []
        )

/** Gates that failed, then the implementer's follow-up in its session. */
const failedGatesRound = ({ ticket }: { ticket: number }): Entry[] => [
    gatesRun({ ticket, ok: false }),
    agentStarted({
        ticket,
        role: 'implementer',
        follow_up_of: sessionOf({ ticket, role: 'implementer' }),
    }),
    agentFinished({ ticket, role: 'implementer' }),
]

/** Ticket 13 up to its first implementer result. */
const codedTicket13 = (): Entry[] => [
    ticketWorktreeCreated({ ticket: 13 }),
    agentStarted({ ticket: 13, role: 'test-writer' }),
    agentFinished({ ticket: 13, role: 'test-writer' }),
    redCheck({ ticket: 13, ok: true, failing: 1, passing: 3 }),
    agentStarted({ ticket: 13, role: 'implementer' }),
    agentFinished({ ticket: 13, role: 'implementer' }),
]

describe('stuck work: "Needs you" and stuck rows', () => {
    test('a stuck ticket goes to Needs you with what was tried and the exact replies', async () => {
        const { run_id } = await runWith({
            entries: [
                ...codedTicket13(),
                ...failedGatesRound({ ticket: 13 }),
                gatesRun({ ticket: 13, ok: false }),
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
                    'Fix round 1/3 after the checks',
                    'The checks failed: test',
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

describe('plan usage, from the rate-limit readings in agent sessions', () => {
    test.each([
        [0.59, 59, 'ok'],
        [0.6, 60, 'warn'],
        [0.85, 85, 'warn'],
        [0.86, 86, 'high'],
    ])(
        'a five-hour utilization of %d reads as %d%% (%s)',
        async (utilization, percent, level) => {
            await runWith({
                entries: [
                    ticketWorktreeCreated({ ticket: 11 }),
                    agentSession({
                        ticket: 11,
                        role: 'implementer',
                        rate_limits: [
                            rateLimit({ type: 'five_hour', utilization }),
                            rateLimit({ type: 'seven_day', utilization: 0.1 }),
                        ],
                    }),
                ],
            })

            expect((await harness.state()).usage).toMatchObject({
                five_hour_percent: percent,
                five_hour_level: level,
                weekly_percent: 10,
                weekly_level: 'ok',
            })
            const header = rowsOfKind({ kind: 'luca-board-run' })[0]?.row
            expect(header).toMatchObject({
                data: { usage: { five_hour_level: level } },
            })
        }
    )

    test('each window keeps its latest reading, and the five-hour one says when it resets', async () => {
        const resets_at = '2026-09-23T17:00:00.000Z'
        await runWith({
            entries: [
                ticketWorktreeCreated({ ticket: 11 }),
                agentSession({
                    ticket: 11,
                    role: 'test-writer',
                    rate_limits: [
                        rateLimit({ type: 'seven_day_opus', utilization: 0.3 }),
                    ],
                }),
                agentSession({
                    ticket: 11,
                    role: 'implementer',
                    rate_limits: [
                        rateLimit({
                            type: 'five_hour',
                            utilization: 0.2,
                            resets_at,
                        }),
                        rateLimit({
                            type: 'five_hour',
                            utilization: 0.25,
                            resets_at,
                        }),
                    ],
                }),
                // A session with no readings changes nothing.
                agentSession({ ticket: 11, role: 'ticket-reviewer' }),
            ],
        })

        expect((await harness.state()).usage).toEqual({
            five_hour_percent: 25,
            weekly_percent: 30,
            five_hour_level: 'ok',
            weekly_level: 'ok',
            resets_at,
            read_at: expect.any(String),
        })
    })

    test('a window with no reading yet stays unknown', async () => {
        await runWith({
            entries: [
                ticketWorktreeCreated({ ticket: 11 }),
                agentSession({
                    ticket: 11,
                    role: 'implementer',
                    rate_limits: [
                        rateLimit({ type: 'seven_day', utilization: 0.4 }),
                    ],
                }),
            ],
        })

        expect((await harness.state()).usage).toMatchObject({
            five_hour_percent: null,
            five_hour_level: null,
            weekly_percent: 40,
        })
    })

    test('no reading yet means no usage', async () => {
        await runWith({ entries: [] })
        expect((await harness.state()).usage).toBeNull()
    })
})

describe('limit waits (not journaled yet, #368)', () => {
    test('a limit wait shows a banner and a limit row, and both clear when it ends', async () => {
        const resets_at = '2026-09-23T17:00:00.000Z'
        const { run_id, token, next } = await runWith({
            entries: [
                ticketWorktreeCreated({ ticket: 11 }),
                agentSession({
                    ticket: 11,
                    role: 'implementer',
                    rate_limits: [
                        rateLimit({ type: 'five_hour', utilization: 1 }),
                    ],
                }),
                limitWaitStarted({ resets_at }),
            ],
        })

        const waiting = await harness.state()
        expect(waiting.limit_wait).toEqual({
            resets_at,
            since: expect.any(String),
        })
        expect(waiting.run.status).toBe('limit_wait')
        expect(rowsOfKind({ kind: 'luca-board-limit' })[0]?.row).toMatchObject({
            id: `${run_id}-limit`,
            data: {
                status: 'waiting',
                resets_at,
                usage: { five_hour_level: 'high' },
            },
        })

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

describe('fix loops', () => {
    test('a failed red check sends the test-writer a follow-up: one fix round each', async () => {
        const ticket = 13
        const followUp = agentStarted({
            ticket,
            role: 'test-writer',
            follow_up_of: sessionOf({ ticket, role: 'test-writer' }),
        })
        await runWith({
            entries: [
                ticketWorktreeCreated({ ticket }),
                agentStarted({ ticket, role: 'test-writer' }),
                agentFinished({ ticket, role: 'test-writer' }),
                redCheck({ ticket, ok: false, failing: 0, passing: 4 }),
                followUp,
                agentFinished({ ticket, role: 'test-writer' }),
                redCheck({ ticket, ok: false, failing: 0, passing: 4 }),
                followUp,
            ],
        })

        expect(await harness.ticket({ number: ticket })).toMatchObject({
            fix_round: 2,
            open_check: 'red_check',
            activity: 'fixing tests (2/3)',
            role: 'test-writer',
        })
        expect(eventRows()).toContainEqual({
            text: '#13: fix round 2/3: the test-writer got the failure back.',
            tone: 'warning',
        })
    })

    test('a follow-up sent again after a crash is the same round', async () => {
        const ticket = 13
        const followUp = agentStarted({
            ticket,
            role: 'implementer',
            follow_up_of: sessionOf({ ticket, role: 'implementer' }),
        })
        await runWith({
            entries: [
                ...codedTicket13(),
                gatesRun({ ticket, ok: false }),
                followUp,
                followUp,
            ],
        })

        expect(await harness.ticket({ number: ticket })).toMatchObject({
            fix_round: 1,
            activity: 'fixing (1/3)',
        })
        expect(
            eventRows().filter(({ text }) => text.includes('fix round'))
        ).toHaveLength(1)
    })

    test('passing checks close the loop and reset the counter', async () => {
        await runWith({
            entries: [
                ...codedTicket13(),
                ...failedGatesRound({ ticket: 13 }),
                gatesRun({ ticket: 13, ok: true }),
            ],
        })

        expect(await harness.ticket({ number: 13 })).toMatchObject({
            fix_round: 0,
            open_check: null,
            step: 4,
            activity: 'checks passed',
        })
    })

    test('a failed install is a failed check like any other', async () => {
        await runWith({
            entries: [
                ...codedTicket13(),
                {
                    kind: 'gates_run',
                    ticket: 13,
                    role: null,
                    content: {
                        target: 'ticket',
                        ok: false,
                        checks: [
                            {
                                name: 'install',
                                command: 'bun install',
                                ok: false,
                                exit_code: 1,
                                output: 'error: lockfile',
                            },
                        ],
                    },
                },
            ],
        })

        expect(eventRows().at(-1)).toEqual({
            text: '#13: checks failed: install.',
            tone: 'danger',
        })
        expect((await harness.ticket({ number: 13 }))?.open_check).toBe('gates')
    })
})

describe('failed tries', () => {
    test.each([
        ['agent', 'failed', 'danger'],
        ['result', 'gave no usable result', 'danger'],
        ['guard', "broke its role's rules (the changes were undone)", 'danger'],
        [
            'engine',
            'could not run (an engine-side failure; a fresh agent starts)',
            'warning',
        ],
    ] as const)(
        'a %s failure is a "tried" line and a %s row',
        async (failure, words, tone) => {
            await runWith({
                entries: [
                    ticketWorktreeCreated({ ticket: 13 }),
                    agentStarted({ ticket: 13, role: 'implementer' }),
                    agentFailed({
                        ticket: 13,
                        role: 'implementer',
                        failure,
                        error: 'it went wrong\nmore detail',
                    }),
                ],
            })

            expect(await harness.ticket({ number: 13 })).toMatchObject({
                role: null,
                failed_turn: 'implementer',
                tried: [`The implementer ${words}: it went wrong`],
            })
            expect(eventRows().at(-1)).toEqual({
                text: `#13: the implementer ${words}: it went wrong`,
                tone,
            })
        }
    )

    test('the next turn is a retry, not a fix round, and a result clears the failure', async () => {
        const ticket = 13
        await runWith({
            entries: [
                ...codedTicket13(),
                gatesRun({ ticket, ok: false }),
                agentStarted({
                    ticket,
                    role: 'implementer',
                    follow_up_of: sessionOf({ ticket, role: 'implementer' }),
                }),
                agentFailed({
                    ticket,
                    role: 'implementer',
                    failure: 'guard',
                    error: 'It edited a test file.',
                }),
                agentStarted({
                    ticket,
                    role: 'implementer',
                    follow_up_of: sessionOf({ ticket, role: 'implementer' }),
                }),
            ],
        })

        expect(await harness.ticket({ number: ticket })).toMatchObject({
            fix_round: 1,
            activity: 'coding again',
            failed_turn: 'implementer',
        })
        expect(eventRows().at(-1)).toEqual({
            text: '#13: the implementer tries again.',
            tone: 'warning',
        })
    })

    test('a reviewer retried after a failure is the same review round', async () => {
        const ticket = 13
        await runWith({
            entries: [
                ...codedTicket13(),
                gatesRun({ ticket, ok: true }),
                agentStarted({ ticket, role: 'ticket-reviewer' }),
                agentFailed({
                    ticket,
                    role: 'ticket-reviewer',
                    failure: 'result',
                    error: 'No structured output.',
                }),
                agentStarted({ ticket, role: 'ticket-reviewer' }),
                agentFinished({ ticket, role: 'ticket-reviewer' }),
            ],
        })

        expect(await harness.ticket({ number: ticket })).toMatchObject({
            review_round: 1,
            failed_turn: null,
            activity: 'approved',
        })
    })
})

describe('a bad test', () => {
    test('the worktree is reset and the ticket starts over from the tests', async () => {
        const ticket = 13
        await runWith({
            entries: [
                ...codedTicket13().slice(0, -1),
                agentFinished({
                    ticket,
                    role: 'implementer',
                    result: {
                        outcome: 'bad_test',
                        bad_test: {
                            file: 'src/menu.test.ts',
                            name: 'menu > opens',
                            reason: 'It checks the wrong label.',
                        },
                        summary: 'The test is wrong.',
                        assumptions: [],
                        run_notes: [],
                    },
                }),
                worktreeReset({ ticket }),
            ],
        })

        expect(await harness.ticket({ number: ticket })).toMatchObject({
            step: 0,
            fix_round: 0,
            activity: 'starting over',
            tried: ['Started over from the tests after a bad test'],
        })
        expect(eventRows().slice(-2)).toEqual([
            {
                text: '#13: the implementer sent back a bad test.',
                tone: 'warning',
            },
            {
                text: '#13: starting over from the tests after a bad test.',
                tone: 'warning',
            },
        ])
    })

    test('nothing new to test is stuck with its hint', async () => {
        await runWith({
            entries: [
                ticketWorktreeCreated({ ticket: 13 }),
                ticketStuck({
                    ticket: 13,
                    reason: 'nothing_new_to_test',
                    detail: 'Every criterion is already tested.',
                }),
            ],
        })

        expect((await harness.state()).needs_you[0]?.reason).toBe(
            'The test-writer found nothing new to test. If the ticket changes no behavior, label it refactor and start the run again.'
        )
    })
})

describe('a stopped run', () => {
    test('run_stopped shows the reason until the engine moves on again', async () => {
        const reason = 'accountInfo: an API key, not a Claude plan'
        const { run_id, token, next } = await runWith({
            entries: [
                ticketWorktreeCreated({ ticket: 11 }),
                agentStarted({ ticket: 11, role: 'test-writer' }),
                runStopped({ ticket: 11, role: 'test-writer', reason }),
            ],
        })

        const stopped = await harness.state()
        expect(stopped.run.status).toBe('stopped')
        expect(stopped.run.stopped).toEqual({
            reason,
            role: 'test-writer',
            ticket: 11,
            since: expect.any(String),
        })
        expect(await harness.ticket({ number: 11 })).toMatchObject({
            role: null,
            activity: 'run stopped',
        })
        expect(eventRows().at(-1)).toEqual({
            text: `#11: the run stopped: ${reason}. Start it again with the same run id to pick up where it stopped.`,
            tone: 'danger',
        })
        expect(rowsOfKind({ kind: 'luca-board-run' })[0]?.row).toMatchObject({
            data: { status: 'stopped' },
        })

        await harness.send({
            run_id,
            token,
            first_seq: next,
            entries: [agentStarted({ ticket: 11, role: 'test-writer' })],
        })

        const resumed = await harness.state()
        expect(resumed.run.stopped).toBeNull()
        expect(resumed.run.status).toBe('building')
    })
})

describe('Jev in shadow mode', () => {
    test('its calls are counted quietly: no rows, and the tickets do not change', async () => {
        const { run_id, token, next } = await runWith({
            entries: [ticketWorktreeCreated({ ticket: 11 })],
        })
        const before = await harness.state()
        const rowsBefore = harness.latestRows().length

        await harness.send({
            run_id,
            token,
            first_seq: next,
            entries: [
                jevAsked({ ticket: 11 }),
                jevAnswered({ ticket: 11, asked_seq: next }),
                jevAsked({ ticket: 11 }),
                jevFailed({ ticket: 11, asked_seq: next + 2 }),
            ],
        })

        const after = await harness.state()
        expect(after.jev).toEqual({ asked: 2, answered: 1, failed: 1 })
        expect(after.tickets).toEqual(before.tickets)
        expect(after.run.status).toBe(before.run.status)
        expect(after.latest).toBe(before.latest)
        expect(harness.latestRows()).toHaveLength(rowsBefore)
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
            reviewing.final_review.lenses.map(({ name, state }) => [
                name,
                state,
            ])
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
                tried: ["Fix round 3/3 on the lenses' findings"],
            }),
        ])
        expect(rowsOfKind({ kind: 'luca-board-stuck' })[0]?.row).toMatchObject({
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
        expect(rowsOfKind({ kind: 'luca-board-stuck' })[0]?.row).toMatchObject({
            data: { status: 'resolved', resolution: 'You replied `retry`.' },
        })
    })
})
