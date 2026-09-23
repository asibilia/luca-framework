import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { runDemo, runSpec, type RunLauncher } from './run-modes'

import {
    createScriptedLauncher,
    type ScriptedTurn,
} from '../agents/scripted-launcher'
import {
    createBoardSync,
    type BoardEnded,
    type BoardLink,
} from '../board/board-sync'
import { createTypeSafeJev } from '../jev/jev-client'
import { createJournal, runJournalPath } from '../journal/journal'
import {
    HAPPY_TURNS,
    makePracticeRepo,
    practiceTracker,
} from '../testing/practice-repo'

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
        kinds: () => kinds,
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

describe('luca-run --demo', () => {
    test('builds both practice tickets, opens one PR, tells the board, and cleans up', async () => {
        const recorder = recordingBoard()

        const result = await runDemo({
            run_id: 'luca-20260923-141500-ab12',
            board: recorder.board,
            log,
            turn_delay_ms: 0,
        })

        expect(result.ok).toBe(true)
        expect(result.pull_requests).toHaveLength(1)
        expect(result.pull_requests[0]?.body).toContain('Closes #11')
        expect(result.pull_requests[0]?.body).toContain('Closes #12')
        expect(recorder.kinds()[0]).toBe('run_started')
        expect(recorder.kinds().at(-1)).toBe('pull_request_opened')
        // Jev is asked in shadow mode with no key: journaled, never sent.
        expect(recorder.kinds()).toContain('jev_asked')
        expect(recorder.kinds()).not.toContain('jev_answered')
        expect(recorder.endings()).toEqual([
            { ok: true, message: expect.stringContaining('PR opened') },
        ])
        expect(existsSync(result.root)).toBe(false)
        expect(logs.join('\n')).toContain(result.root)
    }, 120_000)
})

describe('luca-run --spec', () => {
    test('builds the spec with the launcher it is given, opens the PR, and closes the sessions', async () => {
        const { repo } = await makePracticeRepo({ root })
        const recorder = recordingBoard()
        const claude = fakeClaudeLauncher({ turns: HAPPY_TURNS })

        const result = await runSpec({
            spec_number: 10,
            repo,
            run_id: 'run-1',
            base_branch: null,
            runs_dir: join(root, 'runs'),
            tracker: practiceTracker(),
            launcher: claude.launcher,
            board: recorder.board,
            log,
        })

        expect(result).toEqual({
            ok: true,
            message: expect.stringContaining('PR opened'),
        })
        expect(claude.launches().map(({ role }) => role)).toEqual([
            'test-writer',
            'implementer',
            'ticket-reviewer',
        ])
        expect(claude.closed()).toBe(1)
        expect(recorder.kinds()).toContain('agent_finished')
        expect(recorder.kinds().at(-1)).toBe('pull_request_opened')
        expect(recorder.endings()).toEqual([result])
    }, 60_000)

    test('asks Jev in shadow mode when given one', async () => {
        const { repo } = await makePracticeRepo({ root })
        const recorder = recordingBoard()

        const result = await runSpec({
            spec_number: 10,
            repo,
            run_id: 'run-1',
            base_branch: null,
            runs_dir: join(root, 'runs'),
            tracker: practiceTracker(),
            launcher: fakeClaudeLauncher({ turns: HAPPY_TURNS }).launcher,
            jev: { client: createTypeSafeJev({ api_key: '' }) },
            board: recorder.board,
            log,
        })

        expect(result.ok).toBe(true)
        expect(recorder.kinds()).toContain('jev_asked')
        expect(recorder.kinds()).toContain('jev_failed')
    }, 60_000)

    test('a launcher stop ends the run with its reason, and the sessions are closed', async () => {
        const { repo } = await makePracticeRepo({ root })
        const recorder = recordingBoard()
        const claude = fakeClaudeLauncher({
            turns: [
                {
                    role: 'test-writer',
                    ticket: 11,
                    failure: 'stop',
                    error: 'An API key was used, not the Claude plan.',
                },
            ],
        })

        const result = await runSpec({
            spec_number: 10,
            repo,
            run_id: 'run-1',
            base_branch: null,
            runs_dir: join(root, 'runs'),
            tracker: practiceTracker(),
            launcher: claude.launcher,
            board: recorder.board,
            log,
        })

        expect(result).toEqual({
            ok: false,
            message: 'Run stopped: An API key was used, not the Claude plan.',
        })
        expect(recorder.kinds().at(-1)).toBe('run_stopped')
        expect(recorder.endings()).toEqual([result])
        expect(claude.closed()).toBe(1)
    }, 60_000)

    test('a run id with a journal already resumes it instead of starting again', async () => {
        const { repo } = await makePracticeRepo({ root })
        const runs_dir = join(root, 'runs')
        const args = {
            spec_number: 10,
            repo,
            run_id: 'run-1',
            base_branch: null,
            runs_dir,
            tracker: practiceTracker(),
            launcher: fakeClaudeLauncher({ turns: HAPPY_TURNS }).launcher,
            board: null,
            log,
        }

        const first = await runSpec(args)
        const second = await runSpec(args)

        expect(first.ok).toBe(true)
        expect(second).toEqual(first)
        const journal = createJournal({
            file: runJournalPath({ runs_dir, run_id: 'run-1' }),
        })
        expect(
            journal.read().filter((record) => record.kind === 'run_started')
        ).toHaveLength(1)
        expect(logs).toContain('[luca-run] resuming the run from its journal')
    }, 60_000)

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
