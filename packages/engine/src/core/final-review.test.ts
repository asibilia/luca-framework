import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { shipFinalReview } from './execute-final-review'
import { MAX_FIX_ROUNDS } from './loop-caps'

import { LENS_ROLES, lensRole, type LensName } from '../agents/role-results'
import type { ScriptedCall, ScriptedTurn } from '../agents/scripted-launcher'
import type { JournalRecord } from '../journal/journal-record'
import {
    createPracticeRepo,
    git,
    HAPPY_TURNS,
    happyTurns,
    IMPLEMENTER_RESULT,
    PRACTICE_ENGINE_CONFIG,
    SUM_TEST,
    TEST_WRITER_RESULT,
} from '../testing/practice-repo'

/**
 * Seam 2, the final review: the practice ticket end to end with scripted
 * agents, then the five lenses on the whole run branch. The gates, commits,
 * pushes, and PR are real. Final review agents run as spec #10's.
 */

let root = ''

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'luca-engine-final-'))
})

afterEach(async () => {
    await rm(root, { recursive: true, force: true })
})

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

/** A lens turn with these findings (none: it approves). */
const lensTurn = ({
    lens,
    findings,
    rulings,
}: {
    lens: LensName
    findings?: object[]
    rulings?: object[]
}): ScriptedTurn => ({
    role: lensRole({ lens }),
    ticket: 10,
    result: {
        verdict: (findings ?? []).length > 0 ? 'changes_requested' : 'approve',
        findings: findings ?? [],
        rulings: rulings ?? [],
        summary: `The ${lens} lens looked.`,
        assumptions: [],
    },
})

const SECURITY_FINDING = {
    id: 'S1',
    severity: 'should_fix',
    kind: 'code',
    file: 'src/sum.ts',
    title: 'Name the accumulator for what it holds',
    detail: 'total reads like the result.',
}

const ARCHITECTURE_FINDING = {
    id: 'A1',
    severity: 'blocker',
    kind: 'test',
    file: 'src/sum.test.ts',
    title: 'No test adds negative numbers',
    detail: 'The seam should hold for any numbers.',
}

const commitsOf = (records: JournalRecord[]) =>
    records.flatMap((record) =>
        record.kind === 'commit_made'
            ? [
                  {
                      ticket: record.ticket,
                      stage: record.content.stage,
                      sha: record.content.sha,
                      files: record.content.files,
                  },
              ]
            : []
    )

const lensCalls = (launches: ScriptedCall[]) =>
    launches.filter(({ role }) => role.endsWith('-lens'))

