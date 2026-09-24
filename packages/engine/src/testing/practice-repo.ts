import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

import { $ } from 'bun'

import { specIssue, ticketIssue } from './intake-fixtures'

import type { AgentLauncher } from '../agents/agent-launcher'
import {
    createScriptedLauncher,
    type ScriptedCall,
    type ScriptedTurn,
} from '../agents/scripted-launcher'
import { loadEngineConfig } from '../config/engine-config'
import type { EngineAction } from '../core/decide'
import { runEngine, startRun } from '../core/execute'
import { createGitAdapter } from '../git/git-adapter'
import type { JevShadow } from '../jev/jev-shadow'
import { createJournal, runJournalPath } from '../journal/journal'
import type { JournalRecord } from '../journal/journal-record'
import type { EngineClock } from '../limits/limit-wait'
import {
    createInMemoryTracker,
    type InMemoryTracker,
} from '../tracker/in-memory-tracker'
import type { TrackerIssue } from '../tracker/tracker'

/**
 * A practice repo for end-to-end engine tests: a throwaway git repo with a
 * local bare repo as its `origin`, an in-memory tracker with one spec and one
 * ticket, and scripted agents. The gates, commits, join, push, journal, and
 * PR step are all real. No GitHub, no models.
 */

export const PRACTICE_ENGINE_CONFIG = {
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

export const SUM_TEST = `import { describe, expect, test } from 'bun:test'

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

export const SUM = `export const sum = ({ numbers }: { numbers: number[] }): number =>
    numbers.reduce((total, each) => total + each, 0)
`

export const TEST_WRITER_RESULT = {
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

export const IMPLEMENTER_RESULT = {
    outcome: 'done',
    bad_test: null,
    summary: 'Added sum and exported it.',
    assumptions: [],
    run_notes: [],
}

export const APPROVE = {
    verdict: 'approve',
    findings: [],
    summary: 'Both criteria are met with honest tests.',
    assumptions: [],
}

/** The three turns of a clean ticket, by role: tests, code, approval. */
export const happyTurns = (): {
    testWriter: ScriptedTurn
    implementer: ScriptedTurn
    reviewer: ScriptedTurn
} => ({
    testWriter: {
        role: 'test-writer',
        ticket: 11,
        files: { 'src/sum.test.ts': SUM_TEST },
        result: TEST_WRITER_RESULT,
    },
    implementer: {
        role: 'implementer',
        ticket: 11,
        files: {
            'src/sum.ts': SUM,
            'src/index.ts': "export { sum } from './sum'\n",
        },
        result: IMPLEMENTER_RESULT,
    },
    reviewer: { role: 'ticket-reviewer', ticket: 11, result: APPROVE },
})

/** The happy path: tests, then code, then an approving review. */
export const HAPPY_TURNS: ScriptedTurn[] = Object.values(happyTurns())

/** Runs git in `cwd` and returns its output. */
export const git = (cwd: string, ...args: string[]): Promise<string> =>
    $`git -C ${cwd} ${args}`.quiet().text()

/** A small repo with no tests yet, pushed to a local bare `origin`. */
export const makePracticeRepo = async ({
    root,
    config,
    files,
}: {
    root: string
    /** The engine config to commit. Defaults to `PRACTICE_ENGINE_CONFIG`. */
    config?: object
    /**
     * More files for the first commit, by repo-relative path. With a
     * `package.json`, the first commit also gets its lockfile.
     */
    files?: Record<string, string>
}): Promise<{ repo: string; origin: string }> => {
    const repo = join(root, 'repo')
    const origin = join(root, 'origin.git')
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
        JSON.stringify(config ?? PRACTICE_ENGINE_CONFIG, null, 4)
    )
    for (const [path, content] of Object.entries(files ?? {})) {
        await Bun.write(join(repo, path), content)
    }
    if (files?.['package.json'] !== undefined) {
        // The starting lockfile. Workspace packages install offline.
        await $`bun install`.cwd(repo).quiet()
    }
    await git(repo, 'add', '-A')
    await git(repo, 'commit', '-q', '-m', 'initial')
    await git(repo, 'remote', 'add', 'origin', origin)
    await git(repo, 'push', '-q', 'origin', 'main')
    return { repo, origin }
}

/**
 * Spec #10 with one open ticket, #11: "Add sum" with two criteria, or the
 * ticket given.
 */
export const practiceTracker = ({
    ticket,
}: {
    ticket?: TrackerIssue
} = {}): InMemoryTracker =>
    createInMemoryTracker({
        issues: [
            specIssue({ number: 10, title: 'Practice spec' }),
            ticket ??
                ticketIssue({
                    number: 11,
                    title: 'Add sum',
                    criteria: [
                        'sum adds two numbers',
                        'sum of no numbers is zero',
                    ],
                }),
        ],
        sub_tickets: { 10: [11] },
    })

/** What a practice run left behind. */
export type PracticeRun = {
    action: EngineAction
    tracker: InMemoryTracker
    records: JournalRecord[]
    launches: ScriptedCall[]
    origin: string
}

/**
 * Makes a practice repo in `root`, starts a run on spec #10 with journal
 * `<root>/runs/run-1`, and runs the engine to its end with these scripted
 * agent turns, and Jev in shadow mode if given.
 */
export const runPractice = async ({
    root,
    turns,
    jev,
}: {
    root: string
    turns: ScriptedTurn[]
    jev?: JevShadow
}): Promise<PracticeRun> => {
    const { repo, origin } = await makePracticeRepo({ root })
    const journal = createJournal({
        file: runJournalPath({ runs_dir: join(root, 'runs'), run_id: 'run-1' }),
    })
    const loaded = await loadEngineConfig({ repo_root: repo })
    if (!loaded.ok) throw new Error(loaded.error)
    const tracker = practiceTracker()
    const launcher = createScriptedLauncher({ turns })
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
        launcher,
        jev,
    })
    return {
        action,
        tracker,
        records: journal.read(),
        launches: launcher.launches(),
        origin,
    }
}

/**
 * Makes the practice repo under `root`, with this engine config committed,
 * and returns what a test needs to run the engine on it, as often as it
 * likes, with scripted turns or any launcher (such as the real Claude one
 * for a smoke run). Every run appends to the same journal,
 * `<root>/runs/run-1`.
 *
 * @example
 * const practice = await createPracticeRepo({ root })
 * const { action, records } = await practice.run({ turns })
 */
export const createPracticeRepo = async ({
    root,
    config,
}: {
    root: string
    /** The engine config to commit. Defaults to `PRACTICE_ENGINE_CONFIG`. */
    config?: object
}) => {
    const { repo, origin } = await makePracticeRepo({ root, config })
    const journal = createJournal({
        file: runJournalPath({ runs_dir: join(root, 'runs'), run_id: 'run-1' }),
    })

    const run = async ({
        turns,
        launcher,
        ticket,
        tracker: given,
        clock,
        resume,
    }: {
        /** Scripted agents' turns; ignored when `launcher` is given. */
        turns?: ScriptedTurn[]
        /** Any launcher, such as the real Claude one for a smoke run. */
        launcher?: AgentLauncher
        /** Ticket #11. Defaults to "Add sum". */
        ticket?: TrackerIssue
        /** A tracker to keep across runs. Defaults to a fresh one. */
        tracker?: InMemoryTracker
        /** The clock limit waits sleep by. Defaults to the system's. */
        clock?: EngineClock
        /** Carry on the journal as it is, as a restarted engine does. */
        resume?: boolean
    }) => {
        const loaded = await loadEngineConfig({ repo_root: repo })
        if (!loaded.ok) throw new Error(loaded.error)
        const tracker = given ?? practiceTracker({ ticket })
        const scripted = createScriptedLauncher({ turns: turns ?? [] })
        if (resume !== true) {
            startRun({
                journal,
                spec_number: 10,
                config: loaded.config,
                base_branch: 'main',
            })
        }
        const action = await runEngine({
            journal,
            tracker,
            git: createGitAdapter({ repo_root: repo }),
            launcher: launcher ?? scripted,
            clock,
        })
        return {
            action,
            tracker,
            records: journal.read(),
            launches: scripted.launches(),
        }
    }

    return { repo, origin, journal, run }
}
