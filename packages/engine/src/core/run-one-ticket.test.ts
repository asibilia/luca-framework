import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { $ } from 'bun'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { MAX_FIX_ROUNDS } from './decide-build'
import { runEngine, startRun } from './execute'

import {
    createScriptedLauncher,
    type ScriptedLauncher,
} from '../agents/scripted-launcher'
import { loadEngineConfig } from '../config/engine-config'
import { createGitAdapter } from '../git/git-adapter'
import { createJournal, runJournalPath, type Journal } from '../journal/journal'
import { specIssue, ticketIssue } from '../testing/intake-fixtures'
import { createInMemoryTracker } from '../tracker/in-memory-tracker'

/**
 * Seam 2: one ticket, end to end. A throwaway git repo with a local bare repo
 * as its `origin`, an in-memory tracker, and scripted agents. The gates,
 * commits, join, push, journal, and PR step are all real. No GitHub, no models.
 */

const ENGINE_CONFIG = {
    checks: {
        test: 'bun test',
        // A cheap stand-in for a type check: the entry point must bundle.
        types: 'bun build src/index.ts --target=bun > /dev/null',
        lint: 'bun scripts/lint.ts',
    },
    test_file_patterns: ['src/**/*.test.ts'],
    test_setup_files: [],
    rule_files: [],
}

/** Fails when a source file uses console.log, so lint is a real gate. */
const LINT_SCRIPT = `const glob = new Bun.Glob('src/**/*.ts')
let bad = 0
for await (const file of glob.scan('.')) {
    if ((await Bun.file(file).text()).includes('console.log')) {
        console.error(file + ': no console.log')
        bad += 1
    }
}
process.exit(bad === 0 ? 0 : 1)
`

const SUM_TEST = `import { describe, expect, test } from 'bun:test'

import { sum } from './sum'

describe('sum', () => {
    test('adds two numbers', () => {
        expect(sum({ numbers: [1, 2] })).toBe(3)
    })

    test('of no numbers is zero', () => {
        expect(sum({ numbers: [] })).toBe(0)
    })
})
`

const SUM = `export const sum = ({ numbers }: { numbers: number[] }): number =>
    numbers.reduce((total, each) => total + each, 0)
`

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

const TEST_WRITER_RESULT = {
    outcome: 'tests_written',
    criteria: [
        {
            criterion_id: 'AC1',
            tests: [
                { file: 'src/sum.test.ts', name: 'sum > adds two numbers' },
            ],
        },
        {
            criterion_id: 'AC2',
            tests: [
                {
                    file: 'src/sum.test.ts',
                    name: 'sum > of no numbers is zero',
                },
            ],
        },
    ],
    summary: 'One test per criterion.',
    assumptions: ['sum takes a list of numbers.'],
    run_notes: [],
}

const IMPLEMENTER_RESULT = {
    outcome: 'done',
    bad_test: null,
    summary: 'Added sum and exported it.',
    assumptions: [],
    run_notes: [],
}

const APPROVE = {
    verdict: 'approve',
    findings: [],
    summary: 'Both criteria are met with honest tests.',
    assumptions: [],
}

let root = ''
let repo = ''
let origin = ''
let journal: Journal

const git = (cwd: string, ...args: string[]) =>
    $`git -C ${cwd} ${args}`.quiet().text()

/** A small repo with no tests yet, pushed to a local bare `origin`. */
const makePracticeRepo = async ({
    files,
    stale_manifest,
}: {
    files: Record<string, string> | undefined
    /** The first commit's manifest, written after its lockfile was made. */
    stale_manifest?: string
}) => {
    await $`git init -q --bare -b main ${origin}`.quiet()
    await $`git init -q -b main ${repo}`.quiet()
    const hooks = join(root, 'no-hooks')
    await mkdir(hooks)
    await git(repo, 'config', 'user.name', 'Practice')
    await git(repo, 'config', 'user.email', 'practice@example.com')
    await git(repo, 'config', 'commit.gpgsign', 'false')
    await git(repo, 'config', 'core.hooksPath', hooks)
    await Bun.write(join(repo, 'README.md'), '# Practice\n')
    await Bun.write(join(repo, '.gitignore'), 'node_modules\n')
    await Bun.write(join(repo, 'src', 'index.ts'), 'export {}\n')
    await Bun.write(join(repo, 'scripts', 'lint.ts'), LINT_SCRIPT)
    await Bun.write(
        join(repo, '.luca', 'config.json'),
        JSON.stringify(ENGINE_CONFIG, null, 4)
    )
    for (const [path, content] of Object.entries(files ?? {})) {
        await Bun.write(join(repo, path), content)
    }
    if (files?.['package.json'] !== undefined) {
        // The starting lockfile. Workspace packages install offline.
        await $`bun install`.cwd(repo).quiet()
    }
    if (stale_manifest !== undefined) {
        await Bun.write(join(repo, 'package.json'), stale_manifest)
    }
    await git(repo, 'add', '-A')
    await git(repo, 'commit', '-q', '-m', 'initial')
    await git(repo, 'remote', 'add', 'origin', origin)
    await git(repo, 'push', '-q', 'origin', 'main')
}

