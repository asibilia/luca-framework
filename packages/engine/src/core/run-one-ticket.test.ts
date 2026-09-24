import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { MAX_FIX_ROUNDS } from './decide-build'

import {
    createScriptedLauncher,
    type ScriptedTurn,
} from '../agents/scripted-launcher'
import {
    CLEAN_LENS_TURNS,
    git,
    HAPPY_TURNS,
    IMPLEMENTER_RESULT,
    latestStuck,
    runPractice,
    SUM,
    SUM_TEST,
    TEST_WRITER_RESULT,
} from '../testing/practice-repo'

/**
 * Seam 2: one ticket, end to end, on the practice repo
 * (`testing/practice-repo.ts`): a throwaway git repo with a local bare repo
 * as its `origin`, an in-memory tracker, and scripted agents. The gates,
 * commits, join, push, journal, and PR step are all real. No GitHub, no models.
 */

/** A sum test that defines sum itself, so it passes before any code exists. */
const PASSING_SUM_TEST = SUM_TEST.replace(
    "import { sum } from './sum'",
    'const sum = ({ numbers }: { numbers: number[] }) =>\n    numbers.reduce((a, b) => a + b, 0)'
)

/**
 * A repo with a local workspace package that nothing depends on yet. Bun
 * installs workspace packages offline, and auto-install is off, so nothing
 * here reaches the network.
 */
const WORKSPACE_FILES = {
    'package.json': JSON.stringify(
        { name: 'practice', private: true, workspaces: ['packages/*'] },
        null,
        4
    ),
    'bunfig.toml': '[install]\nauto = "disable"\n',
    'packages/math/package.json': JSON.stringify(
        { name: '@practice/math', version: '1.0.0', main: 'index.ts' },
        null,
        4
    ),
    'packages/math/index.ts':
        'export const add = (a: number, b: number): number => a + b\n',
}

/** The implementer adds the workspace package as a dependency and uses it. */
const MANIFEST_WITH_DEPENDENCY = JSON.stringify(
    {
        name: 'practice',
        private: true,
        workspaces: ['packages/*'],
        dependencies: { '@practice/math': 'workspace:*' },
    },
    null,
    4
)

const SUM_WITH_DEPENDENCY = `import { add } from '@practice/math'

export const sum = ({ numbers }: { numbers: number[] }): number =>
    numbers.reduce(add, 0)
`

/**
 * A repo that already depends on its workspace package and uses it, with a
 * lockfile to match. A fresh worktree has no `node_modules`, so its tests
 * and its build only pass after the engine's install.
 */
const DEPENDENT_FILES = {
    ...WORKSPACE_FILES,
    'package.json': MANIFEST_WITH_DEPENDENCY,
    'src/add-one.ts': `import { add } from '@practice/math'

export const addOne = (n: number): number => add(n, 1)
`,
    'src/add-one.test.ts': `import { expect, test } from 'bun:test'

import { addOne } from './add-one'

test('addOne adds one', () => {
    expect(addOne(1)).toBe(2)
})
`,
    'src/index.ts': "export { addOne } from './add-one'\n",
}

let root = ''

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'luca-engine-e2e-'))
})

afterEach(async () => {
    await rm(root, { recursive: true, force: true })
})

