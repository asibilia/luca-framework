import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

import {
    gatesRun,
    implemented,
    intakePassed,
    practiceTicket,
    runBranchCreated,
    stuckReported,
    ticketStuck,
    ticketWorktreeCreated,
} from './build-fixtures'
import { recordsFrom } from './intake-fixtures'

import type { JournalEntry } from '../journal/journal-record'

/**
 * Journals for the `/luca-unstick` helper's tests (`stuck-summary*.test.ts`),
 * written to disk as the engine writes them.
 */

export const UNSTICK_TICKETS = [
    practiceTicket({ number: 11, title: 'Add sum' }),
    practiceTicket({ number: 12, title: 'Add product' }),
]

/** Ticket #11 stuck on a bad test, reported on the spec. */
export const stuckOnBadTest = (): JournalEntry[] => [
    ...intakePassed({ tickets: UNSTICK_TICKETS }),
    runBranchCreated(),
    ticketWorktreeCreated({ ticket: 11 }),
    implemented({
        ticket: 11,
        outcome: 'bad_test',
        reason: 'It pins build addresses.',
    }),
    gatesRun({ ticket: 11, target: 'ticket', ok: false }),
    ticketStuck({ ticket: 11, reason: 'bad_test', detail: 'Sent back twice.' }),
    stuckReported({ ticket: 11 }),
]

/** A run's journal to write: its entries, repo, and first seq. */
export type UnstickRun = {
    /** The runs folder. */
    dir: string
    run_id?: string
    entries: JournalEntry[]
    repo?: string
    first_seq?: number
}

/**
 * Writes a run's journal to the runs folder `dir`, its seqs starting at
 * `first_seq` and its `run_started` naming `repo`, and returns its path.
 */
export const writeRunFile = async ({
    dir,
    run_id = 'run-1',
    entries,
    repo = '/repos/app',
    first_seq = 1,
}: UnstickRun): Promise<string> => {
    const records = recordsFrom({ entries }).map((record) => ({
        ...(record.kind === 'run_started'
            ? { ...record, content: { ...record.content, repo } }
            : record),
        seq: record.seq + first_seq - 1,
    }))
    await mkdir(join(dir, run_id), { recursive: true })
    const file = join(dir, run_id, 'journal.jsonl')
    await Bun.write(
        file,
        records.map((record) => JSON.stringify(record)).join('\n') + '\n'
    )
    return file
}
