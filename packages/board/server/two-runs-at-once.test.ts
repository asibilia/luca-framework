import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, test } from 'bun:test'

import { createHarness } from './testing/board-harness'
import {
    intakeOfThree,
    runStarted,
    stamp,
    ticketStuck,
    ticketWorktreeCreated,
    type Entry,
} from './testing/journal-fixtures'

import type { BoardReadOutput, EngineRecord } from '../shared/board-rpc'

/**
 * Two runs at once, in different repos, stay apart on the board (#431):
 * a run the plugin didn't start shows only in the workspace whose folder
 * is its repo, and a plugin copy's registry write keeps the runs another
 * copy wrote since it last read the file.
 */

const dirs: string[] = []

afterEach(async () => {
    for (const dir of dirs.splice(0)) {
        await rm(dir, { recursive: true, force: true })
    }
})

const tempDir = async () => {
    const dir = await mkdtemp(join(tmpdir(), 'luca-board-two-runs-'))
    dirs.push(dir)
    return dir
}

const TMNB = '/code/tmnb'
const LUCA = '/code/luca-framework'

/** Spec 10 with ticket 13 stuck, its `run_started` naming `repo`. */
const stuckRunIn = ({ repo }: { repo: string }): Entry[] =>
    [
        ...intakeOfThree(),
        ticketWorktreeCreated({ ticket: 13 }),
        ticketStuck({ ticket: 13, reason: 'red_check_failed', detail: 'x' }),
    ].map((entry) =>
        entry.kind === 'run_started'
            ? {
                  ...entry,
                  content: { ...(entry.content as object), repo },
              }
            : entry
    )

/**
 * Writes a run's journal the way the engine does, its records stamped
 * from `start` one second apart.
 */
const writeJournal = async ({
    runs_dir,
    run_id,
    entries,
    start = '2026-09-23T12:00:00.000Z',
}: {
    runs_dir: string
    run_id: string
    entries: Entry[]
    start?: string
}) => {
    const base = Date.parse(start)
    const records: EngineRecord[] = stamp({ entries }).map((record) => ({
        ...record,
        time: new Date(base + record.seq * 1000).toISOString(),
    }))
    await mkdir(join(runs_dir, run_id), { recursive: true })
    await writeFile(
        join(runs_dir, run_id, 'journal.jsonl'),
        `${records.map((record) => JSON.stringify(record)).join('\n')}\n`
    )
}

const TMNB_RUN = 'luca-20260925-101500-aaaa'
const LUCA_RUN = 'luca-20260925-101700-bbbb'

/** A board plugin on a runs folder with no chats' runs of its own yet. */
const boardOn = async () => {
    const runs_dir = await tempDir()
    const harness = await createHarness({
        registry_dir: await tempDir(),
        runs_dir,
    })
    /** `board.read` as the panel of the workspace in `directory` asks it. */
    const readIn = ({
        workspace_id,
        directory,
        run_id = null,
    }: {
        workspace_id: string
        directory: string
        run_id?: string | null
    }): Promise<BoardReadOutput> =>
        harness.board.readBoard({ workspace_id, directory, run_id })
    return { ...harness, runs_dir, readIn }
}

const idsOf = ({ runs }: BoardReadOutput) => runs.map((run) => run.run_id)

describe('a command-line run shows only in the workspace of its repo', () => {
    test('a command-line run shows in the panel of the workspace whose folder is its repo', async () => {
        const board = await boardOn()
        await writeJournal({
            runs_dir: board.runs_dir,
            run_id: TMNB_RUN,
            entries: stuckRunIn({ repo: TMNB }),
        })
        await writeJournal({
            runs_dir: board.runs_dir,
            run_id: LUCA_RUN,
            entries: stuckRunIn({ repo: LUCA }),
            start: '2026-09-25T10:17:00.000Z',
        })

        const read = await board.readIn({
            workspace_id: 'ws-tmnb',
            directory: TMNB,
        })

        expect(idsOf(read)).toEqual([TMNB_RUN])
        expect(read.selected?.run.run_id).toBe(TMNB_RUN)
        expect(read.selected?.run.status).toBe('stuck')
    })

    test("a command-line run does not show in the panel of another repo's workspace", async () => {
        const board = await boardOn()
        await writeJournal({
            runs_dir: board.runs_dir,
            run_id: TMNB_RUN,
            entries: stuckRunIn({ repo: TMNB }),
        })

        const read = await board.readIn({
            workspace_id: 'ws-luca',
            directory: LUCA,
        })

        expect(idsOf(read)).toEqual([])
        expect(read.selected).toBeNull()
    })

    test('two command-line runs in different repos each show only in their own workspace', async () => {
        const board = await boardOn()
        await writeJournal({
            runs_dir: board.runs_dir,
            run_id: TMNB_RUN,
            entries: stuckRunIn({ repo: TMNB }),
        })
        await writeJournal({
            runs_dir: board.runs_dir,
            run_id: LUCA_RUN,
            entries: stuckRunIn({ repo: LUCA }),
        })

        const tmnb = await board.readIn({
            workspace_id: 'ws-tmnb',
            directory: TMNB,
        })
        const luca = await board.readIn({
            workspace_id: 'ws-luca',
            directory: LUCA,
        })

        expect(idsOf(tmnb)).toEqual([TMNB_RUN])
        expect(tmnb.selected?.run.run_id).toBe(TMNB_RUN)
        expect(idsOf(luca)).toEqual([LUCA_RUN])
        expect(luca.selected?.run.run_id).toBe(LUCA_RUN)
    })

    test("a workspace's panel does not open on another repo's command-line run asked for by id", async () => {
        const board = await boardOn()
        await writeJournal({
            runs_dir: board.runs_dir,
            run_id: TMNB_RUN,
            entries: stuckRunIn({ repo: TMNB }),
        })

        const read = await board.readIn({
            workspace_id: 'ws-luca',
            directory: LUCA,
            run_id: TMNB_RUN,
        })

        expect(idsOf(read)).not.toContain(TMNB_RUN)
        expect(read.selected?.run.run_id).not.toBe(TMNB_RUN)
    })

    test("a workspace's panel opens on its own run, not on a newer command-line run of another repo", async () => {
        const board = await boardOn()
        const { run_id: own, token } = await board.start({
            workspace_id: 'ws-1',
            cwd: '/repo',
        })
        await board.send({
            run_id: own,
            token,
            entries: [runStarted({ spec: 10 })],
        })
        await board.board.idle()
        await writeJournal({
            runs_dir: board.runs_dir,
            run_id: TMNB_RUN,
            entries: stuckRunIn({ repo: TMNB }),
            start: '2026-09-25T10:15:00.000Z',
        })

        const read = await board.readIn({
            workspace_id: 'ws-1',
            directory: '/repo',
        })

        expect(idsOf(read)).toEqual([own])
        expect(read.selected?.run.run_id).toBe(own)
    })

    test('a command-line run started while the board runs shows up in its own workspace on the next read', async () => {
        const board = await boardOn()
        await board.readIn({ workspace_id: 'ws-tmnb', directory: TMNB })
        await board.readIn({ workspace_id: 'ws-luca', directory: LUCA })

        await writeJournal({
            runs_dir: board.runs_dir,
            run_id: TMNB_RUN,
            entries: stuckRunIn({ repo: TMNB }),
        })
        const tmnb = await board.readIn({
            workspace_id: 'ws-tmnb',
            directory: TMNB,
        })
        const luca = await board.readIn({
            workspace_id: 'ws-luca',
            directory: LUCA,
        })

        expect(idsOf(tmnb)).toEqual([TMNB_RUN])
        expect(idsOf(luca)).toEqual([])
        expect(luca.selected).toBeNull()
    })
})