const practiceTracker = () =>
    createInMemoryTracker({
        issues: [
            specIssue({ number: 10, title: 'Practice spec' }),
            ticketIssue({
                number: 11,
                title: 'Add sum',
                criteria: ['sum adds two numbers', 'sum of no numbers is zero'],
            }),
        ],
        sub_tickets: { 10: [11] },
    })

type Turn = Parameters<typeof createScriptedLauncher>[0]['turns'][number]

const HAPPY_TURNS: Turn[] = [
    {
        role: 'test-writer',
        ticket: 11,
        files: { 'src/sum.test.ts': SUM_TEST },
        result: TEST_WRITER_RESULT,
    },
    {
        role: 'implementer',
        ticket: 11,
        files: {
            'src/sum.ts': SUM,
            'src/index.ts': "export { sum } from './sum'\n",
        },
        result: IMPLEMENTER_RESULT,
    },
    { role: 'ticket-reviewer', ticket: 11, result: APPROVE },
]

const runPractice = async ({
    turns,
    launcher,
    files,
    stale_manifest,
}: {
    turns: Turn[]
    /** Defaults to a scripted launcher playing `turns`. */
    launcher?: ScriptedLauncher
    /** More files for the practice repo's first commit. */
    files?: Record<string, string>
    stale_manifest?: string
}) => {
    await makePracticeRepo({ files, stale_manifest })
    const loaded = await loadEngineConfig({ repo_root: repo })
    if (!loaded.ok) throw new Error(loaded.error)
    const tracker = practiceTracker()
    startRun({
        journal,
        spec_number: 10,
        config: loaded.config,
        base_branch: 'main',
    })
    const action = await runEngine({
        journal,
        tracker,
        git: createGitAdapter({ repo_root: repo }),
        launcher: launcher ?? createScriptedLauncher({ turns }),
    })
    return { action, tracker, records: journal.read() }
}

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'luca-engine-e2e-'))
    repo = join(root, 'repo')
    origin = join(root, 'origin.git')
    journal = createJournal({
        file: runJournalPath({ runs_dir: join(root, 'runs'), run_id: 'run-1' }),
    })
})

afterEach(async () => {
    await rm(root, { recursive: true, force: true })
})

describe('one ticket, end to end, with scripted agents', () => {
    test('builds the ticket, joins the run branch, pushes it, and opens one PR', async () => {
        const { action, tracker, records } = await runPractice({
            turns: HAPPY_TURNS,
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })

        // The journal holds every step, in order.
        expect(records.map((record) => record.kind)).toEqual([
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
            find('agent_started').map((start) => start.content.role)
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
        const { action, tracker, records } = await runPractice({
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

        expect(action).toMatchObject({
            type: 'done',
            outcome: 'stuck',
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
        expect(records.at(-1)?.kind).toBe('ticket_stuck')
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
            ],
        })
        const { action, tracker, records } = await runPractice({
            turns: [],
            launcher,
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })

        // Follow-ups went to the same session; fresh agents got new ones.
        const calls = launcher.launches()
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
        const passingAlready: Turn = {
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
        const { action, records } = await runPractice({ turns: [], launcher })

        expect(action).toMatchObject({
            type: 'done',
            outcome: 'stuck',
            reason: 'red_check_failed',
        })
        expect(
            action.type === 'done' && 'detail' in action && action.detail
        ).toContain('passes already')
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
        expect(records.at(-1)).toMatchObject({
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
        const { action, records } = await runPractice({
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
            files: WORKSPACE_FILES,
            // The committed manifest wants a workspace package that doesn't
            // exist, so the install fails, offline.
            stale_manifest: MANIFEST_WITH_DEPENDENCY.replace(
                '@practice/math',
                '@practice/missing'
            ),
            turns: HAPPY_TURNS,
        })

        expect(action).toMatchObject({
            type: 'done',
            outcome: 'stuck',
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
            ],
        })
        const { action, records } = await runPractice({
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
