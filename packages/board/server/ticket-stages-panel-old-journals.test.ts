import { afterEach, describe, expect, test } from 'bun:test'

import {
    agentFinished,
    agentStarted,
    gatesRun,
    joinClashed,
    pullRequestOpened,
    reviewFinished,
    runBranchPushed,
    sessionOf,
    ticketJoined,
    ticketRebased,
    wholeTicket,
} from './testing/journal-fixtures'
import {
    harness,
    runWith,
    sendMore,
    stageOf,
} from './ticket-stages-panel-helpers'

import { RunRowSchema } from '../shared/board-rows'
import {
    BoardStateSchema,
    TicketStageSchema,
    type BoardState,
} from '../shared/board-state'

/**
 * Old journals and stored board state still load with the ticket stages
 * (#549). The helpers are in `ticket-stages-panel-helpers.ts`; the other
 * topics are in the `ticket-stages-panel-*.test.ts` files beside this one.
 */

afterEach(async () => {
    await harness.cleanup()
})

describe('old journals and stored board state still load', () => {
    test('an old journal with no step records replays to done without errors', async () => {
        await runWith({
            entries: [
                ...wholeTicket({ ticket: 11 }),
                ...wholeTicket({ ticket: 12 }),
                ...wholeTicket({ ticket: 13 }).slice(0, 17),
                joinClashed({ ticket: 13 }),
                ticketRebased({ ticket: 13, cause: 'clash', code: ['a.ts'] }),
            ],
        })
        expect(await stageOf({ ticket: 13 })).toBe('fixing')

        await sendMore({
            entries: [
                agentStarted({
                    ticket: 13,
                    role: 'implementer',
                    follow_up_of: sessionOf({
                        ticket: 13,
                        role: 'implementer',
                    }),
                }),
                agentFinished({ ticket: 13, role: 'implementer' }),
                gatesRun({ ticket: 13, ok: true }),
                agentStarted({ ticket: 13, role: 'ticket-reviewer' }),
                reviewFinished({ ticket: 13 }),
                ticketJoined({ ticket: 13 }),
                gatesRun({ ticket: 13, ok: true, target: 'run_branch' }),
                runBranchPushed({ ticket: 13 }),
                pullRequestOpened({
                    number: 408,
                    url: 'https://github.com/acme/app/pull/408',
                }),
            ],
        })

        const state = await harness.state()
        expect(state.run.status).toBe('done')
        expect(state.tickets.map((ticket) => ticket.stage)).toEqual([
            'done',
            'done',
            'done',
        ])
    })

    test('a stored board state parses with the old stages and the new ones', async () => {
        await runWith({ entries: wholeTicket({ ticket: 13 }) })
        const stored = JSON.parse(
            JSON.stringify(await harness.state())
        ) as BoardState
        const old = ['blocked', 'building', 'reviewing'] as const
        const withOld = {
            ...stored,
            tickets: stored.tickets.map((ticket, index) => ({
                ...ticket,
                stage: old[index % old.length],
            })),
        }
        expect(BoardStateSchema.safeParse(withOld).success).toBe(true)

        const fresh = ['testing', 'fixing', 'joining']
        const withNew = {
            ...stored,
            tickets: stored.tickets.map((ticket, index) => ({
                ...ticket,
                stage: fresh[index % fresh.length],
            })),
        }

        expect(BoardStateSchema.safeParse(withNew).success).toBe(true)
    })

    test('the stages are blocked, building, reviewing, testing, fixing, joining, stuck, done, skipped', () => {
        expect(TicketStageSchema.options).toEqual([
            'blocked',
            'building',
            'reviewing',
            'testing',
            'fixing',
            'joining',
            'stuck',
            'done',
            'skipped',
        ])
    })

    test("a stored header row's stage counts parse, old and new", () => {
        const row = {
            run_id: 'r1',
            spec_number: 10,
            spec_title: 'Spec',
            demo: false,
            status: 'building',
            counts: [{ stage: 'reviewing', count: 2 }],
            final_review: 'waiting',
            usage: null,
            limit_wait: false,
            needs_you: 0,
            pr_url: null,
            engine_ended: null,
            log_path: null,
            updated_at: '2026-09-23T12:00:00.000Z',
        }

        expect(RunRowSchema.safeParse(row).success).toBe(true)
        expect(
            RunRowSchema.safeParse({
                ...row,
                counts: [
                    { stage: 'testing', count: 1 },
                    { stage: 'fixing', count: 1 },
                    { stage: 'joining', count: 1 },
                ],
            }).success
        ).toBe(true)
    })
})