describe('a registry write keeps the runs another plugin copy added', () => {
    /** A plugin copy on the shared registry folder, as during a reload. */
    const copyOn = ({
        registry_dir,
        spawn_throws = null,
    }: {
        registry_dir: string
        spawn_throws?: string | null
    }) => createHarness({ registry_dir, spawn_throws })

    /** Starts a run from `ws-2`'s chat, in another repo. */
    const startOther = async ({
        copy,
    }: {
        copy: Awaited<ReturnType<typeof copyOn>>
    }) => {
        const started = await copy.start({
            agent_id: 'agent-2',
            workspace_id: 'ws-2',
            cwd: '/other',
        })
        if (!started.output.ok) throw new Error(started.output.message)
        return started
    }

    test('starting a run keeps a run another copy started since this copy read the registry', async () => {
        const registry_dir = await tempDir()
        const first = await copyOn({ registry_dir })
        const second = await copyOn({ registry_dir })
        await first.read()
        await second.read()

        const other = await startOther({ copy: second })
        const own = await first.start()

        const reloaded = await copyOn({ registry_dir })
        expect(own.output.ok).toBe(true)
        expect(idsOf(await reloaded.read({ workspace_id: 'ws-2' }))).toEqual([
            other.run_id,
        ])
        expect(idsOf(await reloaded.read({ workspace_id: 'ws-1' }))).toEqual([
            own.run_id,
        ])
    })

    test('the kept run still takes its engine events after a reload', async () => {
        const registry_dir = await tempDir()
        const first = await copyOn({ registry_dir })
        const second = await copyOn({ registry_dir })
        await first.read()
        await second.read()

        const other = await startOther({ copy: second })
        await first.start()

        const reloaded = await copyOn({ registry_dir })
        const reply = await reloaded.send({
            run_id: other.run_id,
            token: other.token,
            entries: [runStarted({ spec: 10 })],
        })
        await reloaded.board.idle()

        expect(reply.ok).toBe(true)
        expect(reply.next_seq).toBe(2)
    })

    test("marking a run's engine ended keeps a run another copy started since this copy read the registry", async () => {
        const registry_dir = await tempDir()
        const first = await copyOn({ registry_dir })
        const own = await first.start()
        const second = await copyOn({ registry_dir })
        await second.read()

        const other = await startOther({ copy: second })
        await first.send({
            run_id: own.run_id,
            token: own.token,
            entries: [runStarted({ spec: 10 })],
            ended: { ok: false, message: 'The engine stopped.' },
        })
        await first.board.idle()

        const reloaded = await copyOn({ registry_dir })
        expect(idsOf(await reloaded.read({ workspace_id: 'ws-2' }))).toEqual([
            other.run_id,
        ])
        const mine = await reloaded.read({ workspace_id: 'ws-1' })
        expect(idsOf(mine)).toEqual([own.run_id])
        expect(mine.selected?.run.engine_ended).toEqual({
            ok: false,
            message: 'The engine stopped.',
        })
    })

    test("a run that couldn't start is dropped without dropping a run another copy started", async () => {
        const registry_dir = await tempDir()
        const first = await copyOn({ registry_dir, spawn_throws: 'no bun' })
        const second = await copyOn({ registry_dir })
        await first.read()
        await second.read()

        const other = await startOther({ copy: second })
        const failed = await first.start()

        const reloaded = await copyOn({ registry_dir })
        expect(failed.output.ok).toBe(false)
        expect(idsOf(await reloaded.read({ workspace_id: 'ws-2' }))).toEqual([
            other.run_id,
        ])
        expect(idsOf(await reloaded.read({ workspace_id: 'ws-1' }))).toEqual([])
    })
})
