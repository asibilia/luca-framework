// The journal uses node:fs on purpose, not Bun.file: appends must be
// synchronous (appendFileSync) so a crash never loses a record the engine
// already acted on, and Bun.file has no append.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

import last from 'lodash/last'

import {
    JournalRecordSchema,
    type JournalEntry,
    type JournalRecord,
} from './journal-record'

/** The file name of a run's journal inside its run folder. */
export const JOURNAL_FILE = 'journal.jsonl'

/** A run's append-only journal. */
export type Journal = {
    file: string
    /** Adds one record at the end and returns it with its `seq` and `time`. */
    append: (entry: JournalEntry) => JournalRecord
    /** Reads and checks every record, oldest first. */
    read: () => JournalRecord[]
}

const parseLine = ({
    line,
    number,
    file,
}: {
    line: string
    number: number
    file: string
}): JournalRecord => {
    let json: unknown
    try {
        json = JSON.parse(line)
    } catch (error) {
        throw new Error(`${file} line ${number} is not JSON: ${String(error)}`)
    }
    const parsed = JournalRecordSchema.safeParse(json)
    if (!parsed.success) {
        throw new Error(
            `${file} line ${number} is not a journal record: ${parsed.error.message}`
        )
    }
    return parsed.data
}

const readRecords = ({ file }: { file: string }): JournalRecord[] => {
    if (!existsSync(file)) return []
    return readFileSync(file, 'utf8')
        .split('\n')
        .map((line, index) => ({ line, number: index + 1 }))
        .filter(({ line }) => line.trim() !== '')
        .map(({ line, number }) => parseLine({ line, number, file }))
}

/**
 * Opens (or creates) the journal at `file`: one JSON line per record, only
 * ever appended to. Reopening a journal continues its sequence numbers, so a
 * restarted engine keeps counting where the crashed one stopped.
 *
 * @example
 * const journal = createJournal({ file: runJournalPath({ runs_dir, run_id }) })
 * journal.append({ kind: 'nothing_to_do', ticket: null, role: null, content: { closed_tickets: [] } })
 */
export const createJournal = ({ file }: { file: string }): Journal => {
    mkdirSync(dirname(file), { recursive: true })
    let lastSeq = last(readRecords({ file }))?.seq ?? 0

    const append = (entry: JournalEntry): JournalRecord => {
        // parse (not safeParse): a bad entry is an engine bug, and it must
        // never reach the disk.
        const record = JournalRecordSchema.parse({
            ...entry,
            seq: lastSeq + 1,
            time: new Date().toISOString(),
        })
        appendFileSync(file, `${JSON.stringify(record)}\n`)
        lastSeq = record.seq
        return record
    }

    return { file, append, read: () => readRecords({ file }) }
}

/**
 * Where runs keep their journals: `~/.local/state/luca/runs`, outside any git
 * repo. `LUCA_RUNS_DIR` overrides it.
 */
export const defaultRunsDir = (): string =>
    process.env.LUCA_RUNS_DIR ??
    join(homedir(), '.local', 'state', 'luca', 'runs')

/** The journal file of one run: `<runs_dir>/<run_id>/journal.jsonl`. */
export const runJournalPath = ({
    runs_dir,
    run_id,
}: {
    runs_dir: string
    run_id: string
}): string => join(runs_dir, run_id, JOURNAL_FILE)

/** A new run id, such as `20260923t101500z-1a2b3c4d`; sorts by start time. */
export const makeRunId = (): string => {
    const stamp = new Date()
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d+/, '')
        .toLowerCase()
    return `${stamp}-${crypto.randomUUID().slice(0, 8)}`
}