describe('the final review, end to end', () => {
    test('a clean final review of the whole run branch opens the PR', async () => {
        const practice = await createPracticeRepo({ root })
        const run = await practice.run({ turns: HAPPY_TURNS })

        expect(run.action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        const lenses = lensCalls(run.launches)
        expect(lenses.map(({ role }) => role).toSorted()).toEqual(
            LENS_ROLES.toSorted()
        )
        expect(lenses.every(({ ticket }) => ticket === 10)).toBe(true)
        expect(
            lenses.every(({ may_edit_tests }) => may_edit_tests === false)
        ).toBe(true)

        // The five lenses started at once: all before any finished.
        const kinds = run.records
            .filter((record) => record.role?.endsWith('-lens'))
            .map(({ kind }) => kind)
        expect(kinds.slice(0, 5)).toEqual(
            Array.from({ length: 5 }, () => 'agent_started')
        )

        // Each reviewed the whole run branch, from where it started.
        const started = run.records.find(
            (record) => record.kind === 'final_review_started'
        )
        if (started?.kind !== 'final_review_started') throw new Error('none')
        const base = run.records.find(
            (record) => record.kind === 'run_branch_created'
        )
        expect(started.content.from_sha).toBe(
            base?.kind === 'run_branch_created' ? base.content.base_sha : ''
        )
        expect(started.content.files).toEqual([
            'src/index.ts',
            'src/sum.test.ts',
            'src/sum.ts',
        ])
        for (const { prompt } of lenses) {
            expect(prompt).toContain(
                `git diff ${started.content.from_sha}..${started.content.head_sha}`
            )
            expect(prompt).toContain('### Ticket #11: Add sum')
        }
        expect(
            run.records.findIndex(({ kind }) => kind === 'final_review_passed')
        ).toBeLessThan(
            run.records.findIndex(({ kind }) => kind === 'pull_request_opened')
        )
        expect(run.tracker.pullRequests()).toHaveLength(1)
    }, 60_000)

    test('a code finding and a test finding are fixed on the whole run branch, then re-reviewed', async () => {
        const practice = await createPracticeRepo({ root })
        const run = await practice.run({
            turns: [
                ...Object.values(happyTurns()),
                lensTurn({ lens: 'security', findings: [SECURITY_FINDING] }),
                lensTurn({
                    lens: 'architecture',
                    findings: [ARCHITECTURE_FINDING],
                }),
                {
                    role: 'test-writer',
                    ticket: 10,
                    files: { 'src/sum.test.ts': SUM_TEST_WITH_NEGATIVES },
                    result: {
                        ...TEST_WRITER_RESULT,
                        finding_responses: [
                            {
                                finding_id: 'architecture-A1',
                                response: 'fixed',
                                reason: '',
                            },
                        ],
                    },
                },
                {
                    role: 'implementer',
                    ticket: 10,
                    files: { 'src/sum.ts': RENAMED_SUM },
                    result: {
                        ...IMPLEMENTER_RESULT,
                        finding_responses: [
                            {
                                finding_id: 'security-S1',
                                response: 'fixed',
                                reason: '',
                            },
                        ],
                    },
                },
                lensTurn({ lens: 'security' }),
                lensTurn({ lens: 'architecture' }),
            ],
        })

        expect(run.action).toMatchObject({ type: 'done', outcome: 'pr_opened' })

        // A fresh test-writer, then a fresh implementer, on the whole branch.
        const fixers = run.launches.filter(
            ({ ticket, role }) => ticket === 10 && !role.endsWith('-lens')
        )
        expect(
            fixers.map(({ kind, role, may_edit_tests }) => ({
                kind,
                role,
                may_edit_tests,
            }))
        ).toEqual([
            { kind: 'launch', role: 'test-writer', may_edit_tests: true },
            { kind: 'launch', role: 'implementer', may_edit_tests: false },
        ])
        const [testFixer, codeFixer] = fixers
        expect(testFixer?.prompt).toContain('architecture-A1')
        expect(testFixer?.prompt).not.toContain('security-S1')
        expect(codeFixer?.prompt).toContain('security-S1')
        expect(codeFixer?.prompt).not.toContain('architecture-A1')

        // One fix commit on the run branch, pushed to origin.
        const fix = commitsOf(run.records).find(
            ({ ticket, stage }) => ticket === null && stage === 'fix'
        )
        expect(fix?.files.toSorted()).toEqual(['src/sum.test.ts', 'src/sum.ts'])
        const [pr] = run.tracker.pullRequests()
        const log = await git(
            practice.origin,
            'log',
            '--format=%s',
            pr?.head ?? 'none'
        )
        expect(log.split('\n')[0]).toBe(
            'fix: final review round 1 for spec #10'
        )
        const originSum = await git(
            practice.origin,
            'show',
            `${pr?.head ?? 'none'}:src/sum.ts`
        )
        expect(originSum).toContain('running')

        // Only the two lenses with findings re-review only the new changes.
        const [first, second] = run.records.filter(
            (record) => record.kind === 'final_review_started'
        )
        if (
            first?.kind !== 'final_review_started' ||
            second?.kind !== 'final_review_started'
        ) {
            throw new Error('two rounds expected')
        }
        expect(second.content.lenses).toEqual(['architecture', 'security'])
        expect(second.content.from_sha).toBe(first.content.head_sha)
        expect(second.content.head_sha).toBe(fix?.sha ?? '')
        const reReviews = lensCalls(run.launches).slice(5)
        expect(reReviews.map(({ role }) => role).toSorted()).toEqual([
            'architecture-lens',
            'security-lens',
        ])
        const securityAgain = reReviews.find(
            ({ role }) => role === 'security-lens'
        )
        expect(securityAgain?.prompt).toContain('review ONLY the new changes')
        expect(securityAgain?.prompt).toContain(
            `git diff ${first.content.head_sha}..${fix?.sha ?? ''}`
        )
        expect(securityAgain?.prompt).toContain('security-S1')
        expect(securityAgain?.prompt).toContain('Fixer: fixed.')
        expect(securityAgain?.prompt).not.toContain('architecture-A1')
    }, 60_000)

    test(`stuck after ${MAX_FIX_ROUNDS} fix rounds; a ship reply then opens the PR with the open findings at the top`, async () => {
        const practice = await createPracticeRepo({ root })
        const stubborn = lensTurn({
            lens: 'security',
            findings: [{ ...SECURITY_FINDING, id: 'security-S1' }],
        })
        const refuse: ScriptedTurn = {
            role: 'implementer',
            ticket: 10,
            result: {
                ...IMPLEMENTER_RESULT,
                finding_responses: [
                    {
                        finding_id: 'security-S1',
                        response: 'wont_fix',
                        reason: 'No.',
                    },
                ],
            },
        }
        const stuck = await practice.run({
            turns: [
                ...Object.values(happyTurns()),
                stubborn,
                refuse,
                stubborn,
                refuse,
                stubborn,
                refuse,
                stubborn,
            ],
        })

        expect(stuck.action).toMatchObject({
            type: 'done',
            outcome: 'final_review_stuck',
            reason: 'changes_requested',
        })
        expect(stuck.tracker.pullRequests()).toEqual([])
        expect(
            stuck.launches.filter(({ role }) => role === 'security-lens')
        ).toHaveLength(MAX_FIX_ROUNDS + 1)
        // The run branch's worktree stays for a retry.
        const runBranch = stuck.records.find(
            (record) => record.kind === 'run_branch_created'
        )
        const runBranchPath =
            runBranch?.kind === 'run_branch_created'
                ? runBranch.content.path
                : ''
        expect(existsSync(runBranchPath)).toBe(true)

        expect(shipFinalReview({ journal: practice.journal })).toEqual({
            ok: true,
        })
        const shipped = await practice.run({
            tracker: stuck.tracker,
            resume: true,
        })

        expect(shipped.action).toMatchObject({
            type: 'done',
            outcome: 'pr_opened',
        })
        const [pr] = shipped.tracker.pullRequests()
        expect(pr?.body.startsWith('## Open findings')).toBe(true)
        expect(pr?.body).toContain(
            '- security lens, should-fix (src/sum.ts): security-S1 Name the accumulator for what it holds'
        )
        expect(existsSync(runBranchPath)).toBe(false)
        expect(shipFinalReview({ journal: practice.journal })).toMatchObject({
            ok: false,
        })
    }, 60_000)

    test("the rules lens's prompt holds the config's rule files", async () => {
        const practice = await createPracticeRepo({
            root,
            config: {
                ...PRACTICE_ENGINE_CONFIG,
                rule_files: ['RULES.md', '~/.luca-missing-rule-for-tests.md'],
            },
            files: { 'RULES.md': '# Rules\n\nNever abbreviate a name.\n' },
        })
        const run = await practice.run({ turns: HAPPY_TURNS })

        expect(run.action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        const rules = lensCalls(run.launches).find(
            ({ role }) => role === 'rules-lens'
        )
        expect(rules?.prompt).toContain('### RULES.md')
        expect(rules?.prompt).toContain('Never abbreviate a name.')
        expect(rules?.prompt).toContain('### ~/.luca-missing-rule-for-tests.md')
        expect(rules?.prompt).toContain('The engine could not read this file.')
        const security = lensCalls(run.launches).find(
            ({ role }) => role === 'security-lens'
        )
        expect(security?.prompt).not.toContain('Never abbreviate a name.')
    }, 60_000)
})
