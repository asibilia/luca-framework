import { afterEach, describe, expect, test } from 'bun:test'

import { createHarness, type Harness } from './testing/board-harness'
import {
    agentFailed,
    agentSession,
    engineFinalFixerTurn,
    engineFinalFixesLanded,
    engineFinalReviewStarted,
    engineLensTurn,
    finalReviewFixing,
    finalReviewPassed,
    finalReviewShipped,
    finalReviewStuck,
    finding,
    intakeOfThree,
    pullRequestOpened,
    wholeTicket,
    type Entry,
} from './testing/journal-fixtures'

/**
 * Seam 3, the final review on the board: the records the engine journals
 * for it (#367), extra fields and ticket-less agent records included, drive
 * the lens stack, "Needs you", and the chat rows.
 */

let harness: Harness

afterEach(async () => {
    await harness.cleanup()
})

const LENSES = [
    'architecture',
    'simplification',
    'security',
    'integration',
    'rules',
]

/** Starts a run and sends intake plus `entries` in one go. */
const runWith = async ({ entries }: { entries: Entry[] }) => {
    harness = await createHarness()
    const { run_id, token } = await harness.start()
    const reply = await harness.send({
        run_id,
        token,
        entries: [...intakeOfThree(), ...entries],
    })
    return { run_id, token, reply }
}

const eventTexts = () =>
    harness
        .latestRows()
        .flatMap(({ row }) =>
            row.kind === 'luca-board-event' ? [row.data.text] : []
        )

const lensStates = async (): Promise<string[][]> =>
    (await harness.state()).final_review.lenses.map(({ name, state }) => [
        name,
        state,
    ])

const allTickets = (): Entry[] => [
    ...wholeTicket({ ticket: 11 }),
    ...wholeTicket({ ticket: 12 }),
    ...wholeTicket({ ticket: 13 }),
]

const SECURITY = finding({ id: 'security-S1', severity: 'should_fix' })

/** Round 1: every lens, the security lens with one should-fix. */
const firstRound = (): Entry[] => [
    engineFinalReviewStarted({ round: 1 }),
    ...LENSES.flatMap((lens) =>
        engineLensTurn({
            lens,
            round: 1,
            findings: lens === 'security' ? [SECURITY] : [],
        })
    ),
]

