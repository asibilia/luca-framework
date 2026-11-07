import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { cp, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { startRun } from './run-start'

import { loadEngineConfig } from '../config/engine-config'
import type { Journal } from '../journal/journal'
import type { JournalRecord } from '../journal/journal-record'
import {
    createPracticeRepo,
    happyTurns,
    PRACTICE_ENGINE_CONFIG,
} from '../testing/practice-repo'

/**
 * Warm builds (#721): inside `create_ticket_worktree`, the repo's
 * `build_cache_paths` are cloned into the new ticket worktree from the run
 * branch's worktree, or else the repo's checkout, before the ticket's
 * baseline. Only what git ignores is copied, through `copy_dir` (faked
 * here), and nothing here ever stops the ticket.
 */

let root = ''

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'luca-engine-build-cache-'))
})

afterEach(async () => {
    await rm(root, { recursive: true, force: true })
})

type CopyDir = (args: {
    from: string
    to: string
}) => Promise<{ ok: true } | { ok: false; error: string }>

/** A copy that works, as `cp -R` would. */
const copies: CopyDir = async ({ from, to }) => {
    await cp(from, to, { recursive: true })
    return { ok: true }
}

/** A copy that writes part of the folder, then runs out of disk. */
const runsOutOfDisk: CopyDir = async ({ to }) => {
    await mkdir(to, { recursive: true })
    await Bun.write(join(to, 'partial.txt'), 'half a cache\n')
    return { ok: false, error: 'disk full' }
}

/** The records of a kind, by name: the build cache's are new (#721). */
const recordsOf = (records: JournalRecord[], kind: string) =>
    records.filter((record) => record.kind === kind)

/**
 * Ticket #11 built up to its red check, on a practice repo whose config
 * names these build caches. `run_branch_files` are written into the run
 * branch's worktree as soon as it is made, and `checkout_files` into the
 * repo's checkout, which `run_started` names. Also says whether ticket
 * #11's worktree had `cache/warm.txt` when its baseline was journaled.
 */
const buildTicket = async ({
    build_cache_paths,
    gitignore,
    run_branch_files = {},
    checkout_files = {},
    copy_dir = copies,
}: {
    build_cache_paths: string[]
    gitignore: string
    run_branch_files?: Record<string, string>
    checkout_files?: Record<string, string>
    copy_dir?: CopyDir
}) => {
    const practice = await createPracticeRepo({
        root,
        config: { ...PRACTICE_ENGINE_CONFIG, build_cache_paths },
        files: { '.gitignore': gitignore },
    })
    for (const [path, text] of Object.entries(checkout_files)) {
        await Bun.write(join(practice.repo, path), text)
    }
    const loaded = await loadEngineConfig({ repo_root: practice.repo })
    if (!loaded.ok) throw new Error(loaded.error)
    startRun({
        journal: practice.journal,
        spec_number: 10,
        config: loaded.config,
        base_branch: 'main',
        repo: practice.repo,
    })

    let worktree = ''
    /** `warm_at_baseline` is `null` until ticket #11's baseline is journaled. */
    const seen: { warm_at_baseline: boolean | null } = {
        warm_at_baseline: null,
    }
    const seeds = (real: Journal): Journal => ({
        ...real,
        append: (entry) => {
            if (entry.kind === 'baseline_tests' && entry.ticket === 11) {
                seen.warm_at_baseline = existsSync(
                    join(worktree, 'cache', 'warm.txt')
                )
            }
            const appended = real.append(entry)
            if (appended.kind === 'run_branch_created') {
                for (const [path, text] of Object.entries(run_branch_files)) {
                    const file = join(appended.content.path, path)
                    mkdirSync(dirname(file), { recursive: true })
                    writeFileSync(file, text)
                }
            }
            if (
                appended.kind === 'ticket_worktree_created' &&
                appended.ticket === 11
            ) {
                worktree = appended.content.path
            }
            return appended
        },
    })

    const { records } = await practice.run({
        turns: [happyTurns().testWriter],
        resume: true,
        stop_before: ['run_red_check'],
        journal: seeds,
        copy_dir,
    })
    return {
        records,
        worktree,
        warm_at_baseline: seen.warm_at_baseline,
        run_dir: dirname(practice.journal.file),
    }
}

const IGNORES_CACHE = 'node_modules\ncache\n'

const WARM = { 'cache/warm.txt': 'warm\n' }

