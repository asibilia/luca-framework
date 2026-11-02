import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { gatesFailedForGood } from './decide-stuck-helpers'
import { runEngine, startRun } from './execute'

import type { EngineConfig } from '../config/engine-config'
import { createJournal, runJournalPath, type Journal } from '../journal/journal'
import type { JournalEntry, JournalRecord } from '../journal/journal-record'
import {
    billingStopped,
    commentRead,
    intakePassed,
    practiceTicket,
    pullRequestOpened,
    replyReceived,
    runBranchCreated,
    stuckReported,
    ticketPath,
    ticketSkipped,
    withInstalls,
    worktreesRemoved,
    RUN_BRANCH_PATH,
} from '../testing/build-fixtures'
import { specIssue, ticketIssue } from '../testing/intake-fixtures'
import { createInMemoryTracker } from '../tracker/in-memory-tracker'

/**
 * The run's one canonical ending (#706): every terminal path journals one
 * `run_ended` with its outcome, a human-readable detail, and the PR's URL or
 * null. A redone ending adds no second one. A crash is not an ending. The
 * PR opening and a resumable launcher stop end to end are in
 * `run-ended.e2e.test.ts`.
 */

const CONFIG: EngineConfig = {
    checks: { test: 'bun test' },
    test_file_patterns: ['**/*.test.ts'],
    test_setup_files: [],
    rule_files: [],
}

let root = ''

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'luca-run-ended-'))
})

afterEach(async () => {
    await rm(root, { recursive: true, force: true })
})

/** A journal in its own run folder, holding these entries. */
const journalWith = ({
    run_id,
    entries,
}: {
    run_id: string
    entries: JournalEntry[]
}): Journal => {
    const journal = createJournal({
        file: runJournalPath({ runs_dir: root, run_id }),
    })
    for (const entry of entries) journal.append(entry)
    return journal
}

/** Spec #10 with ticket #11, in memory. */
const tracker = () =>
    createInMemoryTracker({
        issues: [specIssue({ number: 10 }), ticketIssue({ number: 11 })],
        sub_tickets: { 10: [11] },
    })

const endings = (records: JournalRecord[]): JournalRecord[] =>
    records.filter(({ kind }) => kind === 'run_ended')

/** A run on #11 whose intake passed and whose run branch is installed. */
const building = (entries: JournalEntry[]): JournalEntry[] => [
    ...intakePassed({ tickets: [practiceTicket({ number: 11 })] }),
    ...withInstalls({ entries: [runBranchCreated(), ...entries] }),
]

/** Runs the engine on a journal to its end; its one `run_ended`. */
const endOf = async (journal: Journal): Promise<JournalRecord[]> => {
    const action = await runEngine({ journal, tracker: tracker() })
    expect(action).toMatchObject({ type: 'done' })
    return endings(journal.read())
}

describe('run_ended', () => {
    test('a run whose PR opened before a crash ends with one run_ended, however often the ending is redone', async () => {
        const journal = journalWith({
            run_id: 'pr',
            entries: building([
                pullRequestOpened(),
                worktreesRemoved({ paths: [RUN_BRANCH_PATH] }),
            ]),
        })

        await endOf(journal)
        const ended = await endOf(journal)

        expect(ended).toHaveLength(1)
        expect(ended[0]).toMatchObject({
            ticket: null,
            content: {
                outcome: 'pull_request',
                url: 'https://github.com/acme/app/pull/99',
                detail: expect.stringMatching(/\S/),
            },
        })
        const kinds = journal.read().map(({ kind }) => kind)
        expect(kinds.indexOf('run_ended')).toBeGreaterThan(
            kinds.indexOf('pull_request_opened')
        )
    })

    test('an intake refusal and a run with nothing to do each end once, as refused and nothing_to_do', async () => {
        const refusing = createInMemoryTracker({
            issues: [
                specIssue({ number: 10 }),
                ticketIssue({ number: 11, criteria: [] }),
            ],
            sub_tickets: { 10: [11] },
        })
        const closed = createInMemoryTracker({
            issues: [
                specIssue({ number: 10 }),
                ticketIssue({ number: 11, state: 'closed' }),
            ],
            sub_tickets: { 10: [11] },
        })
        for (const [run_id, given, outcome] of [
            ['refused', refusing, 'refused'],
            ['nothing', closed, 'nothing_to_do'],
        ] as const) {
            const journal = journalWith({ run_id, entries: [] })
            startRun({ journal, spec_number: 10, config: CONFIG })
            await runEngine({ journal, tracker: given })
            await runEngine({ journal, tracker: given })
            expect(endings(journal.read())).toEqual([
                expect.objectContaining({
                    content: expect.objectContaining({ outcome, url: null }),
                }),
            ])
        }
    })

    test("an owner's stop ends the run as stopped, and every ticket skipped as completed", async () => {
        const stopped = journalWith({
            run_id: 'stopped',
            entries: building([
                commentRead({ comment_id: 120, body: 'stop' }),
                replyReceived({ word: 'stop', ticket: null, comment_id: 120 }),
            ]),
        })
        expect(await endOf(stopped)).toEqual([
            expect.objectContaining({
                content: expect.objectContaining({
                    outcome: 'stopped',
                    url: null,
                }),
            }),
        ])

        const skipped = journalWith({
            run_id: 'skipped',
            entries: building([
                ...gatesFailedForGood(),
                stuckReported({ ticket: 11 }),
                replyReceived({ word: 'skip', ticket: 11, comment_id: 120 }),
                ticketSkipped({ ticket: 11 }),
                worktreesRemoved({ paths: [ticketPath(11), RUN_BRANCH_PATH] }),
            ]),
        })
        expect(await endOf(skipped)).toEqual([
            expect.objectContaining({
                content: expect.objectContaining({
                    outcome: 'completed',
                    url: null,
                }),
            }),
        ])
    })

    test('a billing stop and a stop for crashes each end once, as failed', async () => {
        const billing = journalWith({
            run_id: 'billing',
            entries: building([billingStopped({ reason: 'overage in use' })]),
        })
        const crashed = journalWith({
            run_id: 'crashed',
            entries: building([
                {
                    kind: 'run_stopped',
                    ticket: null,
                    role: null,
                    content: {
                        reason: 'it crashed',
                        role: null,
                        billing: false,
                        crashed: true,
                    },
                },
            ]),
        })
        for (const journal of [billing, crashed]) {
            await endOf(journal)
            expect(await endOf(journal)).toEqual([
                expect.objectContaining({
                    content: expect.objectContaining({
                        outcome: 'failed',
                        url: null,
                    }),
                }),
            ])
        }
    })

    test('a step a crash cut off is no ending: only the run that finishes it ends once', async () => {
        const journal = journalWith({ run_id: 'cut', entries: [] })
        startRun({ journal, spec_number: 10, config: CONFIG })
        const refusing = createInMemoryTracker({
            issues: [
                specIssue({ number: 10 }),
                ticketIssue({ number: 11, criteria: [] }),
            ],
            sub_tickets: { 10: [11] },
        })
        const dying: Journal = {
            ...journal,
            append: (entry) => {
                if (entry.kind === 'intake_refused') {
                    throw new Error('The engine crashed.')
                }
                return journal.append(entry)
            },
        }

        await expect(
            runEngine({ journal: dying, tracker: refusing })
        ).rejects.toThrow('The engine crashed.')
        expect(endings(journal.read())).toEqual([])

        await runEngine({ journal, tracker: refusing })
        expect(endings(journal.read())).toHaveLength(1)
    })
})
