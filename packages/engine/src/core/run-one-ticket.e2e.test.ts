import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import {
    git,
    HAPPY_TURNS,
    latestStuck,
    runPractice,
    SUM,
} from '../testing/practice-repo'

/**
 * Seam 2: one ticket, end to end, on the practice repo
 * (`testing/practice-repo.ts`): a throwaway git repo with a local bare repo
 * as its `origin`, an in-memory tracker, and scripted agents. The gates,
 * commits, join, push, journal, and PR step are all real. No GitHub, no models.
 *
 * Here: the happy run and the leftover scan. The fix loops are in
 * `run-one-ticket-fix-loops.e2e.test.ts`, the dependency installs in
 * `run-one-ticket-install.e2e.test.ts`, and the agent messages in
 * `run-one-ticket-messages.e2e.test.ts`.
 */

let root = ''

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'luca-engine-e2e-'))
})

afterEach(async () => {
    await rm(root, { recursive: true, force: true })
})

describe('one ticket, end to end, with scripted agents', () => {
    test('builds the ticket, joins the run branch, pushes it, and opens one PR', async () => {
        const { action, tracker, records, launches, origin } =
            await runPractice({
                root,
                turns: HAPPY_TURNS,
            })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })

        // Each launched agent's session is closed once, somewhere in the run.
        const allKinds: string[] = records.map((record) => record.kind)
        const count = (kind: string) =>
            allKinds.filter((other) => other === kind).length
        expect(count('agent_session_closed')).toBe(count('agent_started'))

        // The journal holds every step, in order, with the final review
        // (its five lenses at once, in any order) right before the PR.
        const kinds = allKinds.filter((kind) => kind !== 'agent_session_closed')
        const finalFrom = kinds.indexOf('final_review_started')
        const finalTo = kinds.indexOf('final_review_passed')
        expect(kinds.slice(finalFrom + 1, finalTo).toSorted()).toEqual(
            ['lens_started', 'agent_started', 'agent_finished', 'lens_finished']
                .flatMap((kind) => Array.from({ length: 5 }, () => kind))
                .toSorted()
        )
        expect([
            ...kinds.slice(0, finalFrom),
            ...kinds.slice(finalTo + 1),
        ]).toEqual([
            'run_started',
            'intake_read',
            'spec_snapshot',
            'ticket_snapshot',
            'run_branch_created',
            'dependencies_installed',
            'ticket_worktree_created',
            'dependencies_installed',
            'baseline_tests',
            'agent_started',
            'agent_finished',
            'red_check',
            'leftover_scan',
            'commit_made',
            'agent_started',
            'agent_finished',
            'gates_run',
            'leftover_scan',
            'commit_made',
            'agent_started',
            'agent_finished',
            'join_started',
            'ticket_joined',
            'gates_run',
            'run_branch_pushed',
            'pull_request_opened',
            'worktrees_removed',
        ])
        const find = <K extends (typeof records)[number]['kind']>(kind: K) =>
            records.filter(
                (record): record is Extract<typeof record, { kind: K }> =>
                    record.kind === kind
            )

        // A repo with no tests counts as a passing baseline.
        const [baseline] = find('baseline_tests')
        expect(baseline?.content).toMatchObject({
            ok: true,
            no_test_files: true,
        })

        // The ticket's worktree branches from the run branch.
        const [runBranch] = find('run_branch_created')
        const [worktree] = find('ticket_worktree_created')
        const branch = runBranch?.content.branch ?? ''
        expect(branch).toMatch(/^luca\/spec-10-/)
        expect(worktree?.content.base_sha).toBe(
            runBranch?.content.base_sha ?? ''
        )
        expect(worktree?.content.branch).toBe(`${branch}--ticket-11`)

        // The red check passed: both new tests fail, no old test broke.
        expect(find('red_check')[0]?.content).toMatchObject({
            ok: true,
            problems: [],
        })

        // Every gate from the engine config ran and passed, twice.
        for (const gates of find('gates_run')) {
            expect(gates.content.ok).toBe(true)
            expect(gates.content.checks.map((check) => check.name)).toEqual([
                'test',
                'types',
                'lint',
            ])
        }
        expect(find('gates_run').map((gates) => gates.content.target)).toEqual([
            'ticket',
            'run_branch',
        ])

        // The ticket's gates journal the cases of its red test files, each
        // with its expect() count (#581); the join's gates journal none.
        const [ticketGates, joinGates] = find('gates_run')
        expect(
            ticketGates?.content.cases?.map(
                ({ file, full_name, status, assertions }) => ({
                    file,
                    full_name,
                    status,
                    assertions,
                })
            )
        ).toEqual([
            {
                file: 'src/sum.test.ts',
                full_name: 'sum > adds two numbers',
                status: 'passed',
                assertions: 1,
            },
            {
                file: 'src/sum.test.ts',
                full_name: 'sum > of no numbers is zero',
                status: 'passed',
                assertions: 1,
            },
        ])
        expect(joinGates?.content.cases).toBeUndefined()

        // The leftover scan ran clean before each commit.
        expect(find('leftover_scan').map((scan) => scan.content)).toEqual([
            { stage: 'red', hits: [] },
            { stage: 'green', hits: [] },
        ])

        // Each prompt is journaled word for word.
        expect(
            find('agent_started')
                .filter((start) => start.ticket === 11)
                .map((start) => start.content.role)
        ).toEqual(['test-writer', 'implementer', 'ticket-reviewer'])
        expect(find('agent_started')[0]?.content.prompt).toContain(
            'AC2: sum of no numbers is zero'
        )
        // The lenses start at once, so compare without their order.
        expect(
            find('agent_started')
                .map((start) => start.content.prompt)
                .toSorted()
        ).toEqual(launches.map(({ prompt }) => prompt).toSorted())

        // The red commit holds only the tests; the green commit, the code.
        const commits = find('commit_made').map((commit) => commit.content)
        expect(commits.map(({ stage, files }) => ({ stage, files }))).toEqual([
            { stage: 'red', files: ['src/sum.test.ts'] },
            { stage: 'green', files: ['src/index.ts', 'src/sum.ts'] },
        ])

        // The run branch on origin holds the replayed red then green commits.
        const pushedLog = await git(origin, 'log', '--format=%s', branch)
        expect(pushedLog.trim().split('\n')).toEqual([
            'feat: build #11 Add sum',
            'test: add failing tests for #11 Add sum',
            'initial',
        ])
        const pushedSha = (await git(origin, 'rev-parse', branch)).trim()
        expect(find('run_branch_pushed')[0]?.content).toEqual({
            branch,
            sha: pushedSha,
        })
        // The join records the ticket's size: 13 lines of src/sum.test.ts,
        // 2 of src/sum.ts, and src/index.ts's one line swapped (1 removed,
        // 1 added).
        const [joinRecord] = find('ticket_joined')
        expect(joinRecord?.content).toEqual({
            ok: true,
            shas: [expect.any(String), pushedSha],
            lines_changed: 17,
        })

        // main on origin is untouched.
        expect((await git(origin, 'log', '--format=%s', 'main')).trim()).toBe(
            'initial'
        )

        // One PR, from the run branch, through the tracker adapter.
        const pulls = tracker.pullRequests()
        expect(pulls).toHaveLength(1)
        expect(pulls[0]).toMatchObject({
            head: branch,
            base: 'main',
            title: 'Practice spec (#10)',
        })
        expect(pulls[0]?.body).toContain('Closes #11')
        expect(pulls[0]?.body).toContain('sum takes a list of numbers.')
        expect(find('pull_request_opened')[0]?.content).toMatchObject({
            number: pulls[0]?.number,
            url: pulls[0]?.url,
        })

        // Then the ticket's and the run branch's worktrees are removed.
        expect(find('worktrees_removed')[0]?.content.paths).toEqual([
            worktree?.content.path ?? '',
            runBranch?.content.path ?? '',
        ])
    }, 60_000)

    test("a binary file in the ticket's commits counts as 0 lines of its joined size", async () => {
        const [testWriter, implementer, reviewer] = HAPPY_TURNS
        if (!testWriter || !implementer || !reviewer) throw new Error('turns')
        const { action, records } = await runPractice({
            root,
            turns: [
                testWriter,
                {
                    ...implementer,
                    files: {
                        ...implementer.files,
                        // A NUL byte makes git see it as binary.
                        'src/logo.png': 'PNG\u0000\u0001\nline\nline\n',
                    },
                },
                reviewer,
            ],
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        const joins = records.flatMap((record) =>
            record.kind === 'ticket_joined' ? [record.content] : []
        )
        expect(joins).toEqual([
            {
                ok: true,
                shas: [expect.any(String), expect.any(String)],
                lines_changed: 17,
            },
        ])
    }, 60_000)

    test('the leftover scan blocks the green commit and the run stops as stuck', async () => {
        const [testWriter, implementer, reviewer] = HAPPY_TURNS
        if (!testWriter || !implementer || !reviewer) throw new Error('turns')
        const { action, tracker, records, origin } = await runPractice({
            root,
            turns: [
                testWriter,
                {
                    ...implementer,
                    files: {
                        ...implementer.files,
                        'scratch.ts': 'export const x = 1\n',
                        'debug.log': 'trace\n',
                        'src/sum.ts.orig': SUM,
                        '.DS_Store': 'finder\n',
                        'DESIGN.md': '# Notes to self\n',
                        'scripts/unused-helper.ts': 'export const y = 2\n',
                    },
                },
                reviewer,
            ],
        })

        expect(action).toMatchObject({ type: 'wait_for_reply' })
        expect(latestStuck(records)).toMatchObject({
            ticket: 11,
            reason: 'leftovers_found',
        })
        const scans = records.filter(
            (record) => record.kind === 'leftover_scan'
        )
        const hitPaths =
            scans[1]?.kind === 'leftover_scan'
                ? scans[1].content.hits.map((hit) => hit.path)
                : []
        expect(new Set(hitPaths)).toEqual(
            new Set([
                'scratch.ts',
                'debug.log',
                'src/sum.ts.orig',
                '.DS_Store',
                'DESIGN.md',
                'scripts/unused-helper.ts',
            ])
        )
        const stages = records.flatMap((record) =>
            record.kind === 'commit_made' ? [record.content.stage] : []
        )
        expect(stages).toEqual(['red'])
        expect(records.at(-2)?.kind).toBe('ticket_stuck')
        expect(records.at(-1)?.kind).toBe('stuck_reported')
        expect(tracker.pullRequests()).toEqual([])
        expect((await git(origin, 'branch', '--list', 'luca/*')).trim()).toBe(
            ''
        )
    }, 60_000)
})
