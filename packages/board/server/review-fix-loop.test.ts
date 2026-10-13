import { afterEach, describe, expect, test } from 'bun:test'

import { createHarness, type Harness } from './testing/board-harness'
import {
    agentFailed,
    agentFinished,
    agentStarted,
    commitMade,
    finding,
    fixerFinished,
    gatesRun,
    intakeOfThree,
    leftoverScan,
    redCheck,
    reviewFinished,
    sessionOf,
    ticketStuck,
    ticketWorktreeCreated,
    type Entry,
    type Finding,
} from './testing/journal-fixtures'

let harness: Harness
let sent = { run_id: '', token: '', next_seq: 1 }

afterEach(async () => {
    await harness.cleanup()
})

const TICKET = 13

/** Starts a run and sends intake plus `entries` in one go. */
const runWith = async ({ entries }: { entries: Entry[] }) => {
    harness = await createHarness()
    const { run_id, token } = await harness.start()
    const reply = await harness.send({
        run_id,
        token,
        entries: [...intakeOfThree(), ...entries],
    })
    sent = { run_id, token, next_seq: reply.next_seq }
}

/** Sends more records to the same run, after the ones already sent. */
const sendMore = async ({ entries }: { entries: Entry[] }) => {
    const reply = await harness.send({
        run_id: sent.run_id,
        token: sent.token,
        entries,
        first_seq: sent.next_seq,
    })
    sent = { ...sent, next_seq: reply.next_seq }
}

/** The chat's event rows, as text and tone, oldest first. */
const eventRows = () =>
    harness
        .latestRows()
        .flatMap(({ row }) =>
            row.kind === 'luca-board-event'
                ? [{ text: row.data.text, tone: row.data.tone }]
                : []
        )

const card = () => harness.ticket({ number: TICKET })

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

const FINDINGS: Finding[] = [
    finding({ id: 'R1-1', severity: 'blocker', kind: 'code' }),
    finding({ id: 'R1-2', severity: 'should_fix', kind: 'test' }),
    finding({ id: 'R1-3', severity: 'nit' }),
    finding({ id: 'R1-4', severity: 'nit' }),
]

/** The fresh test-writer's start in a review fix round. */
const freshTestWriter = () =>
    agentStarted({ ticket: TICKET, role: 'test-writer', follow_up_of: null })

/** The implementer's follow-up in its build session. */
const implementerFollowUp = () =>
    agentStarted({
        ticket: TICKET,
        role: 'implementer',
        follow_up_of: sessionOf({ ticket: TICKET, role: 'implementer' }),
    })

/** One whole review fix round on code findings, then the re-review's start. */
const codeFixRound = (): Entry[] => [
    implementerFollowUp(),
    fixerFinished({
        ticket: TICKET,
        role: 'implementer',
        responses: [{ finding_id: 'R1-1', response: 'fixed', reason: '' }],
    }),
    gatesRun({ ticket: TICKET, ok: true }),
    leftoverScan({ ticket: TICKET, stage: 'fix' }),
    commitMade({ ticket: TICKET, stage: 'fix' }),
    agentStarted({ ticket: TICKET, role: 'ticket-reviewer' }),
]

const blockerOnly = [finding({ id: 'R1-1', severity: 'blocker' })]

describe('the ticket review', () => {
    test('changes requested: the latest counts, an open review, and a warning row', async () => {
        await runWith({
            entries: [
                ...inReview(),
                reviewFinished({ ticket: TICKET, findings: FINDINGS }),
            ],
        })

        expect(await card()).toMatchObject({
            stage: 'reviewing',
            step: 4,
            open_check: 'review',
            activity: 'changes requested',
            findings: { blocker: 1, should_fix: 1, nit: 2 },
        })
        expect(eventRows().at(-1)).toEqual({
            text: '#13: the ticket review asked for changes: 1 blocker, 1 should-fix, 2 nits.',
            tone: 'warning',
        })
    })

    test('an approval with only nits says how many', async () => {
        await runWith({
            entries: [
                ...inReview(),
                reviewFinished({
                    ticket: TICKET,
                    findings: FINDINGS.filter(
                        ({ severity }) => severity === 'nit'
                    ),
                }),
            ],
        })

        expect(await card()).toMatchObject({
            step: 5,
            open_check: null,
            activity: 'approved',
            findings: { blocker: 0, should_fix: 0, nit: 2 },
        })
        expect(eventRows().at(-1)).toEqual({
            text: '#13: the ticket review approved it (2 nits).',
            tone: 'success',
        })
    })
})

