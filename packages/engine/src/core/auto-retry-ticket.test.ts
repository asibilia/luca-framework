import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import {
    openStuck,
    readRecords,
} from '../../skills/luca-unstick/scripts/stuck-summary'
import type { JournalEntry } from '../journal/journal-record'
import { replayRun } from '../journal/replay'
import {
    AUTO_CONFIG,
    TICKET_RETRY_TEXT,
    appendAll,
    autoRetried,
    implementerFailed,
    intakeRead,
    journalIn,
    ofKind,
    productTestsCommitted,
    productTracker,
    runOn,
} from '../testing/auto-retry-fixtures'
import {
    commentRead,
    replyReceived,
    ticketRetried,
    ticketStuck,
} from '../testing/build-fixtures'

/**
 * The engine retries a routine stuck ticket once by itself (#705), at the
 * engine's seam: intake read from the in-memory tracker, the ticket's steps
 * journaled, then the engine run on from there.
 */

let runsDir = ''

beforeEach(async () => {
    runsDir = await mkdtemp(join(tmpdir(), 'luca-auto-retry-'))
})

afterEach(async () => {
    await rm(runsDir, { recursive: true, force: true })
})

/** A run on #12 with intake read, then `entries`, run on by the engine. */
const stuckRun = async ({
    entries,
    config,
}: {
    entries: JournalEntry[]
    config?: typeof AUTO_CONFIG
}) => {
    const journal = journalIn({ runs_dir: runsDir })
    const tracker = productTracker()
    await intakeRead({ journal, tracker, config })
    appendAll({ journal, entries })
    const action = await runOn({ journal, tracker, runs_dir: runsDir })
    return { journal, tracker, action }
}

/** Runs the engine on the same run again, after more entries. */
const goOn = async ({
    run,
    entries,
}: {
    run: Awaited<ReturnType<typeof stuckRun>>
    entries: JournalEntry[]
}) => {
    for (const entry of entries) run.journal.append(entry)
    return runOn({
        journal: run.journal,
        tracker: run.tracker,
        runs_dir: runsDir,
    })
}

/** The owner's `retry #12`, taken, and #12 resumed. */
const ownerRetry = (comment_id: number): JournalEntry[] => [
    commentRead({ comment_id, body: 'retry #12' }),
    replyReceived({ word: 'retry', ticket: 12, comment_id }),
    ticketRetried({ ticket: 12, mode: 'resume' }),
]

const ROUTINE = implementerFailed(['agent', 'result', 'agent'])

describe('a routine stuck ticket', () => {
    test('#12 stuck as agent_failed with agent and result tries gets an auto_retried record, not a stuck report', async () => {
        const { journal } = await stuckRun({
            entries: [...productTestsCommitted(), ...ROUTINE],
        })

        const records = journal.read()
        expect(ofKind(records, 'auto_retried')).toMatchObject([
            {
                ticket: 12,
                content: { item: 'ticket', reason: 'agent_failed' },
            },
        ])
        expect(ofKind(records, 'stuck_reported')).toEqual([])
    })

    test("#12's automatic retry comment on the spec is exactly the ticket sentence", async () => {
        const { journal, tracker } = await stuckRun({
            entries: [...productTestsCommitted(), ...ROUTINE],
        })

        const [comment, ...others] = tracker.commentsOn({ number: 10 })
        expect(others).toEqual([])
        expect(comment).toStartWith(`${TICKET_RETRY_TEXT}\n\n<!-- luca:`)
        expect(ofKind(journal.read(), 'auto_retried')[0]?.content.body).toBe(
            TICKET_RETRY_TEXT
        )
    })

    test('after the automatic retry and its ticket_retried, #12 waits for no reply and /luca-unstick lists nothing open', async () => {
        const { journal, action } = await stuckRun({
            entries: [...productTestsCommitted(), ...ROUTINE],
        })

        const records = journal.read()
        expect(ofKind(records, 'ticket_retried')).toMatchObject([
            { ticket: 12, content: { mode: 'resume' } },
        ])
        expect(action).toMatchObject({ type: 'launch_agent', ticket: 12 })
        const state = replayRun({ records })
        expect(state.tickets[12]?.stuck ?? null).toBeNull()
        expect(state.tickets[12]?.stuck_report ?? null).toBeNull()
        expect(
            openStuck({ records: readRecords({ file: journal.file }) })
        ).toEqual([])
    })

    test('after one auto_retried, the next routine stuck of #12 is reported and waits', async () => {
        const { journal, action } = await stuckRun({
            entries: [
                ...productTestsCommitted(),
                ...ROUTINE,
                autoRetried({
                    item: 'ticket',
                    ticket: 12,
                    reason: 'agent_failed',
                    comment_id: 900,
                    body: TICKET_RETRY_TEXT,
                }),
                ticketRetried({ ticket: 12, mode: 'resume' }),
                ...ROUTINE,
            ],
        })

        expect(action.type).toBe('wait_for_reply')
        expect(ofKind(journal.read(), 'auto_retried')).toHaveLength(1)
        expect(ofKind(journal.read(), 'stuck_reported')).toHaveLength(1)
    })

    test('a first bad_test stuck waits for a reply, and after the owner retries, a later agent_failed uses the automatic retry', async () => {
        const run = await stuckRun({
            entries: [
                ...productTestsCommitted(),
                ticketStuck({ ticket: 12, reason: 'bad_test' }),
            ],
        })
        expect(run.action.type).toBe('wait_for_reply')
        expect(ofKind(run.journal.read(), 'stuck_reported')).toHaveLength(1)
        expect(ofKind(run.journal.read(), 'auto_retried')).toEqual([])

        await goOn({ run, entries: [...ownerRetry(500), ...ROUTINE] })

        expect(ofKind(run.journal.read(), 'auto_retried')).toMatchObject([
            { ticket: 12, content: { reason: 'agent_failed' } },
        ])
        expect(ofKind(run.journal.read(), 'stuck_reported')).toHaveLength(1)
    })
})