describe('the final review as the engine journals it', () => {
    test('a whole final review: five lenses, a fix round, a re-review of the dirty lens, passed', async () => {
        const { run_id, token, reply } = await runWith({
            entries: [
                ...allTickets(),
                ...firstRound(),
                finalReviewFixing({ round: 1 }),
                ...engineFinalFixerTurn({
                    role: 'implementer',
                    responses: [
                        {
                            finding_id: 'security-S1',
                            response: 'fixed',
                            reason: '',
                        },
                    ],
                }),
                ...engineFinalFixesLanded({ round: 1 }),
                engineFinalReviewStarted({ round: 2, lenses: ['security'] }),
            ],
        })
        expect(reply.ok).toBe(true)

        const reReviewing = await harness.state()
        expect(reReviewing.run.status).toBe('final_review')
        expect(reReviewing.final_review).toMatchObject({
            state: 'reviewing',
            round: 2,
            fix_round: 1,
            active: true,
        })
        // Clean lenses stay clean; only the dirty one looks again.
        expect(await lensStates()).toEqual([
            ['architecture', 'clean'],
            ['simplification', 'clean'],
            ['security', 'waiting'],
            ['integration', 'clean'],
            ['rules', 'clean'],
        ])
        // Ticket-less records leave the ticket cards alone.
        expect(
            reReviewing.tickets.map(({ number, stage }) => [number, stage])
        ).toEqual([
            [11, 'done'],
            [12, 'done'],
            [13, 'done'],
        ])

        await harness.send({
            run_id,
            token,
            first_seq: reply.next_seq,
            entries: [
                ...engineLensTurn({ lens: 'security', round: 2 }),
                finalReviewPassed(),
                pullRequestOpened({
                    number: 7,
                    url: 'https://github.com/acme/app/pull/7',
                }),
            ],
        })

        const passed = await harness.state()
        expect(passed.final_review.state).toBe('passed')
        expect(await lensStates()).toEqual(
            LENSES.map((lens) => [lens, 'clean'])
        )
        expect(passed.run.status).toBe('done')

        const texts = eventTexts()
        expect(texts).toContain('The final review started (round 1).')
        expect(texts).toContain('Final review, security lens: 1 should-fix.')
        expect(texts).toContain('Final review: fix round 1/3.')
        expect(texts).toContain(
            "Final review: a fresh implementer fixes the lenses' findings on the whole run branch."
        )
        expect(texts).toContain(
            "Final review: the implementer answered the findings: 1 fixed, 0 won't fix."
        )
        expect(texts).toContain('Final review: checks passed on the fixes.')
        expect(texts).toContain(
            'Final review: the fixes committed on the run branch.'
        )
        expect(texts).toContain('The final review passed.')
        // No odd rows for ticket-less records, and none per lens agent.
        expect(texts.some((text) => text.includes('null'))).toBe(false)
        expect(texts.some((text) => text.includes('-lens'))).toBe(false)
    })

    test('a failed lens try and failed checks on the fixes are tried lines, not ticket rows', async () => {
        await runWith({
            entries: [
                ...allTickets(),
                ...firstRound().slice(0, 3),
                {
                    ...agentSession({
                        ticket: 0,
                        role: 'architecture-lens',
                        input: 10,
                        output: 20,
                    }),
                    ticket: null,
                },
                {
                    ...agentFailed({
                        ticket: 0,
                        role: 'architecture-lens',
                        error: 'No structured output.',
                        failure: 'result',
                    }),
                    ticket: null,
                },
                ...firstRound().slice(3),
                finalReviewFixing({ round: 1 }),
                ...engineFinalFixesLanded({ round: 1, gates_ok: false }).slice(
                    0,
                    1
                ),
            ],
        })

        const state = await harness.state()
        expect(state.final_review.tried).toEqual([
            'The architecture lens gave no usable result: No structured output.',
            "Fix round 1/3 on the lenses' findings",
            "The checks failed on the final review's fixes: test",
        ])
        const texts = eventTexts()
        expect(texts).toContain(
            'Final review: the architecture lens gave no usable result: No structured output.'
        )
        expect(texts).toContain(
            'Final review: checks failed on the fixes: test.'
        )
    })

    test('a stuck final review asks for a reply; a ship resolves it and the PR opens', async () => {
        const { run_id, token, reply } = await runWith({
            entries: [
                ...allTickets(),
                ...firstRound(),
                finalReviewStuck({
                    reason: 'changes_requested',
                    detail: '- security-S1 [should-fix, code]: Finding',
                }),
            ],
        })

        const stuck = await harness.state()
        expect(stuck.run.status).toBe('stuck')
        expect(stuck.needs_you).toEqual([
            expect.objectContaining({
                key: 'final',
                subject: 'The final review is stuck',
                reason: 'The lenses still ask for changes after 3 fix rounds.',
                replies: ['retry', 'stop', 'ship'],
            }),
        ])

        await harness.send({
            run_id,
            token,
            first_seq: reply.next_seq,
            entries: [
                finalReviewShipped(),
                pullRequestOpened({
                    number: 8,
                    url: 'https://github.com/acme/app/pull/8',
                }),
            ],
        })

        const shipped = await harness.state()
        expect(shipped.needs_you).toEqual([])
        expect(shipped.final_review.state).toBe('passed')
        expect(shipped.run.status).toBe('done')
        const stuckRow = harness
            .latestRows()
            .find(({ row }) => row.kind === 'luca-board-stuck')
        expect(stuckRow?.row).toMatchObject({
            data: {
                status: 'resolved',
                resolution:
                    'You replied `ship`: the PR opens with the open findings listed at the top.',
            },
        })
    })
})
