import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import type { JournalRecord } from '../journal/journal-record'
import { SPEC_OWNER } from '../testing/intake-fixtures'
import {
    createPracticeRepo,
    happyTurns,
    HAPPY_TURNS,
    practiceTracker,
    TEST_WRITER_RESULT,
} from '../testing/practice-repo'
import type { InMemoryTracker } from '../tracker/in-memory-tracker'

/**
 * Seam 2 for the PR step (#508): the practice run end to end, with the PR
 * body saved in the run folder, kept under its budget with the rest in PR
 * comments, and a failed `gh pr create` a stuck run a `retry` answers,
 * never a crash or a second PR.
 */

let root = ''

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'luca-pull-request-'))
})

afterEach(async () => {
    await rm(root, { recursive: true, force: true })
})

/** GitHub's limit on a PR body or a comment. */
const GITHUB_LIMIT = 65_536

/** What the engine keeps the PR body under. */
const BODY_BUDGET = 60_000

/** Where a practice run's folder is: its journal's folder. */
const runFolder = () => join(root, 'runs', 'run-1')

/** What a failing `gh pr create` says. */
const GH_ERROR =
    'gh pr create failed (exit code 1): pull request create failed: GraphQL: Something went wrong while opening the pull request'

/** 90 distinct assumptions of about 1,000 characters: 90,000 in all. */
const LONG_ASSUMPTIONS = Array.from(
    { length: 90 },
    (_, index) =>
        `Assumption number ${index + 1}: ${'the sum of a long list is still one number, '.repeat(22).trim()}`
)

/** A clock that doesn't wait, for a run that answers its own replies. */
const NO_WAIT = { now: () => Date.now(), sleep: async () => undefined }

/**
 * The tracker, with `openPullRequest` failing like `gh pr create` while
 * `failing()` says so. With `opens_first`, the PR is opened before the
 * error, as when `gh` fails after GitHub made it.
 */
const failingPullRequests = ({
    tracker,
    failing,
    opens_first,
}: {
    tracker: InMemoryTracker
    failing: () => boolean
    opens_first?: boolean
}): InMemoryTracker => ({
    ...tracker,
    openPullRequest: async (request) => {
        if (!failing()) return tracker.openPullRequest(request)
        if (opens_first === true) await tracker.openPullRequest(request)
        throw new Error(GH_ERROR)
    },
})

const pullRequestsOpened = (records: JournalRecord[]) =>
    records.flatMap((record) =>
        record.kind === 'pull_request_opened' ? [record.content] : []
    )

const runBranchOf = (records: JournalRecord[]): string => {
    const created = records.find(({ kind }) => kind === 'run_branch_created')
    return created?.kind === 'run_branch_created' ? created.content.branch : ''
}

