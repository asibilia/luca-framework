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
const makePracticeRepo = async () => {
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
}: {
    turns: Turn[]
    /** Defaults to a scripted launcher playing `turns`. */
    launcher?: ScriptedLauncher
}) => {
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
    await makePracticeRepo()
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
            'ticket_worktree_created',
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
})
