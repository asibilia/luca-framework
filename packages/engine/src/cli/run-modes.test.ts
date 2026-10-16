import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import {
    restartableRuns,
    resumeRun,
    runSpec,
    unfinishedRuns,
    type RunLauncher,
} from './run-modes'

import {
    createScriptedLauncher,
    type ScriptedTurn,
} from '../agents/scripted-launcher'
import {
    createBoardSync,
    type BoardEnded,
    type BoardLink,
} from '../board/board-sync'
import { startRun } from '../core/execute'
import { createJournal, runJournalPath } from '../journal/journal'
import { createFakeMuninn } from '../testing/fake-muninn'
import {
    PRACTICE_ENGINE_CONFIG,
    practiceTracker,
} from '../testing/practice-repo'

/**
 * The `luca-run` modes that need no practice repo: a missing engine config,
 * a run to resume that isn't there, and the unfinished-runs list. They run
 * with the fast tests (#568). The runs themselves are in
 * `run-modes.e2e.test.ts`.
 */

/**
 * A stand-in for the Claude launcher: scripted turns, plus a `closeAll`
 * that counts its calls.
 */
const fakeClaudeLauncher = ({ turns }: { turns: ScriptedTurn[] }) => {
    const scripted = createScriptedLauncher({ turns })
    let closed = 0
    const launcher: RunLauncher = {
        launch: scripted.launch,
        followUp: scripted.followUp,
        closeSession: scripted.closeSession,
        closeAll: async () => {
            closed += 1
        },
    }
    return { launcher, closed: () => closed, launches: scripted.launches }
}

/** A board that keeps everything it is sent. */
const recordingBoard = () => {
    const kinds: string[] = []
    const seqs: number[] = []
    const endings: BoardEnded[] = []
    const link: BoardLink = {
        send: async ({ records, ended }) => {
            for (const record of records) {
                if (record.seq === seqs.length + 1) {
                    seqs.push(record.seq)
                    kinds.push(record.kind)
                }
            }
            if (ended !== null) endings.push(ended)
            return { ok: true, next_seq: seqs.length + 1, message: 'ok' }
        },
    }
    return {
        board: createBoardSync({ link }),
        /** The kinds it got, without the scheduler's step records. */
        kinds: () =>
            kinds.filter(
                (kind) =>
                    kind !== 'step_started' &&
                    kind !== 'step_ended' &&
                    kind !== 'run_resumed'
            ),
        endings: () => endings,
    }
}

let root = ''
const logs: string[] = []
const log = (line: string) => {
    logs.push(line)
}

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'luca-run-modes-'))
    logs.length = 0
})

afterEach(async () => {
    await rm(root, { recursive: true, force: true })
})

describe('luca-run --spec', () => {
    test('a repo with no engine config ends with the config error', async () => {
        const recorder = recordingBoard()
        const claude = fakeClaudeLauncher({ turns: [] })

        const result = await runSpec({
            spec_number: 10,
            repo: root,
            run_id: 'run-1',
            base_branch: null,
            runs_dir: join(root, 'runs'),
            tracker: practiceTracker(),
            launcher: claude.launcher,
            board: recorder.board,
            log,
        })

        expect(result.ok).toBe(false)
        expect(result.message).toContain('No engine config found')
        expect(recorder.endings()).toEqual([result])
        expect(claude.launches()).toEqual([])
        expect(claude.closed()).toBe(1)
    })
})

