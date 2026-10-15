import { existsSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import { shipFinalReview } from './execute-final-review'
import { MAX_FIX_ROUNDS } from './loop-caps'

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
 *
 * Two stuck runs, each built once (#566): one shipped with edits left
 * uncommitted, one shipped with none. The first also checks a stuck final
 * review end to end: told on the spec, waiting for the owner's `ship`
 * (moved here from `final-review.e2e.test.ts`, which ran the same stuck
 * review).
 */

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
const runToStuckFinalReview = async ({ under }: { under: string }) => {
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

/**
 * The spec owner replies `ship`, and the engine carries on to the PR, its
 * journal wrapped by `journal` if given.
 */
const ship = async ({
    practice,
    stuck,
    journal,
}: Awaited<ReturnType<typeof runToStuckFinalReview>> & {
    journal?: (real: Journal) => Journal
}) => {
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
        journal,
    })
    expect(shipped.action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
    const pulls = shipped.tracker.pullRequests()
    expect(pulls).toHaveLength(1)
    const pr = pulls[0]
    if (pr === undefined) throw new Error('No PR was opened.')
    return { shipped, pr }
}

describe('a shipped final review with uncommitted edits, on one run', () => {
    // One stuck run, shipped with a changed test file and a new one left
    // uncommitted in the run branch's worktree, built once (#566).
    let root = ''
    let origin = ''
    let before = ''
    let pr: Awaited<ReturnType<typeof ship>>['pr']
    let stuck: Awaited<ReturnType<typeof runToStuckFinalReview>>
    let shipped: Awaited<ReturnType<typeof ship>>['shipped']
    let keptWhileStuck = false

    beforeAll(async () => {
        root = await mkdtemp(join(tmpdir(), 'luca-ship-uncommitted-'))
        stuck = await runToStuckFinalReview({ under: root })
        keptWhileStuck = existsSync(stuck.worktree)
        before = await git(stuck.worktree, 'rev-parse', 'HEAD')
        writeFileSync(join(stuck.worktree, 'src/sum.test.ts'), SUM_TEST_EDITED)
        writeFileSync(join(stuck.worktree, 'src/sum-one.test.ts'), NEW_TEST)
        // Someone else's `ship` doesn't count; the spec owner's (from
        // `ship`) does.
        stuck.stuck.tracker.addComment({
            number: 10,
            author: 'passer-by',
            body: 'ship',
        })
        ;({ pr, shipped } = await ship(stuck))
        origin = stuck.practice.origin
    }, 180_000)

    afterAll(async () => {
        await rm(root, { recursive: true, force: true })
    })

    test(`stuck after ${MAX_FIX_ROUNDS} fix rounds, told on the spec; only the owner's ship reply opens the PR, and the run branch's worktree, kept while stuck, then goes`, () => {
        // The run waited for a reply; the spec issue heard why.
        const [report] = stuck.stuck.tracker.commentsOn({ number: 10 })
        expect(report).toContain('The final review is stuck')
        expect(report).toContain(
            'Why: The final review still asks for changes.'
        )
        expect(report).toContain('`ship`')
        expect(
            stuck.stuck.launches.filter(({ role }) => role === 'security-lens')
        ).toHaveLength(MAX_FIX_ROUNDS + 1)
        expect(keptWhileStuck).toBe(true)

        expect(
            shipped.records
                .filter((record) => record.kind === 'reply_received')
                .map((record) => record.content)
        ).toEqual([
            expect.objectContaining({
                word: 'ship',
                ticket: null,
                author: SPEC_OWNER,
            }),
        ])
        expect(pr.body).toContain(
            '- security lens, should-fix (src/sum.ts): security-S1 Name the accumulator for what it holds'
        )
        expect(existsSync(stuck.worktree)).toBe(false)
        expect(
            shipFinalReview({ journal: stuck.practice.journal })
        ).toMatchObject({ ok: false })
    })

    test('the edits get their own commit, named for the shipped round, before the changeset commit', async () => {
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
    })

    test('the changeset commit holds only the changeset, not the uncommitted edits', async () => {
        const [newest] = await subjectsPastMain({ cwd: origin, head: pr.head })
        expect(newest).toBe(CHANGESET_MESSAGE)
        const files = await filesOf({ cwd: origin, ref: pr.head })
        expect(files).toHaveLength(1)
        expect(files[0]).toMatch(/^\.changeset\/[^/]+\.md$/)
    })

    test("the PR's open findings list the edits' files as uncommitted fixer edits, not reviewed", () => {
        expect(pr.body.startsWith('## Open findings')).toBe(true)
        const open = openFindingsOf(pr.body)
        expect(open).toMatch(NOT_REVIEWED)
        expect(open).toContain('src/sum.test.ts')
        expect(open).toContain('src/sum-one.test.ts')
        // The lens's finding is still listed too.
        expect(open).toContain('security-S1')
    })
})

describe('a shipped final review with no uncommitted edits, on one run', () => {
    // One stuck run, shipped with nothing left uncommitted, built once
    // (#566). Right after the ship is journaled, edits appear in the run
    // branch's worktree (a changed tracked file and a new one), so they sit
    // uncommitted when the changeset is written.
    let root = ''
    let origin = ''
    let before = ''
    let left = false
    let pr: Awaited<ReturnType<typeof ship>>['pr']
    let records: JournalRecord[] = []

    beforeAll(async () => {
        root = await mkdtemp(join(tmpdir(), 'luca-ship-uncommitted-'))
        const stuck = await runToStuckFinalReview({ under: root })
        before = await git(stuck.worktree, 'rev-parse', 'HEAD')
        const leaveEdits = (real: Journal): Journal => ({
            ...real,
            append: (entry) => {
                const record = real.append(entry)
                if (entry.kind === 'final_review_shipped' && !left) {
                    left = true
                    writeFileSync(
                        join(stuck.worktree, 'src/sum.test.ts'),
                        SUM_TEST_EDITED
                    )
                    writeFileSync(
                        join(stuck.worktree, 'src/sum-one.test.ts'),
                        NEW_TEST
                    )
                }
                return record
            },
        })
        const shipped = await ship({ ...stuck, journal: leaveEdits })
        pr = shipped.pr
        records = shipped.shipped.records
        origin = stuck.practice.origin
    }, 180_000)

    afterAll(async () => {
        await rm(root, { recursive: true, force: true })
    })

    test('makes no extra commit: the changeset commit sits right on the stuck run branch, and the PR names no unreviewed edits', async () => {
        const subjects = await subjectsPastMain({ cwd: origin, head: pr.head })
        expect(subjects[0]).toBe(CHANGESET_MESSAGE)
        expect(
            subjects.filter((subject) => SHIPPED_EDITS_SUBJECT.test(subject))
        ).toEqual([])
        expect(await git(origin, 'rev-parse', `${pr.head}~1`)).toBe(before)
        expect(pr.body).not.toMatch(NOT_REVIEWED)
    })

    test('the changeset commit holds only the changeset file when the run branch has other uncommitted edits', async () => {
        expect(left).toBe(true)
        const written = records.findLast(
            (record) => record.kind === 'changeset_written'
        )
        if (written?.kind !== 'changeset_written') {
            throw new Error('No changeset was written.')
        }
        const path = written.content.path ?? ''
        expect(path).toMatch(/^\.changeset\/[^/]+\.md$/)
        const [newest] = await subjectsPastMain({
            cwd: origin,
            head: pr.head,
        })
        expect(newest).toBe(CHANGESET_MESSAGE)
        expect(await filesOf({ cwd: origin, ref: pr.head })).toEqual([path])
    })
})
