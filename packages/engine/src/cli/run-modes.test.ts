import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { LAUNCHER_MISSING, runDemo, runSpec } from './run-modes'

import {
    createBoardSync,
    type BoardEnded,
    type BoardLink,
} from '../board/board-sync'
import { createJournal, runJournalPath } from '../journal/journal'
import { makePracticeRepo, practiceTracker } from '../testing/practice-run'

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
        expect(recorder.endings()).toEqual([
            { ok: true, message: expect.stringContaining('PR opened') },
        ])
        expect(existsSync(result.root)).toBe(false)
        expect(logs.join('\n')).toContain(result.root)
    }, 120_000)
})

describe('luca-run --spec', () => {
    test('with no agent launcher yet, intake runs and the board is told why the run stops', async () => {
        const { repo } = await makePracticeRepo({ root })
        const runs_dir = join(root, 'runs')
        const recorder = recordingBoard()

        const result = await runSpec({
            spec_number: 10,
            repo,
            run_id: 'run-1',
            base_branch: null,
            runs_dir,
            tracker: practiceTracker({ second_ticket: false }),
            board: recorder.board,
            log,
        })

        expect(result).toEqual({ ok: false, message: LAUNCHER_MISSING })
        expect(recorder.kinds()).toEqual([
            'run_started',
            'intake_read',
            'spec_snapshot',
            'ticket_snapshot',
        ])
        expect(recorder.endings()).toEqual([
            { ok: false, message: LAUNCHER_MISSING },
        ])
    })

    test('a run id with a journal already resumes it instead of starting again', async () => {
        const { repo } = await makePracticeRepo({ root })
        const runs_dir = join(root, 'runs')
        const args = {
            spec_number: 10,
            repo,
            run_id: 'run-1',
            base_branch: null,
            runs_dir,
            tracker: practiceTracker({ second_ticket: false }),
            board: null,
            log,
        }

        await runSpec(args)
        await runSpec(args)

        const journal = createJournal({
            file: runJournalPath({ runs_dir, run_id: 'run-1' }),
        })
        expect(
            journal.read().filter((record) => record.kind === 'run_started')
        ).toHaveLength(1)
    })

    test('a repo with no engine config ends with the config error', async () => {
        const recorder = recordingBoard()

        const result = await runSpec({
            spec_number: 10,
            repo: root,
            run_id: 'run-1',
            base_branch: null,
            runs_dir: join(root, 'runs'),
            tracker: practiceTracker({ second_ticket: false }),
            board: recorder.board,
            log,
        })

        expect(result.ok).toBe(false)
        expect(result.message).toContain('No engine config found')
        expect(recorder.endings()).toEqual([result])
    })
})
