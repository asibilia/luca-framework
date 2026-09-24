import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

import { $ } from 'bun'

import { specIssue, ticketIssue } from './intake-fixtures'

import type { AgentLauncher } from '../agents/agent-launcher'
import { LENS_NAMES, lensRole } from '../agents/role-results'
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
import type { MemoryClient } from '../memory/memory-client'
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

/**
 * Five approving lens turns: a clean final review of spec `spec_number`'s
 * run branch. (The launcher is handed the spec's number as a final review
 * agent's ticket.)
 *
 * @example
 * const turns = [...Object.values(happyTurns()), ...CLEAN_LENS_TURNS(10)]
 */
export const CLEAN_LENS_TURNS = (spec_number: number): ScriptedTurn[] =>
    LENS_NAMES.map((lens) => ({
        role: lensRole({ lens }),
        ticket: spec_number,
        result: {
            verdict: 'approve',
            findings: [],
            summary: `The ${lens} lens found nothing.`,
            assumptions: [],
        },
    }))

/**
 * A learner that proposes nothing and says nothing helped, for spec
 * `spec_number`. Practice runs fall back on it for a learner the turns
 * don't script (only runs with memory on start one).
 */
export const EMPTY_LEARNER_TURN = (spec_number: number): ScriptedTurn => ({
    role: 'learner',
    ticket: spec_number,
    result: { memories: [], helped: [] },
})

/** Memory for a practice run (#370): a (fake) client and the project vault. */
export type PracticeMemory = {
    client: MemoryClient
    project_vault: string | null
    /** How long each call may take. Defaults to the engine's. */
    timeout_ms?: number
}

/**
 * The happy path: tests, then code, then an approving review, then a clean
 * final review.
 */
export const HAPPY_TURNS: ScriptedTurn[] = [
    ...Object.values(happyTurns()),
    ...CLEAN_LENS_TURNS(10),
]

/**
 * The turns, then a clean final review of spec #10 and an empty learner to
 * fall back on: the scripted launcher plays the first unused turn of a
 * role, so lens and learner turns in `turns` go first, a lens the turns
 * don't script approves, and a learner they don't script learns nothing.
 */
const withCleanLenses = (turns: ScriptedTurn[]): ScriptedTurn[] => [
    ...turns,
    ...CLEAN_LENS_TURNS(10),
    EMPTY_LEARNER_TURN(10),
]

/**
 * The latest `ticket_stuck` in a run's records, with its ticket, or `null`.
 * A practice run with a stuck ticket ends at its first wait for a reply.
 */
export const latestStuck = (
    records: JournalRecord[]
): { ticket: number | null; reason: string; detail: string } | null => {
    const stuck = records.findLast((record) => record.kind === 'ticket_stuck')
    return stuck?.kind === 'ticket_stuck'
        ? { ticket: stuck.ticket, ...stuck.content }
        : null
}

/** Runs git in `cwd` and returns its output. */
export const git = (cwd: string, ...args: string[]): Promise<string> =>
    $`git -C ${cwd} ${args}`.quiet().text()

