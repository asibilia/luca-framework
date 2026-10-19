import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import type { JournalRecord } from '../journal/journal-record'
import {
    APPROVE,
    createPracticeRepo,
    git,
    happyTurns,
    IMPLEMENTER_RESULT,
    SUM_TEST,
    TEST_WRITER_RESULT,
} from '../testing/practice-repo'

/**
 * Seam 2, the ticket review (#616): a code finding that also needs a test.
 * The implementer fixes the code and answers `other_role`, so a fresh
 * test-writer writes the test in the same fix round, before the gates. The
 * gates, commits, join, and PR are real.
 */

let root = ''
let practice: Awaited<ReturnType<typeof createPracticeRepo>>

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'luca-engine-other-role-'))
    practice = await createPracticeRepo({ root })
})

afterEach(async () => {
    await rm(root, { recursive: true, force: true })
})

const commits = (records: JournalRecord[]) =>
    records.flatMap((record) =>
        record.kind === 'commit_made'
            ? [{ stage: record.content.stage, files: record.content.files }]
            : []
    )

const SUM_REJECTING_NAN = `export const sum = ({ numbers }: { numbers: number[] }): number => {
    if (numbers.some((each) => Number.isNaN(each))) {
        throw new Error('sum takes numbers, not NaN')
    }
    return numbers.reduce((total, each) => total + each, 0)
}
`

const SUM_TEST_WITH_NAN = SUM_TEST.replace(
    "    test('of no numbers is zero'",
    `    test('rejects NaN', () => {
        expect(() => sum({ numbers: [1, Number.NaN] })).toThrow()
    })

    test('of no numbers is zero'`
)

const REVIEW = {
    verdict: 'changes_requested',
    findings: [
        {
            id: 'R1-1',
            severity: 'should_fix',
            kind: 'code',
            file: 'src/sum.ts',
            title: 'Reject NaN',
            detail: 'A NaN makes the sum NaN; throw instead, with a test.',
        },
    ],
    rulings: [],
    summary: 'One code fix that needs a test.',
    assumptions: [],
}

describe('a code finding that needs a test, end to end', () => {
    test('the implementer fixes the code and answers other_role; a fresh test-writer adds the test in the same fix round', async () => {
        const { testWriter, implementer } = happyTurns()
        const run = await practice.run({
            turns: [
                testWriter,
                implementer,
                { role: 'ticket-reviewer', ticket: 11, result: REVIEW },
                {
                    role: 'implementer',
                    ticket: 11,
                    files: { 'src/sum.ts': SUM_REJECTING_NAN },
                    result: {
                        ...IMPLEMENTER_RESULT,
                        finding_responses: [
                            {
                                finding_id: 'R1-1',
                                response: 'other_role',
                                reason: 'The NaN check needs a test, and only the test-writer may write one.',
                            },
                        ],
                    },
                },
                {
                    role: 'test-writer',
                    ticket: 11,
                    files: { 'src/sum.test.ts': SUM_TEST_WITH_NAN },
                    result: {
                        ...TEST_WRITER_RESULT,
                        finding_responses: [
                            {
                                finding_id: 'R1-1',
                                response: 'fixed',
                                reason: '',
                            },
                        ],
                    },
                },
                { role: 'ticket-reviewer', ticket: 11, result: APPROVE },
            ],
        })

        expect(run.action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        const ticketLaunches = run.launches.filter(
            ({ ticket }) => ticket === 11
        )
        expect(
            ticketLaunches.map(({ kind, role }) => `${kind} ${role}`)
        ).toEqual([
            'launch test-writer',
            'launch implementer',
            'launch ticket-reviewer',
            'launch implementer',
            'launch test-writer',
            'launch ticket-reviewer',
        ])
        expect(ticketLaunches[4]?.prompt).toContain('Reject NaN')

        expect(commits(run.records).map(({ stage }) => stage)).toEqual([
            'red',
            'green',
            'fix',
        ])
        expect(commits(run.records)[2]?.files.toSorted()).toEqual([
            'src/sum.test.ts',
            'src/sum.ts',
        ])

        const [pr] = run.tracker.pullRequests()
        const shipped = await git(
            practice.origin,
            'show',
            `${pr?.head ?? 'none'}:src/sum.test.ts`
        )
        expect(shipped).toContain("test('rejects NaN'")
    }, 60_000)
})
