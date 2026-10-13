import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { NO_RED_CHANGES } from './execute-build'

import type { Journal } from '../journal/journal'
import type { JournalRecord } from '../journal/journal-record'
import {
    createPracticeRepo,
    git,
    happyTurns,
    latestStuck,
    PRACTICE_ENGINE_CONFIG,
    SUM_TEST,
} from '../testing/practice-repo'

/**
 * What a prepare command leaves in a worktree is not the ticket's work
 * (#486). HeartGold's prepare links vendor tools in as symlinks to folders,
 * which its `.gitignore` misses (a folder pattern never matches a link), so
 * git lists them as untracked; a build can leave files the `.gitignore`
 * misses too. The engine keeps them out of what it commits and judges, and
 * a symlinked folder never crashes the run.
 */

/** HeartGold's `.gitignore` style: a folder pattern, which misses a link. */
const PREPARE_FILES = { '.gitignore': 'node_modules\ntools/bin/\n' }

/**
 * Links a vendor folder in (as HeartGold's `ln -sfn`), writes a build file
 * nothing ignores, and makes a nested repo, as a tool cache might.
 */
const prepareCommand = (vendor: string): string =>
    `mkdir -p tools && ln -sfn ${vendor} tools/bin && echo built > build-stamp.txt && git init -q build-cache`

const PREPARE_PATHS = ['build-cache/', 'build-stamp.txt', 'tools/bin']

let root = ''

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'luca-engine-prepare-made-'))
})

afterEach(async () => {
    await rm(root, { recursive: true, force: true })
})

const byKind = <K extends JournalRecord['kind']>(
    records: JournalRecord[],
    kind: K
) =>
    records.filter(
        (record): record is Extract<JournalRecord, { kind: K }> =>
            record.kind === kind
    )

/** A practice repo whose prepare command links a vendor folder in. */
const practiceWithPrepare = async () => {
    const vendor = join(root, 'vendor-tools')
    await mkdir(vendor, { recursive: true })
    await Bun.write(join(vendor, 'mwccarm'), 'a vendor tool\n')
    return createPracticeRepo({
        root,
        config: { ...PRACTICE_ENGINE_CONFIG, prepare: prepareCommand(vendor) },
        files: PREPARE_FILES,
    })
}