describe('which failed tries make agent_failed routine', () => {
    test('a guard try in the current cycle waits for a reply, but a guard before an owner retry does not block a later automatic retry', async () => {
        const run = await stuckRun({
            entries: [
                ...productTestsCommitted(),
                ...implementerFailed(['agent', 'guard', 'agent']),
            ],
        })
        expect(run.action.type).toBe('wait_for_reply')
        expect(ofKind(run.journal.read(), 'auto_retried')).toEqual([])

        await goOn({ run, entries: [...ownerRetry(500), ...ROUTINE] })

        expect(ofKind(run.journal.read(), 'auto_retried')).toHaveLength(1)
        expect(ofKind(run.journal.read(), 'stuck_reported')).toHaveLength(1)
    })

    test('an engine failure among the tries is not a failed try: the stuck is still routine', async () => {
        const { journal } = await stuckRun({
            entries: [
                ...productTestsCommitted(),
                ...implementerFailed(['agent', 'engine', 'result', 'agent']),
            ],
        })

        expect(ofKind(journal.read(), 'auto_retried')).toHaveLength(1)
        expect(ofKind(journal.read(), 'stuck_reported')).toEqual([])
    })

    test('prepare_failed is retried only when the prepare output starts with Timed out, not when Timed out is only in the detail', async () => {
        const prepareFailed = (output: string): JournalEntry[] => [
            ...productTestsCommitted().slice(0, 2),
            {
                kind: 'baseline_prepared',
                ticket: 12,
                role: null,
                content: {
                    check: {
                        name: 'prepare',
                        command: 'make rom',
                        ok: false,
                        exit_code: output.startsWith('Timed out') ? null : 2,
                        output,
                    },
                },
            },
            ticketStuck({
                ticket: 12,
                reason: 'prepare_failed',
                detail: `\`make rom\` failed.\n${output}`,
            }),
        ]
        const config = { ...AUTO_CONFIG, prepare: 'make rom' }

        const timedOut = await stuckRun({
            config,
            entries: prepareFailed('Timed out after 1800 seconds'),
        })
        expect(ofKind(timedOut.journal.read(), 'auto_retried')).toMatchObject([
            { ticket: 12, content: { reason: 'prepare_failed' } },
        ])

        await rm(join(runsDir, 'run'), { recursive: true, force: true })
        const broken = await stuckRun({
            config,
            entries: prepareFailed(
                'Build failed: gmake missing\nTimed out waiting for the lock'
            ),
        })
        expect(broken.action.type).toBe('wait_for_reply')
        expect(ofKind(broken.journal.read(), 'auto_retried')).toEqual([])
    })
})
