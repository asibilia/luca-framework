import { realpathSync } from 'node:fs'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { $ } from 'bun'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import {
    currentRepos,
    engineRunning,
    LIVE_STALE_MS,
    parseArgs,
    readLiveFile,
    readRecords,
    registryEntry,
    replyOutcome,
    repoRuns,
    type LooseRecord,
} from './stuck-summary'

import {
    commentRead,
    replyReceived,
    ticketRetried,
} from '../../../src/testing/build-fixtures'
import { makeCheckouts } from '../../../src/testing/checkouts-fixtures'
import { recordsFrom } from '../../../src/testing/intake-fixtures'
import {
    stuckOnBadTest,
    writeRunFile,
    type UnstickRun,
} from '../../../src/testing/unstick-fixtures'
import { currentRepos as retroCurrentRepos } from '../../luca-retro/scripts/retro-summary'
import { LIVE_STALE_MS as WATCH_LIVE_STALE_MS } from '../../luca-watch/scripts/wait-for-change'

/**
 * The `/luca-unstick` helper's reply check, and how it finds the run, its
 * registry entry, its engine, and its arguments. Split from
 * `stuck-summary.test.ts` for size.
 */

let dir = ''

beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'luca-unstick-'))
})

afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
})

/** Writes a run's journal to the runs folder and reads it back loosely. */
const writeRun = async (run: Omit<UnstickRun, 'dir'>): Promise<LooseRecord[]> =>
    readRecords({ file: await writeRunFile({ dir, ...run }) })

describe('checking the engine took a reply', () => {
    test('waiting, then taken, then done once the ticket is retried', async () => {
        const before = await writeRun({ entries: stuckOnBadTest() })
        const after = before.at(-1)?.seq ?? 0
        expect(replyOutcome({ records: before, after }).status).toBe('waiting')

        const taken = await writeRun({
            entries: [
                ...stuckOnBadTest(),
                commentRead({ comment_id: 200, body: 'retry #11' }),
                replyReceived({ word: 'retry', ticket: 11, comment_id: 200 }),
            ],
        })
        expect(replyOutcome({ records: taken, after }).status).toBe('taken')

        const done = await writeRun({
            entries: [
                ...stuckOnBadTest(),
                commentRead({ comment_id: 200, body: 'retry #11' }),
                replyReceived({ word: 'retry', ticket: 11, comment_id: 200 }),
                ticketRetried({ ticket: 11, mode: 'resume' }),
            ],
        })
        const outcome = replyOutcome({ records: done, after })
        expect(outcome.status).toBe('done')
        expect(outcome.lines.join('\n')).toContain('ticket_retried #11: resume')
    })

    test('an ignored reply is done, with why', async () => {
        const records = await writeRun({
            entries: [
                ...stuckOnBadTest(),
                {
                    kind: 'reply_ignored',
                    ticket: null,
                    role: null,
                    content: {
                        comment_id: 200,
                        reason: 'no_ticket_named',
                        answer_id: 201,
                    },
                },
            ],
        })
        const outcome = replyOutcome({ records, after: 9 })
        expect(outcome.status).toBe('done')
        expect(outcome.lines.join('\n')).toContain(
            'reply_ignored: no_ticket_named'
        )
    })

    test('a stop is done once taken', async () => {
        const records = await writeRun({
            entries: [
                ...stuckOnBadTest(),
                replyReceived({ word: 'stop', ticket: null, comment_id: 200 }),
            ],
        })
        expect(replyOutcome({ records, after: 9 }).status).toBe('done')
    })
})