describe('luca-run --resume', () => {
    test('a run id with no journal is a clear error, and nothing runs', async () => {
        const recorder = recordingBoard()
        const claude = fakeClaudeLauncher({ turns: [] })
        const muninn = createFakeMuninn()
        const runs_dir = join(root, 'runs')

        const end = await resumeRun({
            run_id: 'no-such-run',
            runs_dir,
            repo: null,
            tracker: () => practiceTracker(),
            launcher: claude.launcher,
            memory: { client: muninn },
            board: recorder.board,
            log,
        })

        expect(end).toEqual({
            ok: false,
            message: expect.stringContaining('No run no-such-run'),
        })
        expect(muninn.closed()).toBe(true)
        expect(muninn.calls()).toEqual([])
        expect(recorder.endings()).toEqual([end])
        expect(claude.launches()).toEqual([])
        expect(claude.closed()).toBe(1)
        expect(existsSync(join(runs_dir, 'no-such-run'))).toBe(false)
    })

    test('an empty journal is a clear error too', async () => {
        const runs_dir = join(root, 'runs')
        const file = runJournalPath({ runs_dir, run_id: 'empty' })
        createJournal({ file })
        await Bun.write(file, '')

        const end = await resumeRun({
            run_id: 'empty',
            runs_dir,
            repo: null,
            tracker: () => practiceTracker(),
            launcher: fakeClaudeLauncher({ turns: [] }).launcher,
            board: null,
            log,
        })

        expect(end).toEqual({
            ok: false,
            message: expect.stringContaining('empty'),
        })
        expect(unfinishedRuns({ runs_dir })).toEqual([])
    })

    test('unfinished runs: none in a runs folder that does not exist', () => {
        expect(unfinishedRuns({ runs_dir: join(root, 'nowhere') })).toEqual([])
    })
})

describe('luca-run --unfinished', () => {
    /** A journal in `runs_dir` that started a run, then got `entries`. */
    const writeRun = ({
        runs_dir,
        run_id,
        entries,
    }: {
        runs_dir: string
        run_id: string
        entries: Parameters<ReturnType<typeof createJournal>['append']>[0][]
    }) => {
        const journal = createJournal({
            file: runJournalPath({ runs_dir, run_id }),
        })
        startRun({
            journal,
            spec_number: 10,
            config: PRACTICE_ENGINE_CONFIG,
            repo: '/code/app',
        })
        for (const entry of entries) journal.append(entry)
    }

    const stopped = ({
        reason,
        billing,
        crashed = false,
    }: {
        reason: string
        billing: boolean
        crashed?: boolean
    }) => ({
        kind: 'run_stopped' as const,
        ticket: null,
        role: null,
        content: { reason, role: null, billing, crashed },
    })

    test('lists each unfinished run with whether Paseo may restart it', async () => {
        const runs_dir = join(root, 'runs')
        writeRun({ runs_dir, run_id: 'a-crashed', entries: [] })
        writeRun({
            runs_dir,
            run_id: 'b-launcher',
            entries: [stopped({ reason: 'wrong login', billing: false })],
        })
        writeRun({
            runs_dir,
            run_id: 'c-billing',
            entries: [stopped({ reason: 'overage in use', billing: true })],
        })
        writeRun({
            runs_dir,
            run_id: 'd-finished',
            entries: [
                {
                    kind: 'nothing_to_do',
                    ticket: null,
                    role: null,
                    content: { closed_tickets: [] },
                },
            ],
        })
        await Bun.write(join(runs_dir, 'e-no-journal', 'notes.txt'), 'hi')

        expect(restartableRuns({ runs_dir })).toEqual([
            {
                run_id: 'a-crashed',
                restart: true,
                reason: 'resumable',
                message: null,
            },
            {
                run_id: 'b-launcher',
                restart: false,
                reason: 'launcher_stopped',
                message: 'wrong login',
            },
            {
                run_id: 'c-billing',
                restart: false,
                reason: 'billing_stopped',
                message: 'overage in use',
            },
        ])
    })

    test('a billing stop anywhere in the journal is never restarted', () => {
        const runs_dir = join(root, 'runs')
        writeRun({
            runs_dir,
            run_id: 'r1',
            entries: [
                stopped({ reason: 'overage in use', billing: true }),
                stopped({ reason: 'wrong model', billing: false }),
            ],
        })

        expect(restartableRuns({ runs_dir })).toEqual([
            {
                run_id: 'r1',
                restart: false,
                reason: 'billing_stopped',
                message: 'overage in use',
            },
        ])
    })

    test('none in a runs folder that does not exist', () => {
        expect(restartableRuns({ runs_dir: join(root, 'nowhere') })).toEqual([])
    })
})