/** A small repo with no tests yet, pushed to a local bare `origin`. */
export const makePracticeRepo = async ({
    root,
    config,
    files,
    stale_manifest,
}: {
    root: string
    /** The engine config to commit. Defaults to `PRACTICE_ENGINE_CONFIG`. */
    config?: object
    /**
     * More files for the first commit, by repo-relative path. With a
     * `package.json`, the first commit also gets its lockfile.
     */
    files?: Record<string, string>
    /** The first commit's manifest, written after its lockfile was made. */
    stale_manifest?: string
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
    if (stale_manifest !== undefined) {
        await Bun.write(join(repo, 'package.json'), stale_manifest)
    }
    await git(repo, 'add', '-A')
    await git(repo, 'commit', '-q', '-m', 'initial')
    await git(repo, 'remote', 'add', 'origin', origin)
    await git(repo, 'push', '-q', 'origin', 'main')
    return { repo, origin }
}

/** The practice spec's issue number. */
export const PRACTICE_SPEC_NUMBER = 10

/** The practice spec, #10. */
export const practiceSpec = (): TrackerIssue =>
    specIssue({ number: PRACTICE_SPEC_NUMBER, title: 'Practice spec' })

/** The practice spec's first ticket, #11: "Add sum" with two criteria. */
export const sumTicket = (): TrackerIssue =>
    ticketIssue({
        number: 11,
        title: 'Add sum',
        criteria: ['sum adds two numbers', 'sum of no numbers is zero'],
    })

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
        issues: [practiceSpec(), ticket ?? sumTicket()],
        sub_tickets: { [PRACTICE_SPEC_NUMBER]: [11] },
    })

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
    files,
    stale_manifest,
}: {
    root: string
    /** The engine config to commit. Defaults to `PRACTICE_ENGINE_CONFIG`. */
    config?: object
    /** More files for the first commit, by repo-relative path. */
    files?: Record<string, string>
    /** The first commit's manifest, written after its lockfile was made. */
    stale_manifest?: string
}) => {
    const { repo, origin } = await makePracticeRepo({
        root,
        config,
        files,
        stale_manifest,
    })
    const journal = createJournal({
        file: runJournalPath({ runs_dir: join(root, 'runs'), run_id: 'run-1' }),
    })

    const run = async ({
        turns,
        launcher,
        ticket,
        tracker: given,
        jev,
        clock,
        resume,
        stop_before,
        reply_poll_ms,
        memory,
    }: {
        /**
         * Scripted agents' turns, then a clean final review for any lens they
         * don't script; ignored when `launcher` is given.
         */
        turns?: ScriptedTurn[]
        /** Any launcher, such as the real Claude one for a smoke run. */
        launcher?: AgentLauncher
        /** Ticket #11. Defaults to "Add sum". */
        ticket?: TrackerIssue
        /** A tracker to keep across runs. Defaults to a fresh one. */
        tracker?: InMemoryTracker
        /** Jev in shadow mode. Leave it out to run without Jev. */
        jev?: JevShadow
        /** The clock limit waits sleep by. Defaults to the system's. */
        clock?: EngineClock
        /** Carry on the journal as it is, as a restarted engine does. */
        resume?: boolean
        /**
         * Action types to stop at. Defaults to `wait_for_reply`, so a stuck
         * ticket ends the run at its first wait for a reply; pass `[]` (and a
         * clock that replies) to answer it.
         */
        stop_before?: EngineAction['type'][]
        /** How long each wait for a reply sleeps by `clock`. */
        reply_poll_ms?: number
        /** Turns memory on for the run, with this (fake) MuninnDB. */
        memory?: PracticeMemory
    }) => {
        const loaded = await loadEngineConfig({ repo_root: repo })
        if (!loaded.ok) throw new Error(loaded.error)
        const tracker = given ?? practiceTracker({ ticket })
        const scripted = createScriptedLauncher({
            turns: withCleanLenses(turns ?? []),
        })
        if (resume !== true) {
            startRun({
                journal,
                spec_number: 10,
                config: loaded.config,
                base_branch: 'main',
                memory:
                    memory === undefined
                        ? undefined
                        : { project_vault: memory.project_vault },
            })
        }
        const action = await runEngine({
            journal,
            tracker,
            git: createGitAdapter({ repo_root: repo }),
            launcher: launcher ?? scripted,
            jev,
            clock,
            stop_before: stop_before ?? ['wait_for_reply'],
            reply_poll_ms,
            memory:
                memory === undefined
                    ? undefined
                    : { client: memory.client, timeout_ms: memory.timeout_ms },
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

/** What a practice run left behind. */
export type PracticeRun = {
    action: EngineAction
    tracker: InMemoryTracker
    records: JournalRecord[]
    /** The scripted launcher's calls; empty when `launcher` was given. */
    launches: ScriptedCall[]
    origin: string
}

/**
 * Makes a practice repo in `root`, starts a run on spec #10 with journal
 * `<root>/runs/run-1`, and runs the engine to its end with these scripted
 * agent turns (and a clean final review for any lens they don't script), or
 * with `launcher`, and Jev in shadow mode if given.
 *
 * @example
 * const { action, records, origin } = await runPractice({ root, turns: HAPPY_TURNS })
 */
export const runPractice = async ({
    root,
    turns,
    launcher,
    files,
    stale_manifest,
    jev,
}: {
    root: string
    turns: ScriptedTurn[]
    /** Plays instead of `turns`, with no lens turns added. */
    launcher?: AgentLauncher
    /** More files for the practice repo's first commit. */
    files?: Record<string, string>
    /** The first commit's manifest, written after its lockfile was made. */
    stale_manifest?: string
    jev?: JevShadow
}): Promise<PracticeRun> => {
    const practice = await createPracticeRepo({ root, files, stale_manifest })
    const ran = await practice.run({ turns, launcher, jev })
    return { ...ran, origin: practice.origin }
}
