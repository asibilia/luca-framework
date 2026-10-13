import { writeFileSync } from 'node:fs'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import type { ScriptedTurn } from '../agents/scripted-launcher'
import type { Journal } from '../journal/journal'
import type { JournalRecord } from '../journal/journal-record'
import { SPEC_OWNER } from '../testing/intake-fixtures'
import {
    createPracticeRepo,
    git,
    happyTurns,
    IMPLEMENTER_RESULT,
    SUM_TEST,
} from '../testing/practice-repo'

/**
 * Seam 2 for the changeset commit and a shipped final review (#509): the
 * changeset step stages only its own file, and edits left uncommitted in
 * the run branch's worktree at a `ship` reply get their own commit before
 * the changeset, named in the PR's open findings as not reviewed.
 */

let root = ''

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'luca-ship-uncommitted-'))
})

afterEach(async () => {
    await rm(root, { recursive: true, force: true })
})

const changesetConfig = (): string =>
    JSON.stringify(
        {
            $schema: 'https://unpkg.com/@changesets/config@3.0.0/schema.json',
            changelog: '@changesets/cli/changelog',
            commit: false,
            fixed: [],
            linked: [],
            access: 'restricted',
            baseBranch: 'main',
            updateInternalDependencies: 'patch',
            ignore: [],
        },
        null,
        4
    )

/**
 * Changesets set up, and no `package.json`: the run's changeset names no
 * package, which is all these tests need (and nothing gets installed).
 */
const CHANGESET_FILES: Record<string, string> = {
    '.changeset/config.json': changesetConfig(),
    '.changeset/README.md': '# Changesets\n\nOne file per change.\n',
}

const CHANGESET_MESSAGE = 'chore: add the changeset for #10 Practice spec'

const SHIPPED_EDITS_SUBJECT =
    /^fix: final review round \d+, shipped with open findings$/

const NOT_REVIEWED = /uncommitted fixer edits, not reviewed/i

/** The round-N test-writer's edit, left uncommitted when the review stuck. */
const SUM_TEST_EDITED = SUM_TEST.replace(
    "    test('of no numbers is zero'",
    `    test('adds negative numbers', () => {
        expect(sum({ numbers: [-1, -2] })).toBe(-3)
    })

    test('of no numbers is zero'`
)

const NEW_TEST = `import { expect, test } from 'bun:test'

import { sum } from './sum'

test('sums one number', () => {
    expect(sum({ numbers: [4] })).toBe(4)
})
`

/** Ticket #11's turns: tests, code, an approving review. */
const ticketTurns = (): ScriptedTurn[] => Object.values(happyTurns())

/** A security lens that keeps asking for the same change. */
const stubbornLens = (): ScriptedTurn => ({
    role: 'security-lens',
    ticket: 10,
    result: {
        verdict: 'changes_requested',
        findings: [
            {
                id: 'security-S1',
                severity: 'should_fix',
                kind: 'code',
                file: 'src/sum.ts',
                title: 'Name the accumulator for what it holds',
                detail: 'total reads like the result.',
            },
        ],
        rulings: [],
        summary: 'The security lens looked.',
        assumptions: [],
    },
})

/** A final fixer that declines the finding and edits nothing. */
const refusingFixer = (): ScriptedTurn => ({
    role: 'implementer',
    ticket: 10,
    result: {
        ...IMPLEMENTER_RESULT,
        finding_responses: [
            { finding_id: 'security-S1', response: 'wont_fix', reason: 'No.' },
        ],
    },
})

const runBranchPathIn = (records: JournalRecord[]): string => {
    const created = records.find(
        (record) => record.kind === 'run_branch_created'
    )
    if (created?.kind !== 'run_branch_created') {
        throw new Error('No run branch was made.')
    }
    return created.content.path
}

/** The paths a commit in `cwd` changed, sorted. */
const filesOf = async ({
    cwd,
    ref,
}: {
    cwd: string
    ref: string
}): Promise<string[]> =>
    (await git(cwd, 'show', '--name-only', '--format=', ref))
        .split('\n')
        .filter((path) => path !== '')
        .toSorted()

/** The subjects of the commits on `head` past main, newest first. */
const subjectsPastMain = async ({
    cwd,
    head,
}: {
    cwd: string
    head: string
}): Promise<string[]> =>
    (await git(cwd, 'log', '--format=%s', `main..${head}`))
        .split('\n')
        .filter((subject) => subject !== '')