describe('finding the run', () => {
    test("the repo lookup is the same code as /luca-retro's twin", () => {
        expect(currentRepos.toString()).toBe(retroCurrentRepos.toString())
    })

    test('a bare repo, or a worktree of one, has no main checkout: its own folder', async () => {
        const bare = join(dir, 'app.git')
        const worktree = join(dir, 'bare-worktree')
        await $`git init -q --bare -b main ${bare}`.quiet()
        await $`git -C ${bare} worktree add -q --orphan -b side ${worktree}`.quiet()
        expect(currentRepos({ cwd: bare })).toEqual([realpathSync(bare)])
        expect(currentRepos({ cwd: worktree })).toEqual([
            realpathSync(worktree),
        ])
    })

    // Twin of the same test in ../../luca-retro/scripts: the two helpers'
    // `currentRepos` must find the same runs from the same folders.
    test("from the main checkout, a worktree, a subfolder, or a symlink, the main checkout's runs", async () => {
        const checkouts = await makeCheckouts({ dir: join(dir, 'git') })
        const runs_dir = join(dir, 'runs')
        const entries = stuckOnBadTest()
        const write = async (run_id: string, repo: string) => {
            await mkdir(join(runs_dir, run_id), { recursive: true })
            await Bun.write(
                join(runs_dir, run_id, 'journal.jsonl'),
                recordsFrom({ entries })
                    .map((record) =>
                        JSON.stringify(
                            record.kind === 'run_started'
                                ? {
                                      ...record,
                                      content: { ...record.content, repo },
                                  }
                                : record
                        )
                    )
                    .join('\n') + '\n'
            )
        }
        await write('of-main', checkouts.main)
        await write('of-outside', checkouts.outside)
        for (const cwd of [
            checkouts.main,
            checkouts.worktree,
            checkouts.subfolder,
            checkouts.link,
        ]) {
            const runs = repoRuns({ runs_dir, repos: currentRepos({ cwd }) })
            expect(runs.map(({ run_id }) => run_id)).toEqual(['of-main'])
        }
        // Outside git, the folder itself, as before.
        expect(
            repoRuns({
                runs_dir,
                repos: currentRepos({ cwd: checkouts.outside }),
            }).map(({ run_id }) => run_id)
        ).toEqual(['of-outside'])
    })

    test("the repo's runs, newest first, with what waits in each", async () => {
        await writeRun({ run_id: 'old', entries: stuckOnBadTest() })
        await writeRun({
            run_id: 'other-repo',
            entries: stuckOnBadTest(),
            repo: '/repos/other',
        })
        const runs = repoRuns({ runs_dir: dir, repos: ['/repos/app'] })
        expect(runs.map(({ run_id }) => run_id)).toEqual(['old'])
        expect(runs[0]).toMatchObject({ spec: 10, over: false, stuck: 1 })
    })

    test('the registry gives how the board saw the run end, never its token', async () => {
        const registry = join(dir, 'runs.json')
        await Bun.write(
            registry,
            JSON.stringify({
                version: 1,
                runs: [
                    {
                        run_id: 'run-1',
                        token: 'secret-token',
                        repo: '/repos/app',
                        spec: 10,
                        log_path: '/tmp/run-1.log',
                        ended: { ok: false, message: 'The engine crashed: x' },
                        restarts: 1,
                    },
                ],
            })
        )
        const entry = registryEntry({ registry, run_id: 'run-1' })
        expect(entry).toEqual({
            spec: 10,
            repo: '/repos/app',
            log_path: '/tmp/run-1.log',
            ended: { ok: false, message: 'The engine crashed: x' },
            restarts: 1,
        })
        expect(JSON.stringify(entry)).not.toContain('secret-token')
        expect(registryEntry({ registry, run_id: 'nope' })).toBeNull()
    })

    test('an engine is running when a command line names the run as a whole word', () => {
        const command_lines = [
            'bun luca-run.ts --resume run-10 --repo /x',
            'bun luca-run.ts --run-id=run-2',
        ]
        const running = ({
            run_id,
            lines = command_lines,
        }: {
            run_id: string
            lines?: string[] | null
        }) =>
            engineRunning({
                run_id,
                command_lines: lines,
                live: null,
                alive: () => false,
                now: 0,
            })
        expect(running({ run_id: 'run-1' })).toBe(false)
        expect(running({ run_id: 'run-10' })).toBe(true)
        expect(running({ run_id: 'run-2' })).toBe(true)
        expect(running({ run_id: 'run-1', lines: null })).toBe(null)
    })

    test('an engine started with --spec and no --run-id is running while its live file is fresh (#727)', () => {
        const command_lines = ['bun luca-run.ts --spec 720']
        const now = Date.parse('2026-11-07T02:10:00.000Z')
        const running = (written_at: string | null) =>
            engineRunning({
                run_id: 'run-1',
                command_lines,
                live: written_at === null ? null : { written_at, pid: null },
                alive: () => false,
                now,
            })
        expect(running('2026-11-07T02:09:57.000Z')).toBe(true)
        expect(running('2026-11-07T02:08:00.000Z')).toBe(false)
        // A clock ahead, or a copied file, is not fresh forever.
        expect(running('2026-11-07T02:30:00.000Z')).toBe(false)
        expect(running(null)).toBe(false)
        // A fresh live file says so even when ps failed.
        expect(
            engineRunning({
                run_id: 'run-1',
                command_lines: null,
                live: { written_at: '2026-11-07T02:09:57.000Z', pid: null },
                alive: () => false,
                now,
            })
        ).toBe(true)
    })

    test('with a pid in the live file, the engine runs exactly while that pid is alive, however old the file (#727)', () => {
        const now = Date.parse('2026-11-07T02:10:00.000Z')
        const running = ({
            written_at,
            alive,
        }: {
            written_at: string
            alive: boolean
        }) =>
            engineRunning({
                run_id: 'run-1',
                command_lines: ['bun luca-run.ts --spec 720'],
                live: { written_at, pid: 56973 },
                alive: (pid) => alive && pid === 56973,
                now,
            })
        // Asleep for minutes, still alive.
        expect(
            running({ written_at: '2026-11-07T02:05:00.000Z', alive: true })
        ).toBe(true)
        // Just stopped or crashed: its last write is fresh, but it's gone.
        expect(
            running({ written_at: '2026-11-07T02:09:59.000Z', alive: false })
        ).toBe(false)
    })

    test("the stale window is /luca-watch's", () => {
        expect(LIVE_STALE_MS).toBe(WATCH_LIVE_STALE_MS)
    })

    test("the live file's written_at and pid are read from the run folder, or null", async () => {
        await mkdir(join(dir, 'run-1'), { recursive: true })
        expect(readLiveFile({ runs_dir: dir, run_id: 'run-1' })).toBeNull()
        await Bun.write(join(dir, 'run-1', 'live.json'), '{ half')
        expect(readLiveFile({ runs_dir: dir, run_id: 'run-1' })).toBeNull()
        await Bun.write(
            join(dir, 'run-1', 'live.json'),
            JSON.stringify({ written_at: '2026-11-07T02:09:57.000Z' })
        )
        expect(readLiveFile({ runs_dir: dir, run_id: 'run-1' })).toEqual({
            written_at: '2026-11-07T02:09:57.000Z',
            pid: null,
        })
        await Bun.write(
            join(dir, 'run-1', 'live.json'),
            JSON.stringify({ written_at: '2026-11-07T02:09:57.000Z', pid: 42 })
        )
        expect(readLiveFile({ runs_dir: dir, run_id: 'run-1' })).toEqual({
            written_at: '2026-11-07T02:09:57.000Z',
            pid: 42,
        })
    })

    test('the arguments: a run id, a ticket with or without #, and flags', () => {
        const args = parseArgs({
            argv: ['run-1', '#134', '--watch', '42'],
            env: {},
            home: '/home/me',
        })
        expect(args).toMatchObject({
            run_id: 'run-1',
            ticket: 134,
            watch: 42,
            runs_dir: '/home/me/.local/state/luca/runs',
            registry: '/home/me/.local/state/luca/board/runs.json',
        })
        expect(
            parseArgs({
                argv: ['139'],
                env: { LUCA_RUNS_DIR: '/runs', LUCA_BOARD_STATE_DIR: '/b' },
                home: '/home/me',
            })
        ).toMatchObject({
            run_id: null,
            ticket: 139,
            runs_dir: '/runs',
            registry: '/b/runs.json',
        })
    })
})
