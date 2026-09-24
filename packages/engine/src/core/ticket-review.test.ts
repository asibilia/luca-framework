import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { MAX_FIX_ROUNDS } from './decide-build'

import type { ScriptedTurn } from '../agents/scripted-launcher'
import type { JournalRecord } from '../journal/journal-record'
import {
    createPracticeRepo,
    git,
    happyTurns,
    IMPLEMENTER_RESULT,
    SUM_TEST,
    TEST_WRITER_RESULT,
} from '../testing/practice-repo'

/**
 * Seam 2, the ticket review: the practice ticket end to end with scripted
 * agents whose reviewer reports findings. The gates, commits, join, and PR
 * are real.
 */

let root = ''
let practice: Awaited<ReturnType<typeof createPracticeRepo>>

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'luca-engine-review-'))
    practice = await createPracticeRepo({ root })
})

afterEach(async () => {
    await rm(root, { recursive: true, force: true })
})

const commits = (records: JournalRecord[]) =>
    records.flatMap((record) =>
        record.kind === 'commit_made'
            ? [
                  {
                      stage: record.content.stage,
                      sha: record.content.sha,
                      files: record.content.files,
                  },
              ]
            : []
    )

const SUM_TEST_WITH_NEGATIVES = SUM_TEST.replace(
    "    test('of no numbers is zero'",
    `    test('adds negative numbers', () => {
        expect(sum({ numbers: [-1, -2] })).toBe(-3)
    })

    test('of no numbers is zero'`
)

const RENAMED_SUM = `export const sum = ({ numbers }: { numbers: number[] }): number =>
    numbers.reduce((running, each) => running + each, 0)
`

const FIRST_REVIEW = {
    verdict: 'changes_requested',
    findings: [
        {
            id: 'R1-1',
            severity: 'should_fix',
            kind: 'code',
            file: 'src/sum.ts',
            title: 'Name the accumulator for what it holds',
            detail: 'total reads like the result; call it running.',
        },
        {
            id: 'R1-2',
            severity: 'blocker',
            kind: 'test',
            file: 'src/sum.test.ts',
            title: 'No test adds negative numbers',
            detail: 'AC1 says numbers, not positive numbers.',
        },
        {
            id: 'R1-3',
            severity: 'nit',
            kind: 'code',
            file: 'src/index.ts',
            title: 'Sort the exports',
            detail: '',
        },
        {
            id: 'R1-4',
            severity: 'should_fix',
            kind: 'code',
            file: 'src/sum.ts',
            title: 'Reject NaN',
            detail: 'A NaN makes the sum NaN.',
        },
    ],
    rulings: [],
    summary: 'Two fixes and one missing test.',
    assumptions: [],
}

/** The fixers of review round 1: a fresh test-writer, then the implementer. */
const firstFixers = (): ScriptedTurn[] => [
    {
        role: 'test-writer',
        ticket: 11,
        files: { 'src/sum.test.ts': SUM_TEST_WITH_NEGATIVES },
        result: {
            ...TEST_WRITER_RESULT,
            finding_responses: [
                { finding_id: 'R1-2', response: 'fixed', reason: '' },
            ],
        },
    },
    {
        role: 'implementer',
        ticket: 11,
        files: { 'src/sum.ts': RENAMED_SUM },
        result: {
            ...IMPLEMENTER_RESULT,
            finding_responses: [
                { finding_id: 'R1-1', response: 'fixed', reason: '' },
                {
                    finding_id: 'R1-4',
                    response: 'wont_fix',
                    reason: 'The spec only asks for numbers; NaN is out of scope.',
                },
            ],
        },
    },
]

const SECOND_REVIEW = {
    verdict: 'approve',
    findings: [
        {
            id: 'R2-1',
            severity: 'nit',
            kind: 'test',
            file: 'src/sum.test.ts',
            title: 'Group the negative case with AC1',
            detail: '',
        },
    ],
    rulings: [
        {
            finding_id: 'R1-4',
            ruling: 'accepted',
            reason: 'NaN handling is not in the ticket.',
        },
    ],
    summary: 'Fixed.',
    assumptions: [],
}