describe("a prepare command's side effects", () => {
    test('a symlinked folder, a stray build file, and a nested repo from prepare stay out of every commit, and the run does not crash', async () => {
        const practice = await practiceWithPrepare()
        const { testWriter, implementer, reviewer } = happyTurns()

        const { action, records } = await practice.run({
            turns: [testWriter, implementer, reviewer],
        })

        expect(latestStuck(records)).toBeNull()
        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })

        // Each commit holds only the agents' work.
        const commits = byKind(records, 'commit_made').map(
            ({ content }) => content
        )
        expect(commits.map(({ stage, files }) => ({ stage, files }))).toEqual([
            { stage: 'red', files: ['src/sum.test.ts'] },
            { stage: 'green', files: ['src/index.ts', 'src/sum.ts'] },
        ])

        // The engine noted what the baseline's prepare made.
        const made = byKind(records, 'prepare_made').flatMap(
            ({ content }) => content.paths
        )
        expect(made.toSorted()).toEqual(PREPARE_PATHS)

        // No leftover scan saw them.
        const scanned = byKind(records, 'leftover_scan').flatMap(
            ({ content }) => content.hits
        )
        expect(scanned).toEqual([])
    }, 90_000)

    test('a test-writer that runs the build again in its turn is not blamed for what the build rewrote', async () => {
        const practice = await practiceWithPrepare()
        const { testWriter, implementer, reviewer } = happyTurns()
        const rebuilds = {
            ...testWriter,
            files: {
                ...testWriter.files,
                'build-stamp.txt': 'built again by the agent\n',
            },
        }

        const { action, records } = await practice.run({
            turns: [rebuilds, implementer, reviewer],
        })

        expect(latestStuck(records)).toBeNull()
        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        expect(byKind(records, 'agent_failed')).toEqual([])
        const red = byKind(records, 'commit_made').find(
            ({ content }) => content.stage === 'red'
        )
        expect(red?.content.files).toEqual(['src/sum.test.ts'])
    }, 90_000)

    test('a run from before the engine noted what prepare made, resumed, does not commit the links prepare made (#496)', async () => {
        // HeartGold's prepare links its vendor tools in from the owner's
        // checkout, outside the worktree.
        const vendor = join(root, 'vendor-tools')
        await mkdir(vendor, { recursive: true })
        const practice = await createPracticeRepo({
            root,
            config: {
                ...PRACTICE_ENGINE_CONFIG,
                prepare: `mkdir -p tools && ln -sfn ${vendor} tools/bin`,
            },
            files: PREPARE_FILES,
        })
        const { testWriter, implementer, reviewer } = happyTurns()
        // An older engine (14.0.0-alpha.1) journaled no `prepare_made`.
        const olderEngine = (real: Journal): Journal => ({
            ...real,
            append: (entry) =>
                entry.kind === 'prepare_made'
                    ? ({ ...entry, seq: 0, time: '' } as JournalRecord)
                    : real.append(entry),
        })
        const before = await practice.run({
            turns: [testWriter],
            journal: olderEngine,
            stop_before: ['commit_ticket'],
        })
        expect(before.action).toMatchObject({ type: 'commit_ticket' })
        expect(byKind(before.records, 'prepare_made')).toEqual([])

        // The newer engine carries the same journal on.
        const { action, records } = await practice.run({
            turns: [implementer, reviewer],
            resume: true,
        })

        expect(latestStuck(records)).toBeNull()
        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        const commits = byKind(records, 'commit_made').map(
            ({ content }) => content
        )
        expect(commits.map(({ stage, files }) => ({ stage, files }))).toEqual([
            { stage: 'red', files: ['src/sum.test.ts'] },
            { stage: 'green', files: ['src/index.ts', 'src/sum.ts'] },
        ])
        // The link to the vendor folder was left out, with a note saying so.
        const noted = byKind(records, 'prepare_made').filter(
            ({ content }) => content.outside_links === true
        )
        expect(noted.flatMap(({ content }) => content.paths)).toEqual([
            'tools/bin',
        ])
        const [created] = byKind(before.records, 'run_branch_created')
        const pushed = await git(
            practice.origin,
            'ls-tree',
            '-r',
            '--name-only',
            created?.content.branch ?? 'missing'
        )
        expect(pushed.split('\n')).toContain('src/sum.ts')
        expect(pushed).not.toContain('tools/bin')
    }, 120_000)
})

describe('nothing to commit (#494)', () => {
    test("a test-writer turn that changes nothing, with only prepare's file in the worktree, fails the red check with a clear problem instead of crashing the commit", async () => {
        // The tests are already on main, so the red check finds them failing
        // with no change at all: only the empty red commit is wrong.
        const practice = await createPracticeRepo({
            root,
            config: {
                ...PRACTICE_ENGINE_CONFIG,
                prepare: 'echo built > build-stamp.txt',
            },
            files: { 'src/sum.test.ts': SUM_TEST },
        })
        const { testWriter, implementer, reviewer } = happyTurns()
        const idle = { ...testWriter, files: {} }
        const touched = {
            ...testWriter,
            files: { 'src/sum.test.ts': `${SUM_TEST}// Covers AC1 and AC2.\n` },
        }

        const { action, records } = await practice.run({
            turns: [idle, touched, implementer, reviewer],
        })

        expect(latestStuck(records)).toBeNull()
        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        const checks = byKind(records, 'red_check').map(
            ({ content }) => content
        )
        expect(checks.map(({ ok, problems }) => ({ ok, problems }))).toEqual([
            { ok: false, problems: [NO_RED_CHANGES] },
            { ok: true, problems: [] },
        ])
        const red = byKind(records, 'commit_made').find(
            ({ content }) => content.stage === 'red'
        )
        expect(red?.content.files).toEqual(['src/sum.test.ts'])
    }, 120_000)
})
