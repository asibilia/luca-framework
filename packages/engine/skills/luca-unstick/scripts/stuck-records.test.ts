import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { readRecords, runState } from './stuck-records'
import { repoRuns } from './stuck-summary'

import { runEnding } from '../../../src/core/run-ended'
import type { JournalEntry } from '../../../src/journal/journal-record'
import {
    intakePassed,
    practiceTicket,
    runBranchCreated,
    ticketSkipped,
} from '../../../src/testing/build-fixtures'
import { recordsFrom } from '../../../src/testing/intake-fixtures'

/**
 * `/luca-unstick`'s journal reading against a run's canonical ending (#706):
 * the summary `/luca-watch` picks its run from must see `run_ended`.
 */

let dir = ''

beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'luca-unstick-records-'))
})

afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
})

/** Writes run `run-1`'s journal to the runs folder and reads it back loosely. */
const writeRun = async ({ entries }: { entries: JournalEntry[] }) => {
    const records = recordsFrom({ entries }).map((record) =>
        record.kind === 'run_started'
            ? { ...record, content: { ...record.content, repo: '/repos/app' } }
            : record
    )
    await mkdir(join(dir, 'run-1'), { recursive: true })
    const file = join(dir, 'run-1', 'journal.jsonl')
    await Bun.write(
        file,
        records.map((record) => JSON.stringify(record)).join('\n') + '\n'
    )
    return readRecords({ file })
}

describe('how the run stands, from its run_ended', () => {
    test('a run that skipped every ticket is over once it journals its run_ended', async () => {
        const skipped: JournalEntry[] = [
            ...intakePassed({
                tickets: [
                    practiceTicket({ number: 11, title: 'Add sum' }),
                    practiceTicket({ number: 12, title: 'Add product' }),
                ],
            }),
            runBranchCreated(),
            ticketSkipped({ ticket: 11 }),
            ticketSkipped({ ticket: 12 }),
        ]
        expect(
            runState({ records: await writeRun({ entries: skipped }) }).over
        ).toBe(false)

        const ending = runEnding({
            action: { type: 'done', outcome: 'all_skipped' },
        })
        const records = await writeRun({
            entries: [
                ...skipped,
                {
                    kind: 'run_ended',
                    ticket: null,
                    role: null,
                    content: ending,
                },
            ],
        })
        const state = runState({ records })
        expect(state.over).toBe(true)
        expect(state.line).toContain('completed')
        expect(state.line).toContain(ending.detail)
        expect(
            repoRuns({ runs_dir: dir, repos: ['/repos/app'] })
        ).toMatchObject([{ run_id: 'run-1', over: true }])
    })
})