describe('the ticket review, end to end', () => {
    test('findings are fixed, pushback is ruled on, and a re-review sees only the new changes', async () => {
        const { testWriter, implementer } = happyTurns()
        const run = await practice.run({
            turns: [
                testWriter,
                implementer,
                { role: 'ticket-reviewer', ticket: 11, result: FIRST_REVIEW },
                ...firstFixers(),
                { role: 'ticket-reviewer', ticket: 11, result: SECOND_REVIEW },
            ],
        })

        expect(run.action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        // The final review's lenses (spec #10's) come after.
        const calls = run.launches
            .filter(({ ticket }) => ticket === 11)
            .map(
                ({ kind, role, session_id }) => `${kind} ${role} ${session_id}`
            )
        expect(calls).toEqual([
            'launch test-writer scripted-test-writer-11-1',
            'launch implementer scripted-implementer-11-2',
            'launch ticket-reviewer scripted-ticket-reviewer-11-3',
            'launch test-writer scripted-test-writer-11-4',
            'follow_up implementer scripted-implementer-11-2',
            'launch ticket-reviewer scripted-ticket-reviewer-11-6',
        ])

        const [red, green, fix] = commits(run.records)
        expect(commits(run.records).map(({ stage }) => stage)).toEqual([
            'red',
            'green',
            'fix',
        ])
        expect(fix?.files.toSorted()).toEqual(['src/sum.test.ts', 'src/sum.ts'])

        const [firstReview, , , secondReview] = run.launches.slice(2)
        expect(firstReview?.prompt).toContain(`..${green?.sha}\``)
        expect(firstReview?.prompt).toContain('- test (`bun test`): passed')
        expect(firstReview?.prompt).toContain(
            '- lint (`bun scripts/lint.ts`): passed'
        )
        expect(secondReview?.prompt).toContain(
            `git diff ${green?.sha}..${fix?.sha}`
        )
        expect(secondReview?.prompt).not.toContain(`${red?.sha}`)
        expect(secondReview?.prompt).toContain(
            "WON'T FIX. Reason: The spec only asks for numbers; NaN is out of scope."
        )

        const [testFixer, codeFixer] = run.launches.slice(3, 5)
        expect(testFixer?.prompt).toContain('No test adds negative numbers')
        expect(testFixer?.prompt).not.toContain('Reject NaN')
        expect(codeFixer?.prompt).toContain('Reject NaN')
        expect(codeFixer?.prompt).not.toContain('No test adds negative numbers')

        const [pr] = run.tracker.pullRequests()
        expect(pr?.body).toContain('## Nits')
        expect(pr?.body).toContain('#11 R1-3 (src/index.ts): Sort the exports')
        expect(pr?.body).toContain('#11 R2-1')
        expect(pr?.body).toContain('## Declined findings')
        expect(pr?.body).toContain(
            '#11 R1-4 (should-fix) (src/sum.ts): Reject NaN'
        )
        expect(pr?.body).toContain('NaN handling is not in the ticket.')

        const log = await git(
            practice.origin,
            'log',
            '--format=%s',
            pr?.head ?? 'none'
        )
        expect(log).toContain('fix: review round 1 for #11 Add sum')
    }, 60_000)

    test(`a review still asking for changes after ${MAX_FIX_ROUNDS} fix rounds is stuck, and no PR opens`, async () => {
        const { testWriter, implementer } = happyTurns()
        const stubborn = {
            role: 'ticket-reviewer' as const,
            ticket: 11,
            result: {
                verdict: 'changes_requested',
                findings: [FIRST_REVIEW.findings[0]],
            },
        }
        const refuse = {
            role: 'implementer' as const,
            ticket: 11,
            result: {
                ...IMPLEMENTER_RESULT,
                finding_responses: [
                    { finding_id: 'R1-1', response: 'wont_fix', reason: 'No.' },
                ],
            },
        }
        const run = await practice.run({
            turns: [
                testWriter,
                implementer,
                stubborn,
                refuse,
                stubborn,
                refuse,
                stubborn,
                refuse,
                stubborn,
            ],
        })

        expect(run.action).toMatchObject({
            type: 'done',
            outcome: 'stuck',
            reason: 'changes_requested',
        })
        expect(
            run.launches.filter(({ role }) => role === 'ticket-reviewer')
        ).toHaveLength(MAX_FIX_ROUNDS + 1)
        expect(run.tracker.pullRequests()).toEqual([])
        // Every "won't fix" changed nothing, so no fix commit was made.
        expect(commits(run.records).map(({ stage }) => stage)).toEqual([
            'red',
            'green',
            'fix',
            'fix',
            'fix',
        ])
        const [green, ...fixes] = commits(run.records).slice(1)
        const green_sha = green?.sha ?? 'none'
        expect(fixes.map(({ sha }) => sha)).toEqual([
            green_sha,
            green_sha,
            green_sha,
        ])
    }, 60_000)

    test('a verdict that disagrees with the findings is a failed try, and a fresh reviewer tries again', async () => {
        const { testWriter, implementer, reviewer } = happyTurns()
        const run = await practice.run({
            turns: [
                testWriter,
                implementer,
                {
                    role: 'ticket-reviewer',
                    ticket: 11,
                    result: {
                        verdict: 'approve',
                        findings: [FIRST_REVIEW.findings[1]],
                    },
                },
                reviewer,
            ],
        })

        expect(run.action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        const failed = run.records.find(({ kind }) => kind === 'agent_failed')
        expect(failed).toMatchObject({
            content: { role: 'ticket-reviewer', failure: 'result' },
        })
        expect(
            run.launches
                .filter(({ ticket }) => ticket === 11)
                .map(({ kind, role }) => `${kind} ${role}`)
                .slice(2)
        ).toEqual(['launch ticket-reviewer', 'launch ticket-reviewer'])
    }, 60_000)
})
