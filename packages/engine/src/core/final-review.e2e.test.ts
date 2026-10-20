import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import {
    LENS_NAMES,
    LENS_ROLES,
    lensRole,
    type LensName,
} from '../agents/role-results'
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
 *
 * A final review stuck at its cap, told on the spec, and shipped by the
 * owner's reply runs end to end in `run-ship-uncommitted.e2e.test.ts`; its
 * decisions are in `decide-stuck.test.ts` and `decide-final-review.test.ts`
 * (#566). The fresh pass's decisions (#548) are in
 * `decide-final-review-fresh.test.ts`.
 */

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

/** The fresh pass's fix: the same sum, now saying where it loses precision. */
const DOCUMENTED_SUM = `/** Adds the numbers; past Number.MAX_SAFE_INTEGER the total loses precision. */
${RENAMED_SUM}`

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
        verdict: (findings ?? []).some(
            (finding) => 'severity' in finding && finding.severity !== 'nit'
        )
            ? 'changes_requested'
            : 'approve',
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

/** The fresh pass's blocker, which its re-check still holds open. */
const FRESH_FINDING = {
    id: 'S2',
    severity: 'blocker',
    kind: 'code',
    file: 'src/sum.ts',
    title: 'Sum loses precision past the safe integers',
    detail: 'Large totals round silently.',
}

const FRESH_NIT = {
    id: 'N2',
    severity: 'nit',
    kind: 'code',
    file: 'src/sum.ts',
    title: 'Name the reducer',
    detail: 'An inline arrow hides what it does.',
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

/** Every `final_review_started`'s content, oldest first. */
const finalStarts = (records: JournalRecord[]) =>
    records.flatMap((record) =>
        record.kind === 'final_review_started' ? [record.content] : []
    )

const baseShaOf = (records: JournalRecord[]): string => {
    const base = records.find((record) => record.kind === 'run_branch_created')
    return base?.kind === 'run_branch_created' ? base.content.base_sha : ''
}

describe('a clean final review, end to end, on one run', () => {
    // One clean run, built once (#566), in a repo whose config names a rule
    // file it has and one that is missing.
    let root = ''
    let run: Awaited<
        ReturnType<Awaited<ReturnType<typeof createPracticeRepo>>['run']>
    >

    beforeAll(async () => {
        root = await mkdtemp(join(tmpdir(), 'luca-engine-final-'))
        const practice = await createPracticeRepo({
            root,
            config: {
                ...PRACTICE_ENGINE_CONFIG,
                rule_files: ['RULES.md', '~/.luca-missing-rule-for-tests.md'],
            },
            files: { 'RULES.md': '# Rules\n\nNever abbreviate a name.\n' },
        })
        run = await practice.run({ turns: HAPPY_TURNS })
    }, 120_000)

    afterAll(async () => {
        await rm(root, { recursive: true, force: true })
    })

    test('a clean final review of the whole run branch opens the PR', () => {
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
        expect(started.content.from_sha).toBe(baseShaOf(run.records))
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
    })

    test("the rules lens's prompt holds the config's rule files", () => {
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
    })

    test('a final review with no fix rounds gets no fresh pass, and its one round is not fresh', () => {
        expect(run.action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        expect(finalStarts(run.records).map(({ fresh }) => fresh)).toEqual([
            false,
        ])
        expect(lensCalls(run.launches)).toHaveLength(5)
    })
})

describe('the final review, end to end', () => {
    // One run, built once and shared: round 1's findings are fixed and
    // re-reviewed, then the fresh pass (#548) reads the whole branch again,
    // finds a blocker and a nit, and its blocker's fix is re-checked but
    // still held open.
    let root = ''
    let practice: Awaited<ReturnType<typeof createPracticeRepo>>
    let run: Awaited<ReturnType<typeof practice.run>>
    const fixerSends: { ok: boolean; detail: string }[] = []

    beforeAll(async () => {
        root = await mkdtemp(join(tmpdir(), 'luca-engine-final-'))
        practice = await createPracticeRepo({
            root,
            config: { ...PRACTICE_ENGINE_CONFIG, rule_files: ['RULES.md'] },
            files: { 'RULES.md': '# Rules\n\nNever abbreviate a name.\n' },
        })
        run = await practice.run({
            turns: [
                ...Object.values(happyTurns()),
                // Round 1.
                lensTurn({ lens: 'security', findings: [SECURITY_FINDING] }),
                lensTurn({
                    lens: 'architecture',
                    findings: [ARCHITECTURE_FINDING],
                }),
                lensTurn({ lens: 'simplification' }),
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
                    // Every ticket is over: final fixers get no messaging.
                    act: async (_cwd, tools) => {
                        fixerSends.push(
                            tools.send_message({
                                to: 'implementer#11',
                                text: 'Renamed the accumulator.',
                            })
                        )
                    },
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
                // Round 2, the re-review.
                lensTurn({ lens: 'security' }),
                lensTurn({ lens: 'architecture' }),
                // The fresh pass; integration and rules fall back on clean turns.
                lensTurn({ lens: 'security', findings: [FRESH_FINDING] }),
                lensTurn({ lens: 'architecture' }),
                lensTurn({ lens: 'simplification', findings: [FRESH_NIT] }),
                {
                    role: 'implementer',
                    ticket: 10,
                    files: { 'src/sum.ts': DOCUMENTED_SUM },
                    result: {
                        ...IMPLEMENTER_RESULT,
                        finding_responses: [
                            {
                                finding_id: 'security-S2',
                                response: 'fixed',
                                reason: '',
                            },
                        ],
                    },
                },
                // The re-check still holds the blocker open.
                lensTurn({ lens: 'security', findings: [FRESH_FINDING] }),
            ],
        })
    }, 180_000)

    afterAll(async () => {
        await rm(root, { recursive: true, force: true })
    })

    /** The fresh pass's five lens launches: after round 1's five and round 2's two. */
    const freshCalls = () => lensCalls(run.launches).slice(7, 12)

    test('a code finding and a test finding are fixed on the whole run branch, then re-reviewed', async () => {
        expect(run.action).toMatchObject({ type: 'done', outcome: 'pr_opened' })

        // A fresh test-writer, then a fresh implementer, on the whole branch.
        const fixers = run.launches
            .filter(
                ({ ticket, role }) => ticket === 10 && !role.endsWith('-lens')
            )
            .slice(0, 2)
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
        expect(fixerSends).toEqual([
            { ok: false, detail: 'This agent has no send_message tool.' },
        ])
        const [testFixer, codeFixer] = fixers
        expect(codeFixer?.prompt).not.toContain(
            'Your address for agent messages'
        )
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
        expect(log.split('\n')).toContain(
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
        const reReviews = lensCalls(run.launches).slice(5, 7)
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
    })

    test('after its fix round, the final review starts a fresh pass of all five lenses on the whole branch', () => {
        const starts = finalStarts(run.records)
        expect(starts.map(({ fresh }) => fresh)).toEqual([
            false,
            false,
            true,
            false,
        ])
        const [firstFix] = commitsOf(run.records).filter(
            ({ ticket, stage }) => ticket === null && stage === 'fix'
        )
        const fresh = starts[2]
        expect(fresh?.lenses).toEqual([...LENS_NAMES])
        expect(fresh?.from_sha).toBe(baseShaOf(run.records))
        expect(fresh?.head_sha).toBe(firstFix?.sha ?? '')

        const calls = freshCalls()
        expect(
            calls.map(({ kind, role }) => `${kind} ${role}`).toSorted()
        ).toEqual(LENS_ROLES.map((role) => `launch ${role}`).toSorted())
        for (const { prompt } of calls) {
            expect(prompt).toContain(
                `git diff ${fresh?.from_sha ?? ''}..${fresh?.head_sha ?? ''}`
            )
            expect(prompt).toContain('## Spec #10')
            expect(prompt).toContain('### Ticket #11: Add sum')
            expect(prompt).toContain('## Gate results')
        }
        const rules = calls.find(({ role }) => role === 'rules-lens')
        expect(rules?.prompt).toContain('Never abbreviate a name.')
    })

    test("the fresh pass's prompts hold no earlier findings, fixer answers or re-review text", () => {
        const calls = freshCalls()
        expect(calls).toHaveLength(5)
        for (const { prompt } of calls) {
            for (const earlier of [
                'security-S1',
                'architecture-A1',
                SECURITY_FINDING.title,
                ARCHITECTURE_FINDING.title,
                'Fixer:',
                'review ONLY the new changes',
            ]) {
                expect(prompt).not.toContain(earlier)
            }
        }
    })

    test("the fresh pass's blocker gets one fix round and a re-check, then the PR opens with it at the top and its nit with the nits", () => {
        expect(run.action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        const fixers = run.launches.filter(
            ({ ticket, role }) => ticket === 10 && !role.endsWith('-lens')
        )
        expect(fixers.map(({ kind, role }) => `${kind} ${role}`)).toEqual([
            'launch test-writer',
            'launch implementer',
            'launch implementer',
        ])
        expect(fixers[2]?.prompt).toContain('security-S2')
        expect(fixers[2]?.prompt).not.toContain('simplification-N2')
        const fixes = commitsOf(run.records).filter(
            ({ ticket, stage }) => ticket === null && stage === 'fix'
        )
        expect(fixes).toHaveLength(2)

        // Only the security lens re-checks the fix, with the usual re-review.
        const starts = finalStarts(run.records)
        expect(starts).toHaveLength(4)
        expect(starts[3]?.lenses).toEqual(['security'])
        expect(starts[3]?.from_sha).toBe(starts[2]?.head_sha ?? '')
        expect(starts[3]?.head_sha).toBe(fixes[1]?.sha ?? '')
        const reCheck = lensCalls(run.launches).slice(12)
        expect(reCheck.map(({ role }) => role)).toEqual(['security-lens'])
        expect(reCheck[0]?.prompt).toContain('review ONLY the new changes')
        expect(reCheck[0]?.prompt).toContain('security-S2')

        const [pr] = run.tracker.pullRequests()
        expect(pr?.body.startsWith('## Open findings')).toBe(true)
        expect(pr?.body).toContain(
            '- security lens, blocker (src/sum.ts): security-S2 Sum loses precision past the safe integers'
        )
        expect(pr?.body).toContain(
            'final review, simplification lens: simplification-N2 (src/sum.ts): Name the reducer'
        )
    })
})
