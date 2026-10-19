import { afterEach, describe, expect, test } from 'bun:test'

import { createHarness, type Harness } from './testing/board-harness'
import {
    agentFinished,
    agentStarted,
    commitMade,
    finding,
    gatesRun,
    intakeOfThree,
    leftoverScan,
    redCheck,
    reviewFinished,
    sessionOf,
    ticketWorktreeCreated,
    type Entry,
} from './testing/journal-fixtures'

let harness: Harness

afterEach(async () => {
    await harness.cleanup()
})

const TICKET = 13

/** Starts a run and sends intake plus `entries` in one go. */
const runWith = async ({ entries }: { entries: Entry[] }) => {
    harness = await createHarness()
    const { run_id, token } = await harness.start()
    await harness.send({
        run_id,
        token,
        entries: [...intakeOfThree(), ...entries],
    })
}

/** The chat's event rows' text, oldest first. */
const eventTexts = () =>
    harness
        .latestRows()
        .flatMap(({ row }) =>
            row.kind === 'luca-board-event' ? [row.data.text] : []
        )

/** Ticket 13 built, checked, committed, and its first review started. */
const inReview = (): Entry[] => [
    ticketWorktreeCreated({ ticket: TICKET }),
    agentStarted({ ticket: TICKET, role: 'test-writer' }),
    agentFinished({ ticket: TICKET, role: 'test-writer' }),
    redCheck({ ticket: TICKET, ok: true, failing: 1, passing: 3 }),
    leftoverScan({ ticket: TICKET, stage: 'red' }),
    commitMade({ ticket: TICKET, stage: 'red' }),
    agentStarted({ ticket: TICKET, role: 'implementer' }),
    agentFinished({ ticket: TICKET, role: 'implementer' }),
    gatesRun({ ticket: TICKET, ok: true }),
    leftoverScan({ ticket: TICKET, stage: 'green' }),
    commitMade({ ticket: TICKET, stage: 'green' }),
    agentStarted({ ticket: TICKET, role: 'ticket-reviewer' }),
]

describe('a fixer that answers other_role (#616)', () => {
    test("the board reads the answer, and still shows the fixer's fixed and won't-fix answers", async () => {
        await runWith({
            entries: [
                ...inReview(),
                reviewFinished({
                    ticket: TICKET,
                    findings: [
                        finding({ id: 'R1-1', severity: 'blocker' }),
                        finding({ id: 'R1-2', severity: 'should_fix' }),
                        finding({ id: 'R1-3', severity: 'should_fix' }),
                    ],
                }),
                agentStarted({
                    ticket: TICKET,
                    role: 'implementer',
                    follow_up_of: sessionOf({
                        ticket: TICKET,
                        role: 'implementer',
                    }),
                }),
                agentFinished({
                    ticket: TICKET,
                    role: 'implementer',
                    result: {
                        outcome: 'done',
                        bad_test: null,
                        summary: 'Fixed one, declined one, passed one on.',
                        assumptions: [],
                        run_notes: [],
                        finding_responses: [
                            {
                                finding_id: 'R1-1',
                                response: 'fixed',
                                reason: '',
                            },
                            {
                                finding_id: 'R1-2',
                                response: 'wont_fix',
                                reason: 'Out of scope.',
                            },
                            {
                                finding_id: 'R1-3',
                                response: 'other_role',
                                reason: 'It needs a test.',
                            },
                        ],
                    },
                }),
            ],
        })

        expect(eventTexts().at(-1)).toContain(
            "#13: the implementer answered the findings: 1 fixed, 1 won't fix"
        )
        expect((await harness.ticket({ number: TICKET }))?.tried).toContain(
            "Won't fix R1-2: Out of scope."
        )
    })
})
