import { afterEach, describe, expect, test } from 'bun:test'

import {
    harness,
    runWith,
    eventRows,
    failedGatesRound,
    codedTicket13,
} from './board-panel-state-helpers'
import {
    agentFailed,
    agentFinished,
    agentStarted,
    gatesRun,
    redCheck,
    sessionOf,
    ticketStuck,
    ticketWorktreeCreated,
    worktreeReset,
} from './testing/journal-fixtures'

/**
 * The board's panel state for fix loops, failed tries, and a bad test. The
 * helpers are in `board-panel-state-helpers.ts`; the other topics are in the
 * `board-panel-state-*.test.ts` files beside this one.
 */

afterEach(async () => {
    await harness.cleanup()
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

    test('nothing new to test is stuck with its refactor hint', async () => {
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
            'The test-writer says the ticket changes no behavior, so there is nothing new to test. Label it refactor and retry it.'
        )
    })
})