/** The PR body's part before the usual text: its open findings. */
const openFindingsOf = (body: string): string => {
    const end = body.indexOf('Built by the Luca engine')
    return end === -1 ? body : body.slice(0, end)
}

/**
 * Runs ticket #11 on a changesets repo, then a final review that stays
 * stuck at its cap. Returns the practice repo, the stuck run, and the run
 * branch's worktree (kept for a retry).
 */
const runToStuckFinalReview = async ({
    under = root,
}: {
    /** The folder to make the practice repo in. Defaults to `root`. */
    under?: string
} = {}) => {
    await mkdir(under, { recursive: true })
    const practice = await createPracticeRepo({
        root: under,
        files: CHANGESET_FILES,
    })
    const stuck = await practice.run({
        turns: [
            ...ticketTurns(),
            stubbornLens(),
            refusingFixer(),
            stubbornLens(),
            refusingFixer(),
            stubbornLens(),
            refusingFixer(),
            stubbornLens(),
        ],
    })
    expect(stuck.action).toMatchObject({ type: 'wait_for_reply' })
    expect(stuck.tracker.pullRequests()).toEqual([])
    return { practice, stuck, worktree: runBranchPathIn(stuck.records) }
}

/** The spec owner replies `ship`, and the engine carries on to the PR. */
const ship = async ({
    practice,
    stuck,
}: Awaited<ReturnType<typeof runToStuckFinalReview>>) => {
    stuck.tracker.addComment({
        number: 10,
        author: SPEC_OWNER,
        body: 'ship',
    })
    const shipped = await practice.run({
        tracker: stuck.tracker,
        resume: true,
        stop_before: [],
        clock: { now: () => Date.now(), sleep: async () => undefined },
    })
    expect(shipped.action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
    const pulls = shipped.tracker.pullRequests()
    expect(pulls).toHaveLength(1)
    const pr = pulls[0]
    if (pr === undefined) throw new Error('No PR was opened.')
    return { shipped, pr }
}

describe('the changeset commit', () => {
    test('holds only the changeset file when the run branch has other uncommitted edits', async () => {
        const practice = await createPracticeRepo({
            root,
            files: CHANGESET_FILES,
        })
        // Once the final review passed, edits sit uncommitted in the run
        // branch's worktree: a changed tracked file and a new one.
        let left = false
        const leaveEdits = (real: Journal): Journal => ({
            ...real,
            append: (entry) => {
                const record = real.append(entry)
                if (entry.kind === 'final_review_passed' && !left) {
                    left = true
                    const worktree = runBranchPathIn(real.read())
                    writeFileSync(
                        join(worktree, 'src/sum.test.ts'),
                        SUM_TEST_EDITED
                    )
                    writeFileSync(
                        join(worktree, 'src/sum-one.test.ts'),
                        NEW_TEST
                    )
                }
                return record
            },
        })

        const { action, tracker, records } = await practice.run({
            turns: ticketTurns(),
            journal: leaveEdits,
        })

        expect(left).toBe(true)
        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        const written = records.findLast(
            (record) => record.kind === 'changeset_written'
        )
        if (written?.kind !== 'changeset_written') {
            throw new Error('No changeset was written.')
        }
        const path = written.content.path ?? ''
        expect(path).toMatch(/^\.changeset\/[^/]+\.md$/)
        const head = tracker.pullRequests()[0]?.head ?? ''
        const [newest] = await subjectsPastMain({
            cwd: practice.origin,
            head,
        })
        expect(newest).toBe(CHANGESET_MESSAGE)
        expect(await filesOf({ cwd: practice.origin, ref: head })).toEqual([
            path,
        ])
    }, 120_000)
})

describe('a shipped final review with uncommitted edits', () => {
    test('the edits get their own commit, named for the shipped round, before the changeset commit', async () => {
        const stuck = await runToStuckFinalReview()
        const before = await git(stuck.worktree, 'rev-parse', 'HEAD')
        writeFileSync(join(stuck.worktree, 'src/sum.test.ts'), SUM_TEST_EDITED)
        writeFileSync(join(stuck.worktree, 'src/sum-one.test.ts'), NEW_TEST)

        const { pr } = await ship(stuck)

        const { origin } = stuck.practice
        const [newest, second] = await subjectsPastMain({
            cwd: origin,
            head: pr.head,
        })
        expect(newest).toBe(CHANGESET_MESSAGE)
        expect(second).toMatch(SHIPPED_EDITS_SUBJECT)
        // The edits' commit sits right on the stuck run branch's HEAD.
        expect(await git(origin, 'rev-parse', `${pr.head}~2`)).toBe(before)
        expect(await filesOf({ cwd: origin, ref: `${pr.head}~1` })).toEqual([
            'src/sum-one.test.ts',
            'src/sum.test.ts',
        ])
        expect(
            await git(origin, 'show', `${pr.head}:src/sum.test.ts`)
        ).toContain('adds negative numbers')
        expect(
            await git(origin, 'show', `${pr.head}:src/sum-one.test.ts`)
        ).toBe(NEW_TEST)
    }, 180_000)

    test('the changeset commit holds only the changeset, not the uncommitted edits', async () => {
        const stuck = await runToStuckFinalReview()
        writeFileSync(join(stuck.worktree, 'src/sum.test.ts'), SUM_TEST_EDITED)
        writeFileSync(join(stuck.worktree, 'src/sum-one.test.ts'), NEW_TEST)

        const { pr } = await ship(stuck)

        const { origin } = stuck.practice
        const [newest] = await subjectsPastMain({ cwd: origin, head: pr.head })
        expect(newest).toBe(CHANGESET_MESSAGE)
        const files = await filesOf({ cwd: origin, ref: pr.head })
        expect(files).toHaveLength(1)
        expect(files[0]).toMatch(/^\.changeset\/[^/]+\.md$/)
    }, 180_000)

    test("the PR's open findings list the edits' files as uncommitted fixer edits, not reviewed", async () => {
        const stuck = await runToStuckFinalReview()
        writeFileSync(join(stuck.worktree, 'src/sum.test.ts'), SUM_TEST_EDITED)
        writeFileSync(join(stuck.worktree, 'src/sum-one.test.ts'), NEW_TEST)

        const { pr } = await ship(stuck)

        expect(pr.body.startsWith('## Open findings')).toBe(true)
        const open = openFindingsOf(pr.body)
        expect(open).toMatch(NOT_REVIEWED)
        expect(open).toContain('src/sum.test.ts')
        expect(open).toContain('src/sum-one.test.ts')
        // The lens's finding is still listed too.
        expect(open).toContain('security-S1')
    }, 180_000)
})

describe('a shipped final review with no uncommitted edits', () => {
    test('of the same stuck run shipped twice, only the one with uncommitted edits gets the extra commit; the one without makes none', async () => {
        const withEdits = await runToStuckFinalReview({
            under: join(root, 'with-edits'),
        })
        const withoutEdits = await runToStuckFinalReview({
            under: join(root, 'without-edits'),
        })
        const beforeWith = await git(withEdits.worktree, 'rev-parse', 'HEAD')
        const beforeWithout = await git(
            withoutEdits.worktree,
            'rev-parse',
            'HEAD'
        )
        writeFileSync(
            join(withEdits.worktree, 'src/sum.test.ts'),
            SUM_TEST_EDITED
        )

        const shippedWith = await ship(withEdits)
        const shippedWithout = await ship(withoutEdits)

        // With edits: the edits' commit, then the changeset's.
        const subjectsWith = await subjectsPastMain({
            cwd: withEdits.practice.origin,
            head: shippedWith.pr.head,
        })
        expect(subjectsWith[0]).toBe(CHANGESET_MESSAGE)
        expect(subjectsWith[1]).toMatch(SHIPPED_EDITS_SUBJECT)
        expect(
            await git(
                withEdits.practice.origin,
                'rev-parse',
                `${shippedWith.pr.head}~2`
            )
        ).toBe(beforeWith)

        // Without: only the changeset's, right on the stuck run branch.
        const { origin } = withoutEdits.practice
        const { pr } = shippedWithout
        const subjects = await subjectsPastMain({ cwd: origin, head: pr.head })
        expect(subjects[0]).toBe(CHANGESET_MESSAGE)
        expect(
            subjects.filter((subject) => SHIPPED_EDITS_SUBJECT.test(subject))
        ).toEqual([])
        expect(await git(origin, 'rev-parse', `${pr.head}~1`)).toBe(
            beforeWithout
        )
        expect(pr.body).not.toMatch(NOT_REVIEWED)
    }, 300_000)
})

describe('the engine README', () => {
    test('describes what happens to uncommitted edits at ship time', async () => {
        const text = await Bun.file(
            join(import.meta.dir, '..', '..', 'README.md')
        ).text()

        expect(text).toMatch(
            /final review round \S+, shipped with open findings/
        )
        expect(text).toMatch(NOT_REVIEWED)
    })
})
