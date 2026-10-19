import { describe, expect, test } from 'bun:test'

import { oneSteps } from './decide-stuck-helpers'

import type { JournalEntry } from '../journal/journal-record'
import {
    baselineTests,
    commentRead,
    replyReceived,
    runBranchCreated,
    SESSIONS,
    ticketBuilt,
    ticketPath,
    ticketStuck,
    ticketWorktreeCreated,
    worktreesRemoved,
} from '../testing/build-fixtures'
import {
    finalReviewFixing,
    finalReviewRetried,
    finalReviewStuck,
    lensFinding,
    lensRound,
} from '../testing/final-review-fixtures'

/**
 * Seam 1 for stuck work (#617): a change only the owner may make, asked for
 * by a ticket's agent or by a final review fixer. It need not be a test
 * setup file: here it is a binary file no agent can write.
 */

const FILE = 'assets/logo.png'
const REASON =
    'The logo must be a real PNG, and agents cannot write binary files.'
const OWNER_ONLY = /a change only you may make/i

/** The owner-change answer of a fixer or a ticket's agent. */
const needsChange = ({
    ticket,
    role,
}: {
    ticket: number | null
    role: 'test-writer' | 'implementer'
}): JournalEntry => ({
    kind: 'agent_finished',
    ticket,
    role,
    content: {
        role,
        session_id: SESSIONS[role],
        result: {
            outcome: 'needs_setup_change',
            setup_change: { file: FILE, reason: REASON },
        },
    },
})

/** #11 pushed; the final review's security lens asked for a fix. */
const finalFixing = (): JournalEntry[] => [
    runBranchCreated(),
    ...ticketBuilt({ ticket: 11 }),
    ...lensRound({
        round: 1,
        findings: {
            security: [
                lensFinding({ id: 'S1', title: 'Sum trusts its input' }),
            ],
        },
    }),
    finalReviewFixing({ round: 1 }),
]

/** The final review's implementer fixer asked for the owner's change. */
const finalNeedsChange = (): JournalEntry[] => [
    ...finalFixing(),
    needsChange({ ticket: null, role: 'implementer' }),
]

/** The final review stuck on the change its decision step asked for. */
const finalStuck = (): JournalEntry[] => {
    const [step] = oneSteps(finalNeedsChange())
    if (step?.type !== 'mark_final_review_stuck') throw new Error(step?.type)
    return [
        ...finalNeedsChange(),
        finalReviewStuck({ reason: step.reason, detail: step.detail }),
        worktreesRemoved({ paths: [ticketPath(11)] }),
    ]
}

const finalTold = (): JournalEntry[] => [
    ...finalStuck(),
    {
        kind: 'stuck_reported',
        ticket: null,
        role: null,
        content: { comment_id: 150, body: 'stuck' },
    },
]

/** #11's implementer asked for the owner's change. */
const ticketNeedsChange = (): JournalEntry[] => [
    runBranchCreated(),
    ticketWorktreeCreated({ ticket: 11 }),
    baselineTests({ ticket: 11 }),
    ...ticketBuilt({ ticket: 11 }).slice(2, 6),
    needsChange({ ticket: 11, role: 'implementer' }),
]

const reportBody = (entries: JournalEntry[]): string => {
    const [step] = oneSteps(entries)
    if (step?.type === 'report_stuck') return step.body
    if (step?.type === 'report_final_review_stuck') return step.body
    throw new Error(step?.type)
}

describe('a change only the owner may make, at the final review', () => {
    test("a final review implementer's needs_setup_change makes the final review stuck as setup_change_needed, naming the file and reason", () => {
        const steps = oneSteps(finalNeedsChange())

        expect(steps).toEqual([
            {
                type: 'mark_final_review_stuck',
                reason: 'setup_change_needed',
                detail: expect.stringContaining(FILE),
            },
        ])
        const detail =
            steps[0]?.type === 'mark_final_review_stuck' ? steps[0].detail : ''
        expect(detail).toContain(REASON)
    })

    test("a final review test-writer's needs_setup_change makes the final review stuck as setup_change_needed", () => {
        const steps = oneSteps([
            runBranchCreated(),
            ...ticketBuilt({ ticket: 11 }),
            ...lensRound({
                round: 1,
                findings: {
                    architecture: [
                        lensFinding({
                            id: 'A1',
                            kind: 'test',
                            file: 'src/sum.test.ts',
                        }),
                    ],
                },
            }),
            finalReviewFixing({ round: 1 }),
            needsChange({ ticket: null, role: 'test-writer' }),
        ])

        expect(steps).toEqual([
            {
                type: 'mark_final_review_stuck',
                reason: 'setup_change_needed',
                detail: expect.stringContaining(REASON),
            },
        ])
    })

    test('the stuck final review comment names the file and reason as a change only the owner may make, not a test setup file', () => {
        const body = reportBody(finalStuck())

        expect(body).toContain('The final review is stuck')
        expect(body).toMatch(OWNER_ONLY)
        expect(body).toContain(FILE)
        expect(body).toContain(REASON)
        expect(body).not.toContain('test setup file')
    })

    test('`retry` after it starts the fix round over with a fresh implementer, as for a ticket', () => {
        const retrying = [
            ...finalTold(),
            commentRead({ comment_id: 160, body: 'retry' }),
            replyReceived({ word: 'retry', ticket: null, comment_id: 160 }),
        ]
        expect(oneSteps(retrying)).toEqual([{ type: 'retry_final_review' }])

        const retried = [...retrying, finalReviewRetried()]
        expect(oneSteps(retried)).toEqual([
            { type: 'start_final_fix', round: 1 },
        ])
        expect(
            oneSteps([...retried, finalReviewFixing({ round: 1 })])
        ).toMatchObject([{ type: 'launch_final_fixer', role: 'implementer' }])
    })
})

describe('a change only the owner may make, for a ticket', () => {
    test('the stuck ticket comment names the file and reason as a change only the owner may make, not a test setup file', () => {
        const [stuck] = oneSteps(ticketNeedsChange())
        if (stuck?.type !== 'mark_stuck') throw new Error(stuck?.type)
        expect(stuck.detail).toContain(FILE)
        expect(stuck.detail).toContain(REASON)

        const body = reportBody([
            ...ticketNeedsChange(),
            ticketStuck({
                ticket: 11,
                reason: stuck.reason,
                detail: stuck.detail,
            }),
        ])

        expect(body).toMatch(OWNER_ONLY)
        expect(body).toContain(FILE)
        expect(body).toContain(REASON)
        expect(body).not.toContain('test setup file')
    })

    test("an older engine's setup_change_needed stuck still replays, its detail told word for word under the new wording", () => {
        const oldDetail =
            'The implementer needs the test setup file `test/setup.ts` changed: The fake clock must be installed before each test.\n' +
            "Agents may never change a test setup file. Make the change yourself in the ticket's worktree, then reply retry."

        const body = reportBody([
            ...ticketNeedsChange(),
            ticketStuck({
                ticket: 11,
                reason: 'setup_change_needed',
                detail: oldDetail,
            }),
        ])

        expect(body).toContain(oldDetail)
        expect(body).toMatch(OWNER_ONLY)
    })
})