describe('warm builds for new ticket worktrees (#721)', () => {
    test("a gitignored cache in the run branch's worktree is in the ticket's worktree before its baseline", async () => {
        const { records, worktree, warm_at_baseline } = await buildTicket({
            build_cache_paths: ['cache'],
            gitignore: IGNORES_CACHE,
            run_branch_files: WARM,
        })

        expect(warm_at_baseline).toBe(true)
        expect(existsSync(join(worktree, 'cache', 'warm.txt'))).toBe(true)
        const copied = recordsOf(records, 'build_cache_copied')
        expect(copied).toHaveLength(1)
        expect(copied[0]).toMatchObject({
            ticket: 11,
            content: { paths: [{ path: 'cache', from: 'run_branch' }] },
        })
        const created = records.find(
            (record) =>
                record.kind === 'ticket_worktree_created' &&
                record.ticket === 11
        )
        expect(copied[0]?.seq ?? Infinity).toBeLessThan(
            created?.seq ?? -Infinity
        )
    }, 90_000)

    test("a cache only in the repo's checkout is copied from the checkout", async () => {
        const { records, worktree } = await buildTicket({
            build_cache_paths: ['cache'],
            gitignore: IGNORES_CACHE,
            checkout_files: WARM,
        })

        expect(existsSync(join(worktree, 'cache', 'warm.txt'))).toBe(true)
        expect(recordsOf(records, 'build_cache_copied')).toMatchObject([
            {
                ticket: 11,
                content: { paths: [{ path: 'cache', from: 'checkout' }] },
            },
        ])
    }, 90_000)

    test("a glob's matches each come from the source that has them", async () => {
        const { records, worktree } = await buildTicket({
            build_cache_paths: ['*/.build'],
            gitignore: 'node_modules\n.build\n',
            run_branch_files: { 'a/.build/x.txt': 'x\n' },
            checkout_files: { 'b/.build/y.txt': 'y\n' },
        })

        expect(existsSync(join(worktree, 'a', '.build', 'x.txt'))).toBe(true)
        expect(existsSync(join(worktree, 'b', '.build', 'y.txt'))).toBe(true)
        const copied = recordsOf(records, 'build_cache_copied')
        expect(copied).toHaveLength(1)
        expect(copied[0]?.content).toMatchObject({
            paths: [
                { path: 'a/.build', from: 'run_branch' },
                { path: 'b/.build', from: 'checkout' },
            ],
        })
    }, 90_000)

    test('a cache git does not ignore is never copied', async () => {
        const { records, worktree } = await buildTicket({
            build_cache_paths: ['cache'],
            gitignore: 'node_modules\n',
            run_branch_files: WARM,
        })

        expect(existsSync(join(worktree, 'cache'))).toBe(false)
        expect(recordsOf(records, 'build_cache_skipped')).toMatchObject([
            {
                ticket: 11,
                content: { path: 'cache', reason: 'not_ignored' },
            },
        ])
    }, 90_000)

    test('a cache in neither source is skipped with no_source, and nothing is copied', async () => {
        const { records } = await buildTicket({
            build_cache_paths: ['cache'],
            gitignore: IGNORES_CACHE,
        })

        expect(recordsOf(records, 'build_cache_skipped')).toMatchObject([
            { ticket: 11, content: { path: 'cache', reason: 'no_source' } },
        ])
        expect(recordsOf(records, 'build_cache_copied')).toEqual([])
    }, 90_000)

    test('a failed copy leaves no half-made cache anywhere, and the test-writer still starts', async () => {
        const { records, worktree, run_dir } = await buildTicket({
            build_cache_paths: ['cache'],
            gitignore: IGNORES_CACHE,
            run_branch_files: WARM,
            copy_dir: runsOutOfDisk,
        })

        expect(recordsOf(records, 'build_cache_skipped')).toMatchObject([
            {
                ticket: 11,
                content: {
                    path: 'cache',
                    reason: 'copy_failed',
                    error: 'disk full',
                },
            },
        ])
        expect(worktree).not.toBe('')
        expect(existsSync(join(worktree, 'cache'))).toBe(false)
        expect(existsSync(join(run_dir, 'cache-copies', '11'))).toBe(false)
        const started = records.filter(
            (record) =>
                record.kind === 'agent_started' &&
                record.ticket === 11 &&
                record.content.role === 'test-writer'
        )
        expect(started).toHaveLength(1)
    }, 90_000)
})