describe('the PR body in the run folder', () => {
    test('the full PR body is written to pull-request.md in the run folder before the PR is created', async () => {
        const practice = await createPracticeRepo({ root })
        const tracker = practiceTracker()
        const seen: { exists: boolean; text: string; body: string }[] = []
        const watching: InMemoryTracker = {
            ...tracker,
            openPullRequest: async (request) => {
                const file = join(runFolder(), 'pull-request.md')
                seen.push({
                    exists: existsSync(file),
                    text: existsSync(file) ? await Bun.file(file).text() : '',
                    body: request.body,
                })
                return tracker.openPullRequest(request)
            },
        }

        const run = await practice.run({
            tracker: watching,
            turns: HAPPY_TURNS,
        })

        expect(run.action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        expect(seen).toHaveLength(1)
        expect(seen[0]?.exists).toBe(true)
        expect(seen[0]?.text).toContain('Closes #11: Add sum')
        expect(seen[0]?.text).toContain(seen[0]?.body ?? 'no body')
    }, 60_000)
})

describe('a PR body over the limit', () => {
    test('notes over 65,536 characters open a PR with a body under 60,000 characters and the rest in PR comments', async () => {
        const practice = await createPracticeRepo({ root })
        const { testWriter, implementer, reviewer } = happyTurns()
        const run = await practice.run({
            turns: [
                {
                    ...testWriter,
                    result: {
                        ...TEST_WRITER_RESULT,
                        assumptions: LONG_ASSUMPTIONS,
                    },
                },
                implementer,
                reviewer,
            ],
        })

        expect(LONG_ASSUMPTIONS.join('\n').length).toBeGreaterThan(GITHUB_LIMIT)
        expect(run.action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        const [pr, ...others] = run.tracker.pullRequests()
        expect(others).toEqual([])
        const body = pr?.body ?? ''
        expect(body.length).toBeLessThan(BODY_BUDGET)
        // The essentials stay in the body.
        expect(body).toContain('Closes #11: Add sum')

        // The rest is in PR comments, each under GitHub's limit.
        const comments = run.tracker.commentsOn({ number: pr?.number ?? 0 })
        expect(comments.length).toBeGreaterThan(0)
        for (const comment of comments) {
            expect(comment.length).toBeLessThan(GITHUB_LIMIT)
        }
        const missing = LONG_ASSUMPTIONS.filter(
            (text) =>
                !body.includes(text) &&
                !comments.some((comment) => comment.includes(text))
        )
        expect(missing).toEqual([])
    }, 60_000)

    test('the saved pull-request.md holds the whole body, every note included', async () => {
        const practice = await createPracticeRepo({ root })
        const { testWriter, implementer, reviewer } = happyTurns()
        const run = await practice.run({
            turns: [
                {
                    ...testWriter,
                    result: {
                        ...TEST_WRITER_RESULT,
                        assumptions: LONG_ASSUMPTIONS,
                    },
                },
                implementer,
                reviewer,
            ],
        })

        expect(run.action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        const file = join(runFolder(), 'pull-request.md')
        expect(existsSync(file)).toBe(true)
        const saved = await Bun.file(file).text()
        expect(saved).toContain('Closes #11: Add sum')
        const missing = LONG_ASSUMPTIONS.filter((text) => !saved.includes(text))
        expect(missing).toEqual([])
        expect(saved.length).toBeGreaterThan(GITHUB_LIMIT)
    }, 60_000)
})

describe('a failed gh pr create', () => {
    test('leaves the run stuck with the error in the stuck text, not a crash, and retry opens the PR', async () => {
        const practice = await createPracticeRepo({ root })
        let failing = true
        const tracker = failingPullRequests({
            tracker: practiceTracker(),
            failing: () => failing,
        })

        const stuck = await practice.run({
            tracker,
            turns: Object.values(happyTurns()),
        })

        expect(stuck.action).toMatchObject({ type: 'wait_for_reply' })
        expect(tracker.pullRequests()).toEqual([])
        const report = tracker
            .commentsOn({ number: 10 })
            .find((comment) => comment.includes(GH_ERROR))
        expect(report).toBeDefined()
        expect(report).toContain('`retry`')
        expect(JSON.stringify(stuck.records)).toContain(GH_ERROR)

        failing = false
        tracker.addComment({ number: 10, author: SPEC_OWNER, body: 'retry' })
        const retried = await practice.run({
            tracker,
            resume: true,
            stop_before: [],
            clock: NO_WAIT,
        })

        expect(retried.action).toMatchObject({
            type: 'done',
            outcome: 'pr_opened',
        })
        const [pr, ...others] = tracker.pullRequests()
        expect(others).toEqual([])
        expect(pullRequestsOpened(retried.records)).toEqual([
            expect.objectContaining({ number: pr?.number, url: pr?.url }),
        ])
    }, 60_000)
})

describe('an open PR from the run branch', () => {
    test('a PR gh made before failing is reused on retry, never opened twice', async () => {
        const practice = await createPracticeRepo({ root })
        let failing = true
        const tracker = failingPullRequests({
            tracker: practiceTracker(),
            failing: () => failing,
            opens_first: true,
        })

        const stuck = await practice.run({
            tracker,
            turns: Object.values(happyTurns()),
        })

        expect(stuck.action).toMatchObject({ type: 'wait_for_reply' })
        const [first] = tracker.pullRequests()
        expect(first).toBeDefined()

        failing = false
        tracker.addComment({ number: 10, author: SPEC_OWNER, body: 'retry' })
        const retried = await practice.run({
            tracker,
            resume: true,
            stop_before: [],
            clock: NO_WAIT,
        })

        expect(retried.action).toMatchObject({
            type: 'done',
            outcome: 'pr_opened',
        })
        expect(tracker.pullRequests()).toHaveLength(1)
        expect(pullRequestsOpened(retried.records)).toEqual([
            expect.objectContaining({ number: first?.number, url: first?.url }),
        ])
    }, 60_000)

    test('a PR the owner opened by hand from the run branch is reused on retry, never opened twice', async () => {
        const practice = await createPracticeRepo({ root })
        let failing = true
        const tracker = failingPullRequests({
            tracker: practiceTracker(),
            failing: () => failing,
        })

        const stuck = await practice.run({
            tracker,
            turns: Object.values(happyTurns()),
        })

        expect(stuck.action).toMatchObject({ type: 'wait_for_reply' })
        expect(tracker.pullRequests()).toEqual([])
        failing = false
        // The owner opens the PR by hand, then replies retry.
        const byHand = await tracker.openPullRequest({
            head: runBranchOf(stuck.records),
            base: 'main',
            title: 'Practice spec (#10)',
            body: 'Opened by hand.',
        })
        tracker.addComment({ number: 10, author: SPEC_OWNER, body: 'retry' })
        const retried = await practice.run({
            tracker,
            resume: true,
            stop_before: [],
            clock: NO_WAIT,
        })

        expect(retried.action).toMatchObject({
            type: 'done',
            outcome: 'pr_opened',
        })
        expect(tracker.pullRequests()).toHaveLength(1)
        expect(pullRequestsOpened(retried.records)).toEqual([
            expect.objectContaining({ number: byHand.number, url: byHand.url }),
        ])
    }, 60_000)
})

describe('the engine README', () => {
    test('describes the PR body budget, the saved pull-request.md, the PR comments, and the stuck reason', async () => {
        const text = await Bun.file(
            join(import.meta.dir, '..', '..', 'README.md')
        ).text()

        expect(text).toMatch(/60,000/)
        expect(text).toContain('pull-request.md')
        expect(text).toMatch(/PR comments|comments on the PR/i)
        expect(text).toMatch(/gh pr create/)
    })
})
