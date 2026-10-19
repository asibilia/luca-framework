import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, describe, expect, test } from 'bun:test'

import type { JournalRecord } from '../journal/journal-record'
import { runManyTickets } from '../testing/many-tickets'
import { HAPPY_TURNS, runPractice } from '../testing/practice-repo'
import { THREE_WAITS } from '../testing/wait-scenarios'

/**
 * Seam 2 for waits between steps (#559): with scripted agents on the
 * practice repo, the engine journals one `ticket_waiting` when a ticket
 * starts to wait on purpose between steps, for another ticket's shared
 * baseline tests, the join queue, or the start queue. A run with no wait
 * journals none.
 */

const roots: string[] = []

const newRoot = async (): Promise<string> => {
    const root = await mkdtemp(join(tmpdir(), 'luca-engine-waits-'))
    roots.push(root)
    return root
}

afterAll(async () => {
    await Promise.all(
        roots.map((root) => rm(root, { recursive: true, force: true }))
    )
})

/** The run's `ticket_waiting` records: ticket, seq, and content. */
const waitsIn = (records: JournalRecord[]) =>
    records
        .filter((record) => (record.kind as string) === 'ticket_waiting')
        .map(({ ticket, seq, content }) => ({
            ticket,
            seq,
            content: content as unknown,
        }))

/** The seq of the first record of `kind` for `ticket`. */
const firstSeq = (
    records: JournalRecord[],
    kind: JournalRecord['kind'],
    ticket: number
): number =>
    records.find((record) => record.kind === kind && record.ticket === ticket)
        ?.seq ?? Infinity

describe('waits between steps, end to end, with scripted agents', () => {
    test('the baseline, join and start waits each write one ticket_waiting when they start, and a run with no wait writes none', async () => {
        const { action, records } = await runManyTickets({
            root: await newRoot(),
            scenario: THREE_WAITS,
        })
        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })

        // #21 and #22 share one baseline: the one that didn't run it waited.
        const [baseline] = records.filter(
            (record) =>
                record.kind === 'baseline_tests' &&
                (record.ticket === 21 || record.ticket === 22)
        )
        const ran = baseline?.ticket ?? 0
        const other = ran === 21 ? 22 : 21
        const waits = waitsIn(records)
        expect(
            waits.map(({ ticket, content }) => ({ ticket, content }))
        ).toEqual([
            {
                ticket: other,
                content: {
                    for: 'baseline',
                    on_ticket: ran,
                    since: expect.any(String),
                },
            },
            {
                ticket: 22,
                content: {
                    for: 'join',
                    on_ticket: 21,
                    since: expect.any(String),
                },
            },
            {
                ticket: 23,
                content: {
                    for: 'start',
                    on_ticket: 22,
                    since: expect.any(String),
                },
            },
        ])
        // Each was written when its wait started, before the wait ended.
        const [forBaseline, forJoin, forStart] = waits
        expect(forBaseline?.seq ?? Infinity).toBeLessThan(
            firstSeq(records, 'baseline_reused', other)
        )
        expect(forJoin?.seq ?? Infinity).toBeLessThan(
            firstSeq(records, 'ticket_joined', 22)
        )
        expect(forStart?.seq ?? Infinity).toBeLessThan(
            firstSeq(records, 'ticket_worktree_created', 23)
        )

        // One ticket alone never waits between steps.
        const alone = await runPractice({
            root: await newRoot(),
            turns: HAPPY_TURNS,
        })
        expect(alone.action).toMatchObject({
            type: 'done',
            outcome: 'pr_opened',
        })
        expect(waitsIn(alone.records)).toEqual([])
    }, 180_000)
})
