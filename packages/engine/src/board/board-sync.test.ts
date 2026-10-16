import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import {
    createBoardSync,
    type BoardEnded,
    type BoardLink,
    type BoardSync,
} from './board-sync'

import type { EngineConfig } from '../config/engine-config'
import { runEngine, startRun } from '../core/execute'
import { createJournal, runJournalPath, type Journal } from '../journal/journal'
import type { JournalEntry, JournalRecord } from '../journal/journal-record'
import {
    recordsFrom,
    specIssue,
    ticketIssue,
    withoutStepRecords,
} from '../testing/intake-fixtures'
import { createInMemoryTracker } from '../tracker/in-memory-tracker'

const CONFIG: EngineConfig = {
    checks: { test: 'bun test' },
    test_file_patterns: ['**/*.test.ts'],
    test_setup_files: [],
    rule_files: [],
}

/**
 * A board plugin in memory. It keeps records only in unbroken seq order, and
 * always answers with the next seq it wants, the way the real plugin does.
 */
const createFakePlugin = ({
    forget_after_sends,
}: {
    /** The plugin "restarts" (forgets everything) after this many sends. */
    forget_after_sends?: number
} = {}) => {
    let kept: JournalRecord[] = []
    const sends: { seqs: number[]; ended: BoardEnded | null }[] = []
    let closed = false
    const link: BoardLink = {
        send: async ({ records, ended }) => {
            sends.push({ seqs: records.map((record) => record.seq), ended })
            for (const record of records) {
                if (record.seq === kept.length + 1) kept = [...kept, record]
            }
            const next_seq = kept.length + 1
            if (sends.length === forget_after_sends) kept = []
            return { ok: true, next_seq, message: 'ok' }
        },
        close: async () => {
            closed = true
        },
    }
    return {
        link,
        sends: () => sends,
        keptSeqs: () => kept.map((record) => record.seq),
        closed: () => closed,
    }
}

const readySpec = () =>
    createInMemoryTracker({
        issues: [
            specIssue({ number: 10 }),
            ticketIssue({ number: 11 }),
            ticketIssue({ number: 12 }),
        ],
        sub_tickets: { 10: [11, 12] },
    })

let runsDir = ''
let journal: Journal

beforeEach(async () => {
    runsDir = await mkdtemp(join(tmpdir(), 'luca-board-sync-'))
    journal = createJournal({
        file: runJournalPath({ runs_dir: runsDir, run_id: 'run' }),
    })
})

afterEach(async () => {
    await rm(runsDir, { recursive: true, force: true })
})

/** Intake passes on a two-ticket spec: five records over two steps. */
const runIntake = async ({ board }: { board: BoardSync }) => {
    startRun({ journal, spec_number: 10, config: CONFIG })
    return runEngine({
        journal,
        tracker: readySpec(),
        stop_before: ['create_run_branch'],
        board,
    })
}

const nothingToDo = ({ count }: { count: number }): JournalRecord[] =>
    recordsFrom({
        entries: Array.from(
            { length: count },
            (): JournalEntry => ({
                kind: 'nothing_to_do',
                ticket: null,
                role: null,
                content: { closed_tickets: [] },
            })
        ),
    })

describe('board sync: the engine sends its journal to the board', () => {
    test('every record reaches the board once, in seq order, step by step', async () => {
        const plugin = createFakePlugin()
        const board = createBoardSync({ link: plugin.link })

        const action = await runIntake({ board })

        expect(action.type).toBe('create_run_branch')
        const seqs = journal.read().map(({ seq }) => seq)
        expect(plugin.keptSeqs()).toEqual(seqs)
        const sent = plugin.sends().flatMap((send) => send.seqs)
        expect(sent).toEqual(seqs)
        expect(plugin.sends().length).toBeGreaterThan(1)
    })

    test('records go in batches of at most 100', async () => {
        const plugin = createFakePlugin()
        const board = createBoardSync({ link: plugin.link })

        await board.sync({ records: nothingToDo({ count: 250 }) })

        expect(plugin.sends().map((send) => send.seqs.length)).toEqual([
            100, 100, 50,
        ])
        expect(plugin.keptSeqs()).toHaveLength(250)
    })

    test('a board that restarted asks for a lower seq and gets the journal again', async () => {
        const plugin = createFakePlugin({ forget_after_sends: 2 })
        const board = createBoardSync({ link: plugin.link })

        await runIntake({ board })

        expect(plugin.keptSeqs()).toEqual(journal.read().map(({ seq }) => seq))
        const firsts = plugin.sends().map((send) => send.seqs[0])
        expect(firsts).toContain(1)
        expect(firsts.lastIndexOf(1)).toBeGreaterThan(0)
    })

    test('a board that keeps failing never breaks the run, and is logged once', async () => {
        const logs: string[] = []
        const board = createBoardSync({
            link: {
                send: async () => {
                    throw new Error('the daemon is down')
                },
            },
            log: (message) => logs.push(message),
        })

        const action = await runIntake({ board })

        expect(action.type).toBe('create_run_branch')
        expect(withoutStepRecords(journal.read())).toHaveLength(5)
        expect(logs).toHaveLength(1)
        expect(logs[0]).toContain('the daemon is down')
    })

    test('a board that answers not ok is logged once and does not loop', async () => {
        const logs: string[] = []
        let sends = 0
        const board = createBoardSync({
            link: {
                send: async () => {
                    sends += 1
                    return { ok: false, next_seq: 1, message: 'bad token' }
                },
            },
            log: (message) => logs.push(message),
        })

        await runIntake({ board })

        expect(logs).toEqual([expect.stringContaining('bad token')])
        // One try per sync: before the loop, then after each of 2 steps.
        expect(sends).toBe(3)
    })

    test('end sends what is left, then the end of the run, then closes', async () => {
        const plugin = createFakePlugin()
        const board = createBoardSync({ link: plugin.link })
        startRun({ journal, spec_number: 10, config: CONFIG })

        await board.end({
            records: journal.read(),
            ok: false,
            message: 'Run stopped: a rejected rate limit',
        })

        expect(plugin.sends()).toEqual([
            { seqs: [1], ended: null },
            {
                seqs: [],
                ended: {
                    ok: false,
                    message: 'Run stopped: a rejected rate limit',
                },
            },
        ])
        expect(plugin.closed()).toBe(true)
    })
})
