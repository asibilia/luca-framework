import { afterEach, describe, expect, test } from 'bun:test'

import { createHarness, type Harness } from './testing/board-harness'
import {
    agentSession,
    engineFinalReviewStarted,
    engineLensTurn,
    finalReviewPassed,
    intakeOfThree,
    learnerFailed,
    learnerFinished,
    learnerStarted,
    learningSkipped,
    memoriesReported,
    memoriesSaved,
    memoryRecalled,
    wholeTicket,
    type Entry,
} from './testing/journal-fixtures'

/**
 * Seam 3 for memory (#370): the engine's memory records are counted on the
 * panel, the learner gets its own rows, and its ticket-less agent records
 * are never taken for the final review's.
 */

let harness: Harness

afterEach(async () => {
    await harness.cleanup()
})

const runWith = async ({ entries }: { entries: Entry[] }) => {
    harness = await createHarness()
    const { run_id, token } = await harness.start()
    const reply = await harness.send({
        run_id,
        token,
        entries: [...intakeOfThree(), ...entries],
    })
    return { run_id, token, next: reply.next_seq }
}

const eventTexts = () =>
    harness
        .latestRows()
        .flatMap(({ row }) =>
            row.kind === 'luca-board-event' ? [row.data.text] : []
        )

/** Every ticket done and a clean final review: the learner is next. */
const reviewed = (): Entry[] => [
    ...wholeTicket({ ticket: 11 }),
    ...wholeTicket({ ticket: 12 }),
    ...wholeTicket({ ticket: 13 }),
    engineFinalReviewStarted({ round: 1 }),
    ...[
        'architecture',
        'simplification',
        'security',
        'integration',
        'rules',
    ].flatMap((lens) => engineLensTurn({ lens, round: 1 })),
    finalReviewPassed(),
]

describe('memory on the board', () => {
    test('searches are counted quietly, with a row only when a vault failed', async () => {
        await runWith({
            entries: [
                memoryRecalled({ point: 'run_start', memories: 2 }),
                memoryRecalled({ ticket: 11, point: 'ticket', memories: 1 }),
                memoryRecalled({
                    ticket: 12,
                    point: 'ticket',
                    memories: 0,
                    failed: ['luca-monorepo'],
                }),
            ],
        })
        const state = await harness.state()
        expect(state.memory).toMatchObject({
            searches: 3,
            search_errors: 1,
            shown: 3,
            learner: 'waiting',
        })
        const texts = eventTexts().filter((text) => text.includes('memory'))
        expect(texts).toEqual([
            '#12: memory search for a ticket failed in luca-monorepo: MuninnDB did not answer within 10000 ms. The run goes on.',
        ])
    })

    test("the learner has its own rows and state, and its records are not the final review's", async () => {
        const { run_id, token, next } = await runWith({ entries: reviewed() })
        const before = await harness.state()

        await harness.send({
            run_id,
            token,
            first_seq: next,
            entries: [
                learnerStarted(),
                agentSession({ ticket: null, role: 'learner' }),
                learnerFailed(),
                learnerStarted(),
                learnerFinished({ memories: 2, helped: ['m-1'] }),
                memoriesSaved({ outcomes: ['added', 'updated', 'refused'] }),
            ],
        })
        const after = await harness.state()

        expect(after.final_review).toEqual(before.final_review)
        expect(after.tickets).toEqual(before.tickets)
        expect(after.memory).toMatchObject({
            learner: 'learned',
            added: 1,
            updated: 1,
            refused: 1,
            failed: 0,
        })
        const texts = eventTexts()
        expect(texts).toContain(
            "The learner reads the run's journal for lessons to keep."
        )
        expect(texts).toContain(
            'The learner gave no usable result: No structured output.'
        )
        expect(texts).toContain(
            'The learner proposed 2 memories; 1 shown memory helped.'
        )
        expect(texts).toContain(
            'Memories saved: 1 added, 1 updated, 1 refused, 0 failed.'
        )
        expect(
            texts.some((text) => text.startsWith('Final review: the learner'))
        ).toBe(false)
    })

    test('a skipped learner and memories listed on the spec issue', async () => {
        await runWith({
            entries: [learningSkipped(), memoriesReported({ count: 2 })],
        })
        expect((await harness.state()).memory.learner).toBe('skipped')
        const texts = eventTexts()
        expect(texts).toContain(
            'The learner was skipped: The learner failed 3 tries; the last one: x The run ends without new memories.'
        )
        expect(texts).toContain(
            'The 2 new memories went on the spec issue, since there is no PR.'
        )
    })
})