describe('one ticket, end to end, with scripted agents', () => {
    test('builds the ticket, joins the run branch, pushes it, and opens one PR', async () => {
        const { action, tracker, records, origin } = await runPractice({
            root,
            turns: HAPPY_TURNS,
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })

        // The journal holds every step, in order, with the final review
        // (its five lenses at once, in any order) right before the PR.
        const kinds: string[] = records.map((record) => record.kind)
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
        const [joinRecord] = find('ticket_joined')
        expect(joinRecord?.content).toEqual({
            ok: true,
            shas: [expect.any(String), pushedSha],
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

    test('fix loops and a bad-test bounce still end in one PR', async () => {
        const [testWriter, implementer, reviewer] = HAPPY_TURNS
        if (!testWriter || !implementer || !reviewer) throw new Error('turns')
        const launcher = createScriptedLauncher({
            turns: [
                // 1. The first test-writer's test passes already: red check fails.
                {
                    ...testWriter,
                    files: { 'src/sum.test.ts': PASSING_SUM_TEST },
                },
                // 2. Its follow-up fixes that, but expects 1 + 2 to be 4.
                {
                    ...testWriter,
                    files: {
                        'src/sum.test.ts': SUM_TEST.replace(
                            'toBe(3)',
                            'toBe(4)'
                        ),
                    },
                },
                // 3. The implementer writes some code, then calls that test bad.
                {
                    role: 'implementer',
                    ticket: 11,
                    files: {
                        'src/sum.ts': SUM,
                        'src/half-done.ts': 'export const half = 1\n',
                        'README.md': '# Changed by the implementer\n',
                    },
                    result: {
                        ...IMPLEMENTER_RESULT,
                        outcome: 'bad_test',
                        bad_test: {
                            file: 'src/sum.test.ts',
                            name: 'sum > adds two numbers',
                            reason: '1 + 2 is 3, not 4.',
                        },
                    },
                },
                // 4. A fresh test-writer replaces the bad test.
                {
                    ...testWriter,
                    files: { 'src/sum.test.ts': SUM_TEST },
                    result: {
                        ...TEST_WRITER_RESULT,
                        assumptions: ['1 + 2 is 3.'],
                    },
                },
                // 5. A fresh implementer leaves a console.log: lint fails.
                {
                    ...implementer,
                    files: {
                        'src/sum.ts': `${SUM}console.log('sum loaded')\n`,
                        'src/index.ts': "export { sum } from './sum'\n",
                    },
                },
                // 6. Its follow-up removes it.
                { ...implementer, files: { 'src/sum.ts': SUM } },
                reviewer,
                ...CLEAN_LENS_TURNS(10),
            ],
        })
        const { action, tracker, records, origin } = await runPractice({
            root,
            turns: [],
            launcher,
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })

        // Follow-ups went to the same session; fresh agents got new ones.
        // (The final review's five lenses come after, as spec #10's.)
        const calls = launcher.launches().filter(({ ticket }) => ticket === 11)
        expect(calls.map(({ kind, role }) => `${kind} ${role}`)).toEqual([
            'launch test-writer',
            'follow_up test-writer',
            'launch implementer',
            'launch test-writer',
            'launch implementer',
            'follow_up implementer',
            'launch ticket-reviewer',
        ])
        const [tw1, twFix, impl1, tw2, impl2, implFix] = calls
        expect(twFix?.session_id).toBe(tw1?.session_id ?? '')
        expect(implFix?.session_id).toBe(impl2?.session_id ?? '')
        expect(tw2?.session_id).not.toBe(tw1?.session_id ?? '')
        expect(impl2?.session_id).not.toBe(impl1?.session_id ?? '')
        expect(twFix?.prompt).toContain('passes already')
        expect(tw2?.prompt).toContain('1 + 2 is 3, not 4.')
        expect(implFix?.prompt).toContain('no console.log')
        expect(calls.map(({ may_edit_tests }) => may_edit_tests)).toEqual([
            true,
            undefined,
            false,
            true,
            false,
            undefined,
            false,
        ])

        // The journal names the session each follow-up went to.
        const followUps = records.flatMap((record) =>
            record.kind === 'agent_started' && record.content.follow_up_of
                ? [record.content.follow_up_of]
                : []
        )
        expect(followUps).toEqual([
            tw1?.session_id ?? '',
            impl2?.session_id ?? '',
        ])
        expect(
            records.filter((record) => record.kind === 'worktree_reset')
        ).toHaveLength(1)

        // Two red commits (the second replaces the bad test), then green.
        // The implementer's first, thrown-away work is in none of them.
        const commits = records.flatMap((record) =>
            record.kind === 'commit_made'
                ? [
                      {
                          message: record.content.message,
                          files: record.content.files,
                      },
                  ]
                : []
        )
        expect(commits).toEqual([
            {
                message: 'test: add failing tests for #11 Add sum',
                files: ['src/sum.test.ts'],
            },
            {
                message: 'test: replace a bad test for #11 Add sum',
                files: ['src/sum.test.ts'],
            },
            {
                message: 'feat: build #11 Add sum',
                files: ['src/index.ts', 'src/sum.ts'],
            },
        ])
        const branch = tracker.pullRequests()[0]?.head ?? ''
        const pushedLog = await git(origin, 'log', '--format=%s', branch)
        expect(pushedLog.trim().split('\n')).toEqual([
            'feat: build #11 Add sum',
            'test: replace a bad test for #11 Add sum',
            'test: add failing tests for #11 Add sum',
            'initial',
        ])
        expect(await git(origin, 'show', `${branch}:README.md`)).toBe(
            '# Practice\n'
        )

        // The PR keeps the assumptions from both test-writers.
        const body = tracker.pullRequests()[0]?.body ?? ''
        expect(body).toContain('- #11: sum takes a list of numbers.')
        expect(body).toContain('- #11: 1 + 2 is 3.')
    }, 90_000)

    test(`a test that still passes after ${MAX_FIX_ROUNDS} fix rounds leaves the ticket stuck`, async () => {
        const [testWriter, implementer, reviewer] = HAPPY_TURNS
        if (!testWriter || !implementer || !reviewer) throw new Error('turns')
        const passingAlready: ScriptedTurn = {
            ...testWriter,
            files: { 'src/sum.test.ts': PASSING_SUM_TEST },
        }
        const launcher = createScriptedLauncher({
            turns: [
                // The first try, then one turn per follow-up.
                ...Array.from(
                    { length: MAX_FIX_ROUNDS + 1 },
                    () => passingAlready
                ),
                implementer,
                reviewer,
            ],
        })
        const { action, records } = await runPractice({
            root,
            turns: [],
            launcher,
        })

        expect(action).toMatchObject({ type: 'wait_for_reply' })
        expect(latestStuck(records)).toMatchObject({
            reason: 'red_check_failed',
        })
        expect(latestStuck(records)?.detail).toContain('passes already')
        expect(
            records.filter((record) => record.kind === 'red_check')
        ).toHaveLength(MAX_FIX_ROUNDS + 1)
        // Every follow-up went to the first test-writer's session.
        const calls = launcher.launches()
        const [first, ...followUps] = calls
        expect(first?.kind).toBe('launch')
        expect(followUps).toHaveLength(MAX_FIX_ROUNDS)
        for (const call of followUps) {
            expect(call).toMatchObject({
                kind: 'follow_up',
                role: 'test-writer',
                session_id: first?.session_id,
            })
            expect(call.prompt).toContain('passes already')
        }
        expect(records.at(-2)).toMatchObject({
            kind: 'ticket_stuck',
            content: { reason: 'red_check_failed' },
        })
        expect(records.some((record) => record.kind === 'commit_made')).toBe(
            false
        )
    }, 60_000)

    test('a ticket that adds a package gets the install from the engine, and the lockfile in its green commit', async () => {
        const [testWriter, implementer, reviewer] = HAPPY_TURNS
        if (!testWriter || !implementer || !reviewer) throw new Error('turns')
        const { action, records, origin } = await runPractice({
            root,
            files: WORKSPACE_FILES,
            turns: [
                testWriter,
                {
                    ...implementer,
                    files: {
                        'package.json': MANIFEST_WITH_DEPENDENCY,
                        'src/sum.ts': SUM_WITH_DEPENDENCY,
                        'src/index.ts': "export { sum } from './sum'\n",
                    },
                },
                reviewer,
            ],
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })

        // Agents are told the engine runs the install, not them.
        const implementerStart = records.find(
            (record) =>
                record.kind === 'agent_started' &&
                record.content.role === 'implementer'
        )
        expect(
            implementerStart?.kind === 'agent_started'
                ? implementerStart.content.prompt
                : ''
        ).toContain('Never run the package install')

        // The engine ran the install before the other gates, on the ticket
        // and again on the joined run branch.
        const gates = records.flatMap((record) =>
            record.kind === 'gates_run' ? [record.content] : []
        )
        expect(gates.map(({ target, ok }) => ({ target, ok }))).toEqual([
            { target: 'ticket', ok: true },
            { target: 'run_branch', ok: true },
        ])
        for (const { checks } of gates) {
            expect(checks.map(({ name }) => name)).toEqual([
                'install',
                'test',
                'types',
                'lint',
            ])
        }

        // The green commit holds the updated lockfile next to the manifest.
        const commits = records.flatMap((record) =>
            record.kind === 'commit_made' ? [record.content] : []
        )
        expect(commits.map(({ stage, files }) => ({ stage, files }))).toEqual([
            { stage: 'red', files: ['src/sum.test.ts'] },
            {
                stage: 'green',
                files: [
                    'bun.lock',
                    'package.json',
                    'src/index.ts',
                    'src/sum.ts',
                ],
            },
        ])
        const branch = (await git(origin, 'branch', '--list', 'luca/*'))
            .trim()
            .replace(/^\* /, '')
        const lockfile = await git(origin, 'show', `${branch}:bun.lock`)
        expect(lockfile).toContain('"@practice/math": "workspace:*"')
        // The engine's own install is never blamed on an agent.
        expect(records.some((record) => record.kind === 'agent_failed')).toBe(
            false
        )
    }, 60_000)

    test('a failed install goes back to the implementer like any failed gate', async () => {
        const [testWriter, implementer, reviewer] = HAPPY_TURNS
        if (!testWriter || !implementer || !reviewer) throw new Error('turns')
        const fixedFiles = {
            'package.json': MANIFEST_WITH_DEPENDENCY,
            'src/sum.ts': SUM_WITH_DEPENDENCY,
            'src/index.ts': "export { sum } from './sum'\n",
        }
        const { action, records } = await runPractice({
            root,
            files: WORKSPACE_FILES,
            turns: [
                testWriter,
                // First try: a dependency on a package that doesn't exist.
                {
                    ...implementer,
                    files: {
                        ...fixedFiles,
                        'package.json': MANIFEST_WITH_DEPENDENCY.replace(
                            '@practice/math',
                            '@practice/missing'
                        ),
                    },
                },
                // Its follow-up names the right package.
                { ...implementer, files: fixedFiles },
                reviewer,
            ],
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })

        // The failed install stopped the gates; the next round passed.
        const ticketGates = records.flatMap((record) =>
            record.kind === 'gates_run' && record.content.target === 'ticket'
                ? [record.content]
                : []
        )
        expect(
            ticketGates.map(({ ok, checks }) => ({
                ok,
                names: checks.map(({ name }) => name),
            }))
        ).toEqual([
            { ok: false, names: ['install'] },
            { ok: true, names: ['install', 'test', 'types', 'lint'] },
        ])

        // The same implementer session got the install's output.
        const followUp = records.find(
            (record) =>
                record.kind === 'agent_started' &&
                record.content.follow_up_of !== null
        )
        expect(followUp?.role).toBe('implementer')
        expect(
            followUp?.kind === 'agent_started' ? followUp.content.prompt : ''
        ).toContain('install failed')

        const green = records.find(
            (record) =>
                record.kind === 'commit_made' &&
                record.content.stage === 'green'
        )
        expect(
            green?.kind === 'commit_made' ? green.content.files : []
        ).toContain('bun.lock')
        // What the engine's install left between turns is never blamed on
        // the implementer's follow-up.
        expect(records.some((record) => record.kind === 'agent_failed')).toBe(
            false
        )
    }, 60_000)

    test("the engine's install updating the lockfile between turns is not blamed on the implementer", async () => {
        const [testWriter, implementer, reviewer] = HAPPY_TURNS
        if (!testWriter || !implementer || !reviewer) throw new Error('turns')
        const fixedFiles = {
            'package.json': MANIFEST_WITH_DEPENDENCY,
            'src/sum.ts': SUM_WITH_DEPENDENCY,
            'src/index.ts': "export { sum } from './sum'\n",
        }
        const { action, records } = await runPractice({
            root,
            files: WORKSPACE_FILES,
            turns: [
                testWriter,
                // First try: the install passes (and updates bun.lock), lint fails.
                {
                    ...implementer,
                    files: {
                        ...fixedFiles,
                        'src/sum.ts': `${SUM_WITH_DEPENDENCY}console.log('debug')\n`,
                    },
                },
                { ...implementer, files: fixedFiles },
                reviewer,
            ],
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        const ticketGates = records.flatMap((record) =>
            record.kind === 'gates_run' && record.content.target === 'ticket'
                ? [record.content]
                : []
        )
        expect(
            ticketGates.map(({ checks }) =>
                checks.map(({ name, ok: passed }) => `${name}:${passed}`)
            )
        ).toEqual([
            ['install:true', 'test:true', 'types:true', 'lint:false'],
            ['install:true', 'test:true', 'types:true', 'lint:true'],
        ])
        expect(records.some((record) => record.kind === 'agent_failed')).toBe(
            false
        )
    }, 60_000)
    test('a repo that already has a dependency gets it installed in every new worktree, and its first gates pass', async () => {
        const [testWriter, implementer, reviewer] = HAPPY_TURNS
        if (!testWriter || !implementer || !reviewer) throw new Error('turns')
        const { action, records } = await runPractice({
            root,
            files: DEPENDENT_FILES,
            turns: [
                testWriter,
                {
                    ...implementer,
                    files: {
                        'src/sum.ts': SUM_WITH_DEPENDENCY,
                        'src/index.ts':
                            "export { addOne } from './add-one'\nexport { sum } from './sum'\n",
                    },
                },
                reviewer,
            ],
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })

        // The engine installed from the lockfile, without changing it, in
        // the run branch's checkout and the ticket's worktree, before any
        // test, agent, or gate.
        const installs = records.flatMap((record) =>
            record.kind === 'dependencies_installed'
                ? [
                      {
                          target: record.content.target,
                          command: record.content.check?.command,
                          ok: record.content.check?.ok,
                      },
                  ]
                : []
        )
        expect(installs).toEqual([
            {
                target: 'run_branch',
                command: 'bun install --frozen-lockfile',
                ok: true,
            },
            {
                target: 'ticket',
                command: 'bun install --frozen-lockfile',
                ok: true,
            },
        ])
        const kinds = records.map(({ kind }) => kind)
        const ticketInstall = records.findIndex(
            (record) =>
                record.kind === 'dependencies_installed' &&
                record.content.target === 'ticket'
        )
        expect(ticketInstall).toBeLessThan(kinds.indexOf('baseline_tests'))
        expect(ticketInstall).toBeLessThan(kinds.indexOf('agent_started'))

        // The old test that uses the dependency passed before any agent.
        const baseline = records.find(
            (record) => record.kind === 'baseline_tests'
        )
        expect(
            baseline?.kind === 'baseline_tests' ? baseline.content.ok : false
        ).toBe(true)

        // The first gate run passed, with no install of its own: no
        // manifest changed.
        const gates = records.flatMap((record) =>
            record.kind === 'gates_run' ? [record.content] : []
        )
        expect(gates[0]).toMatchObject({ target: 'ticket', ok: true })
        expect(gates[0]?.checks.map(({ name }) => name)).toEqual([
            'test',
            'types',
            'lint',
        ])
        expect(records.some((record) => record.kind === 'agent_failed')).toBe(
            false
        )
    }, 60_000)

    test('an install that fails in a new worktree is journaled and makes the ticket stuck, before any agent', async () => {
        const { action, records } = await runPractice({
            root,
            files: WORKSPACE_FILES,
            // The committed manifest wants a workspace package that doesn't
            // exist, so the install fails, offline.
            stale_manifest: MANIFEST_WITH_DEPENDENCY.replace(
                '@practice/math',
                '@practice/missing'
            ),
            turns: HAPPY_TURNS,
        })

        expect(action).toMatchObject({ type: 'wait_for_reply' })
        expect(latestStuck(records)).toMatchObject({
            ticket: 11,
            reason: 'install_failed',
        })
        const failed = records.find(
            (record) => record.kind === 'dependencies_installed'
        )
        expect(
            failed?.kind === 'dependencies_installed'
                ? failed.content.check
                : null
        ).toMatchObject({
            name: 'install',
            command: 'bun install --frozen-lockfile',
            ok: false,
        })
        const stuck = records.find((record) => record.kind === 'ticket_stuck')
        expect(
            stuck?.kind === 'ticket_stuck' ? stuck.content.detail : ''
        ).toContain('bun install --frozen-lockfile')
        expect(records.some((record) => record.kind === 'agent_started')).toBe(
            false
        )
        expect(records.some((record) => record.kind === 'gates_run')).toBe(
            false
        )
    }, 60_000)
})

describe('run notes, end to end', () => {
    test("a test-writer's run note reaches the implementer's prompt, word for word", async () => {
        const [testWriter, implementer, reviewer] = HAPPY_TURNS
        if (!testWriter || !implementer || !reviewer) throw new Error('turns')
        const note = 'Tests import from ./sum; export it from src/index.ts.'
        const launcher = createScriptedLauncher({
            turns: [
                {
                    ...testWriter,
                    result: { ...TEST_WRITER_RESULT, run_notes: [note] },
                },
                implementer,
                reviewer,
                ...CLEAN_LENS_TURNS(10),
            ],
        })
        const { action, records } = await runPractice({
            root,
            turns: [],
            launcher,
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        const prompts = launcher
            .launches()
            .map(({ role, prompt }) => ({ role, prompt }))
        expect(prompts[0]?.prompt).not.toContain('Run notes')
        expect(prompts[1]?.role).toBe('implementer')
        expect(prompts[1]?.prompt).toContain(`- ${note} (test-writer, #11)`)
        expect(prompts[2]?.prompt).toContain(`- ${note} (test-writer, #11)`)
        // The final review's lenses get the run's notes too.
        const lensPrompts = prompts.filter(({ role }) => role.endsWith('-lens'))
        expect(lensPrompts).toHaveLength(5)
        for (const { prompt } of lensPrompts) {
            expect(prompt).toContain(`- ${note} (test-writer, #11)`)
        }
        const started = records.flatMap((record) =>
            record.kind === 'agent_started' ? [record.content.prompt] : []
        )
        expect(started[1]).toBe(prompts[1]?.prompt ?? '')
        const finished = records.find(
            (record) =>
                record.kind === 'agent_finished' &&
                record.role === 'test-writer'
        )
        expect(
            finished?.kind === 'agent_finished' &&
                finished.content.role === 'test-writer'
                ? finished.content.result.run_notes
                : []
        ).toEqual([note])
    }, 60_000)
})

describe('agent messages, end to end', () => {
    test('a test-writer messages the implementer, who gets it at its first tool call; the cap and reviewers are refused', async () => {
        const [testWriter, implementer, reviewer] = HAPPY_TURNS
        if (!testWriter || !implementer || !reviewer) throw new Error('turns')
        const first = 'sum takes { numbers }, not two arguments.'
        const answers: { ok: boolean; detail: string }[] = []
        const implementerGot: (string | null)[] = []
        const reviewerGot: (string | null)[] = []
        const lensAnswers: { ok: boolean; detail: string }[] = []
        const launcher = createScriptedLauncher({
            turns: [
                {
                    ...testWriter,
                    act: async (_cwd, tools) => {
                        answers.push(
                            tools.send_message({
                                to: 'ticket-reviewer#11',
                                text: 'Please approve.',
                            })
                        )
                        answers.push(
                            tools.send_message({
                                to: 'implementer#11',
                                text: first,
                            })
                        )
                        for (let count = 2; count <= 6; count += 1) {
                            answers.push(
                                tools.send_message({
                                    to: 'implementer#11',
                                    text: `Heads-up ${count}.`,
                                })
                            )
                        }
                    },
                },
                {
                    ...implementer,
                    act: async (_cwd, tools) => {
                        implementerGot.push(tools.tool_call('Read'))
                        implementerGot.push(tools.tool_call('Bash'))
                    },
                },
                {
                    ...reviewer,
                    act: async (_cwd, tools) => {
                        answers.push(
                            tools.send_message({
                                to: 'implementer#11',
                                text: 'From the reviewer.',
                            })
                        )
                        reviewerGot.push(tools.tool_call('Read'))
                    },
                },
                // A lens is a reviewer: it has no send_message tool.
                {
                    role: 'security-lens',
                    ticket: 10,
                    act: async (_cwd, tools) => {
                        lensAnswers.push(
                            tools.send_message({
                                to: 'implementer#11',
                                text: 'From the security lens.',
                            })
                        )
                    },
                    result: {
                        verdict: 'approve',
                        findings: [],
                        summary: '',
                        assumptions: [],
                    },
                },
                ...CLEAN_LENS_TURNS(10),
            ],
        })
        const { action, records } = await runPractice({
            root,
            turns: [],
            launcher,
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })

        // What each send answered the agent.
        expect(answers.map(({ ok }) => ok)).toEqual([
            false,
            true,
            true,
            true,
            true,
            true,
            false,
            false,
        ])
        expect(answers[6]?.detail).toContain('5 messages')
        expect(lensAnswers).toEqual([
            { ok: false, detail: 'This agent has no send_message tool.' },
        ])

        // Every message is journaled word for word, refused ones too.
        const messages = records.flatMap((record) =>
            record.kind === 'agent_message'
                ? [
                      {
                          ticket: record.ticket,
                          role: record.role,
                          ...record.content,
                      },
                  ]
                : []
        )
        expect(
            messages.map(({ id, status, to }) => ({ id, status, to }))
        ).toEqual([
            { id: 'msg-1', status: 'refused', to: 'ticket-reviewer#11' },
            { id: 'msg-2', status: 'queued', to: 'implementer#11' },
            { id: 'msg-3', status: 'queued', to: 'implementer#11' },
            { id: 'msg-4', status: 'queued', to: 'implementer#11' },
            { id: 'msg-5', status: 'queued', to: 'implementer#11' },
            { id: 'msg-6', status: 'queued', to: 'implementer#11' },
            { id: 'msg-7', status: 'refused', to: 'implementer#11' },
        ])
        expect(messages[1]).toEqual({
            ticket: 11,
            role: 'test-writer',
            id: 'msg-2',
            from: 'test-writer#11',
            to: 'implementer#11',
            text: first,
            status: 'queued',
            recipients: ['implementer#11'],
            reason: null,
        })

        // The implementer got all five at its first tool call, and only then.
        const deliveries = records.flatMap((record) =>
            record.kind === 'agent_message_delivered'
                ? [
                      {
                          ticket: record.ticket,
                          role: record.role,
                          ...record.content,
                      },
                  ]
                : []
        )
        expect(deliveries).toEqual([
            {
                ticket: 11,
                role: 'implementer',
                to: 'implementer#11',
                ids: ['msg-2', 'msg-3', 'msg-4', 'msg-5', 'msg-6'],
                tool_name: 'Read',
                text: implementerGot[0] ?? '',
            },
        ])
        expect(implementerGot[0]).toContain(`from test-writer#11`)
        expect(implementerGot[0]).toContain(first)
        expect(implementerGot[1]).toBeNull()
        // It saw them during its turn: after it started, before it finished.
        const seqOf = (kind: string, role: string | null) =>
            records.find(
                (record) => record.kind === kind && record.role === role
            )?.seq ?? 0
        const seen = seqOf('agent_message_delivered', 'implementer')
        expect(seen).toBeGreaterThan(seqOf('agent_started', 'implementer'))
        expect(seen).toBeLessThan(seqOf('agent_finished', 'implementer'))

        // The reviewer has no messaging: it can't send, and gets nothing.
        expect(reviewerGot).toEqual([null])
        // (The final review's five lenses, spec #10's, get nothing either.)
        expect(launcher.launches().map(({ delivered }) => delivered)).toEqual([
            [],
            [implementerGot[0] ?? ''],
            [],
            ...Array.from({ length: 5 }, () => []),
        ])

        // The implementer's prompt names its address; the reviewer's names none.
        const prompts = launcher.launches().map(({ prompt }) => prompt)
        expect(prompts[0]).toContain(
            'Your address for agent messages: test-writer#11'
        )
        expect(prompts[1]).toContain(
            'Your address for agent messages: implementer#11'
        )
        expect(prompts[2]).not.toContain('Your address for agent messages')
    }, 60_000)
})
