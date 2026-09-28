import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import type { JournalRecord } from '../journal/journal-record'
import {
    createPracticeRepo,
    happyTurns,
    latestStuck,
    PRACTICE_ENGINE_CONFIG,
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
})