describe('the review fix loop', () => {
    test('a fresh test-writer and the implementer fix one round; the card stays in Reviewing', async () => {
        await runWith({
            entries: [
                ...inReview(),
                reviewFinished({ ticket: TICKET, findings: FINDINGS }),
                freshTestWriter(),
            ],
        })

        expect(await card()).toMatchObject({
            stage: 'reviewing',
            step: 4,
            role: 'test-writer',
            review_fix_round: 1,
            fix_round: 0,
            activity: "fixing the review's findings (1/3)",
        })
        expect((await card())?.tried.at(-1)).toBe(
            'Review fix round 1/3: 1 blocker, 1 should-fix'
        )
        expect(eventRows().at(-1)).toEqual({
            text: '#13: review fix round 1/3: a fresh test-writer fixes the test findings.',
            tone: 'warning',
        })

        await sendMore({
            entries: [
                fixerFinished({
                    ticket: TICKET,
                    role: 'test-writer',
                    responses: [
                        {
                            finding_id: 'R1-2',
                            response: 'wont_fix',
                            reason: 'The test already covers it.',
                        },
                    ],
                }),
                implementerFollowUp(),
            ],
        })

        const fixing = await card()
        expect(fixing).toMatchObject({
            stage: 'reviewing',
            step: 4,
            role: 'implementer',
            review_fix_round: 1,
            activity: "fixing the review's findings (1/3)",
        })
        expect(
            fixing?.tried.filter((line) => line.startsWith('Review fix round'))
        ).toHaveLength(1)
        expect(fixing?.tried).toContain(
            "Won't fix R1-2: The test already covers it."
        )
        expect(eventRows().slice(-2)).toEqual([
            {
                text: "#13: the test-writer answered the findings: 0 fixed, 1 won't fix.",
                tone: 'info',
            },
            {
                text: '#13: review fix round 1/3: the implementer got the findings back.',
                tone: 'warning',
            },
        ])
    })

    test('the fixes are committed and a re-review rules on the declined findings', async () => {
        await runWith({
            entries: [
                ...inReview(),
                reviewFinished({ ticket: TICKET, findings: blockerOnly }),
                ...codeFixRound(),
            ],
        })

        expect(await card()).toMatchObject({
            stage: 'reviewing',
            step: 4,
            review_round: 2,
            review_fix_round: 1,
            open_check: null,
            activity: 're-reviewing',
        })
        expect(eventRows().slice(-2)).toEqual([
            { text: '#13: review fixes committed.', tone: 'info' },
            { text: '#13: re-review 2 of the new changes.', tone: 'info' },
        ])

        await sendMore({
            entries: [
                reviewFinished({
                    ticket: TICKET,
                    findings: [finding({ id: 'R2-1', severity: 'nit' })],
                    rulings: [
                        {
                            finding_id: 'R1-2',
                            ruling: 'accepted',
                            reason: 'Out of scope.',
                        },
                        {
                            finding_id: 'R1-5',
                            ruling: 'rejected',
                            reason: 'It still breaks.',
                        },
                    ],
                }),
            ],
        })

        const approved = await card()
        expect(approved).toMatchObject({
            step: 5,
            activity: 'approved',
            findings: { blocker: 0, should_fix: 0, nit: 1 },
        })
        expect(approved?.tried.slice(-2)).toEqual([
            'Declined R1-2 accepted: Out of scope.',
            'R1-5 still stands: It still breaks.',
        ])
    })

    test('failed checks inside a review fix round run the usual gate fix loop', async () => {
        await runWith({
            entries: [
                ...inReview(),
                reviewFinished({ ticket: TICKET, findings: blockerOnly }),
                implementerFollowUp(),
                agentFinished({ ticket: TICKET, role: 'implementer' }),
                gatesRun({ ticket: TICKET, ok: false }),
                implementerFollowUp(),
            ],
        })

        expect(await card()).toMatchObject({
            stage: 'reviewing',
            open_check: 'gates',
            fix_round: 1,
            review_fix_round: 1,
            activity: 'fixing (1/3)',
        })
        expect(eventRows().at(-1)).toEqual({
            text: '#13: fix round 1/3: the implementer got the failure back.',
            tone: 'warning',
        })
    })

    test('a failed fixer turn is retried, not a new review fix round', async () => {
        await runWith({
            entries: [
                ...inReview(),
                reviewFinished({ ticket: TICKET, findings: blockerOnly }),
                implementerFollowUp(),
                agentFailed({
                    ticket: TICKET,
                    role: 'implementer',
                    failure: 'engine',
                    error: 'The session was lost.',
                }),
                agentStarted({
                    ticket: TICKET,
                    role: 'implementer',
                    follow_up_of: null,
                }),
            ],
        })

        expect(await card()).toMatchObject({
            stage: 'reviewing',
            review_fix_round: 1,
            activity: 'coding again',
        })
        expect(eventRows().at(-1)).toEqual({
            text: '#13: the implementer tries again.',
            tone: 'warning',
        })
    })

    test('an implementer whose session was lost still starts a review fix round', async () => {
        await runWith({
            entries: [
                ...inReview(),
                reviewFinished({ ticket: TICKET, findings: blockerOnly }),
                agentStarted({
                    ticket: TICKET,
                    role: 'implementer',
                    follow_up_of: null,
                }),
            ],
        })

        expect(await card()).toMatchObject({
            review_fix_round: 1,
            activity: "fixing the review's findings (1/3)",
        })
        expect(eventRows().at(-1)).toEqual({
            text: '#13: review fix round 1/3: the implementer got the findings back.',
            tone: 'warning',
        })
    })

    test('the rounds count up to 3, then the ticket is stuck', async () => {
        const changes = reviewFinished({
            ticket: TICKET,
            findings: blockerOnly,
        })
        await runWith({
            entries: [
                ...inReview(),
                changes,
                ...codeFixRound(),
                changes,
                ...codeFixRound(),
                changes,
                ...codeFixRound(),
                changes,
                ticketStuck({
                    ticket: TICKET,
                    reason: 'changes_requested',
                    detail: 'R1-1 still stands.',
                }),
            ],
        })

        const stuck = await card()
        expect(stuck).toMatchObject({
            stage: 'stuck',
            review_round: 4,
            review_fix_round: 3,
        })
        expect(
            eventRows()
                .map(({ text }) => text)
                .filter((text) => text.includes('review fix round'))
        ).toEqual([
            '#13: review fix round 1/3: the implementer got the findings back.',
            '#13: review fix round 2/3: the implementer got the findings back.',
            '#13: review fix round 3/3: the implementer got the findings back.',
        ])
        expect((await harness.state()).needs_you[0]?.reason).toBe(
            'The ticket review asked for changes.'
        )
    })
})
