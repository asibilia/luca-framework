import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import {
    createJournal,
    defaultRunsDir,
    makeRunId,
    runJournalPath,
} from './journal'
import { replayRun } from './replay'

const CONFIG = {
    checks: { test: 'bun test' },
    test_file_patterns: ['**/*.test.ts'],
    test_setup_files: [],
    rule_files: [],
}

let runsDir = ''

beforeEach(async () => {
    runsDir = await mkdtemp(join(tmpdir(), 'luca-engine-journal-'))
})

afterEach(async () => {
    await rm(runsDir, { recursive: true, force: true })
})

describe('journal', () => {
    test('each append gets the next sequence number, a time, and who it is about', () => {
        const journal = createJournal({
            file: runJournalPath({ runs_dir: runsDir, run_id: 'run-1' }),
        })

        const first = journal.append({
            kind: 'run_started',
            ticket: null,
            role: null,
            content: { spec_number: 10, config: CONFIG },
        })
        const second = journal.append({
            kind: 'nothing_to_do',
            ticket: null,
            role: null,
            content: { closed_tickets: [11] },
        })

        expect(first).toMatchObject({
            seq: 1,
            kind: 'run_started',
            ticket: null,
            role: null,
            content: { spec_number: 10 },
        })
        expect(second).toMatchObject({
            seq: 2,
            kind: 'nothing_to_do',
            content: { closed_tickets: [11] },
        })
        expect(Number.isNaN(Date.parse(first.time))).toBe(false)
    })

    test('the journal is one JSON line per record in the run folder', async () => {
        const file = runJournalPath({ runs_dir: runsDir, run_id: 'run-2' })
        const journal = createJournal({ file })

        journal.append({
            kind: 'run_started',
            ticket: null,
            role: null,
            content: { spec_number: 10, config: CONFIG },
        })
        journal.append({
            kind: 'nothing_to_do',
            ticket: null,
            role: null,
            content: { closed_tickets: [] },
        })

        expect(file).toBe(join(runsDir, 'run-2', 'journal.jsonl'))
        const lines = (await readFile(file, 'utf8')).trimEnd().split('\n')
        expect(lines).toHaveLength(2)
        expect(JSON.parse(lines[0] ?? '')).toMatchObject({
            seq: 1,
            kind: 'run_started',
        })
        expect(JSON.parse(lines[1] ?? '')).toMatchObject({
            seq: 2,
            kind: 'nothing_to_do',
        })
    })

    test('appending never rewrites earlier records', async () => {
        const file = runJournalPath({ runs_dir: runsDir, run_id: 'run-3' })
        const journal = createJournal({ file })
        journal.append({
            kind: 'run_started',
            ticket: null,
            role: null,
            content: { spec_number: 10, config: CONFIG },
        })
        const before = await readFile(file, 'utf8')

        journal.append({
            kind: 'nothing_to_do',
            ticket: null,
            role: null,
            content: { closed_tickets: [] },
        })

        expect((await readFile(file, 'utf8')).startsWith(before)).toBe(true)
    })

    test('reopening a journal keeps counting from the last record', () => {
        const file = runJournalPath({ runs_dir: runsDir, run_id: 'run-4' })
        createJournal({ file }).append({
            kind: 'run_started',
            ticket: null,
            role: null,
            content: { spec_number: 10, config: CONFIG },
        })

        const reopened = createJournal({ file })
        const record = reopened.append({
            kind: 'nothing_to_do',
            ticket: null,
            role: null,
            content: { closed_tickets: [] },
        })

        expect(record.seq).toBe(2)
        expect(reopened.read().map((each) => each.seq)).toEqual([1, 2])
    })

    test('a run is rebuilt by replaying its journal file', () => {
        const file = runJournalPath({ runs_dir: runsDir, run_id: 'run-5' })
        const journal = createJournal({ file })
        journal.append({
            kind: 'run_started',
            ticket: null,
            role: null,
            content: { spec_number: 10, config: CONFIG },
        })
        journal.append({
            kind: 'intake_refused',
            ticket: null,
            role: null,
            content: {
                problems: [{ ticket: 11, missing: ['A checkbox.'] }],
            },
        })

        const state = replayRun({ records: createJournal({ file }).read() })

        expect(state).toMatchObject({
            phase: 'refused',
            spec_number: 10,
            config: CONFIG,
            problems: [{ ticket: 11, missing: ['A checkbox.'] }],
            last_seq: 2,
        })
    })

    test('a line that is not a journal record is an error on read', async () => {
        const file = runJournalPath({ runs_dir: runsDir, run_id: 'run-6' })
        const journal = createJournal({ file })
        journal.append({
            kind: 'run_started',
            ticket: null,
            role: null,
            content: { spec_number: 10, config: CONFIG },
        })
        await Bun.write(
            file,
            `${await readFile(file, 'utf8')}{"seq":2,"kind":"mystery"}\n`
        )

        expect(() => journal.read()).toThrow('line 2')
    })

    test('runs live outside git, under the Luca state folder by default', () => {
        const saved = process.env.LUCA_RUNS_DIR
        delete process.env.LUCA_RUNS_DIR
        expect(defaultRunsDir()).toBe(
            join(homedir(), '.local', 'state', 'luca', 'runs')
        )
        process.env.LUCA_RUNS_DIR = '/tmp/custom-runs'
        expect(defaultRunsDir()).toBe('/tmp/custom-runs')
        if (saved === undefined) delete process.env.LUCA_RUNS_DIR
        else process.env.LUCA_RUNS_DIR = saved
    })

    test('run ids are unique and safe as folder names', () => {
        const first = makeRunId()
        const second = makeRunId()

        expect(first).not.toBe(second)
        expect(first).toMatch(/^[a-z0-9-]+$/)
    })
})
