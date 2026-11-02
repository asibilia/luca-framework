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
    FINAL_RETRY_TEXT,
    RUN_RETRY_TEXT,
    TICKET_RETRY_TEXT,
    appendAll,
    implementerFailed,
    intakeRead,
    intakeWith,
    journalIn,
    ofKind,
    productTestsCommitted,
    productTracker,
    runOn,
} from '../testing/auto-retry-fixtures'
import {
    agentFailed,
    agentStarted,
    practiceTicket,
    ticketPath,
    worktreesRemoved,
} from '../testing/build-fixtures'
import {
    finalReviewPassed,
    finalReviewStarted,
    finalReviewStuck,
    lensRound,
} from '../testing/final-review-fixtures'
import { built } from '../testing/final-review-steps'
import { specIssue, ticketIssue } from '../testing/intake-fixtures'
import { createGhCalls } from '../tracker/gh-retry'
import {
    createInMemoryTracker,
    type InMemoryTracker,
} from '../tracker/in-memory-tracker'

/**
 * The engine's own retry (#705) of the final review and the run, its
 * config switch, a refused ticket retry, and a crash between its comment
 * and its record, at the engine's seam.
 */

let runsDir = ''

beforeEach(async () => {
    runsDir = await mkdtemp(join(tmpdir(), 'luca-auto-retry-items-'))
})

afterEach(async () => {
    await rm(runsDir, { recursive: true, force: true })
})

const sumTracker = (): InMemoryTracker =>
    createInMemoryTracker({
        issues: [specIssue({ number: 10 }), ticketIssue({ number: 11 })],
        sub_tickets: { 10: [11] },
    })

/** A run journaled from fixtures alone (intake included), run on by the engine. */
const fixtureRun = async ({
    entries,
    tracker,
}: {
    entries: JournalEntry[]
    tracker: InMemoryTracker
}) => {
    const journal = journalIn({ runs_dir: runsDir })
    appendAll({ journal, entries })
    const action = await runOn({ journal, tracker, runs_dir: runsDir })
    return { journal, action }
}

/** A run on #12 with intake read on `config`, then `entries`. */
const productRun = async ({
    entries,
    config,
    tracker = productTracker(),
}: {
    entries: JournalEntry[]
    config?: typeof AUTO_CONFIG
    tracker?: InMemoryTracker
}) => {
    const journal = journalIn({ runs_dir: runsDir })
    await intakeRead({ journal, tracker, config })
    appendAll({ journal, entries })
    const action = await runOn({ journal, tracker, runs_dir: runsDir })
    return { journal, tracker, action }
}

const ROUTINE = implementerFailed(['agent', 'result', 'agent'])

const SUM = [practiceTicket({ number: 11 })]

describe('the final review and the run', () => {
    test('a final review stuck as agent_failed gets an auto_retried for the final review, and final_review_retried settles it', async () => {
        const lensFailed = (): JournalEntry[] => [
            agentStarted({ ticket: null, role: 'security-lens' }),
            agentFailed({
                ticket: null,
                role: 'security-lens',
                failure: 'agent',
            }),
        ]
        const tracker = sumTracker()
        const { journal } = await fixtureRun({
            tracker,
            entries: [
                ...intakeWith({ tickets: SUM }),
                ...built(),
                finalReviewStarted({ round: 1 }),
                ...lensFailed(),
                ...lensFailed(),
                ...lensFailed(),
                finalReviewStuck({ reason: 'agent_failed' }),
                worktreesRemoved({ paths: [ticketPath(11)] }),
            ],
        })

        const records = journal.read()
        expect(ofKind(records, 'auto_retried')).toMatchObject([
            {
                ticket: null,
                content: {
                    item: 'final_review',
                    reason: 'agent_failed',
                    body: FINAL_RETRY_TEXT,
                },
            },
        ])
        expect(tracker.commentsOn({ number: 10 })[0]).toStartWith(
            `${FINAL_RETRY_TEXT}\n\n<!-- luca:`
        )
        const retried = ofKind(records, 'final_review_retried')
        expect(retried).toHaveLength(1)
        expect(retried[0]?.seq ?? 0).toBeGreaterThan(
            ofKind(records, 'auto_retried')[0]?.seq ?? Infinity
        )
        expect(ofKind(records, 'stuck_reported')).toEqual([])
    })

    test('a run stuck on pull_request_failed gets an auto_retried for the run, opens its PR on the second try, and replay adds no top-up', async () => {
        const base = sumTracker()
        const failing = createGhCalls({
            run: async () => ({
                exit_code: 1,
                stdout: '',
                stderr: 'HTTP 422: Validation Failed\n',
            }),
            sleep: async () => undefined,
            log: () => undefined,
        })
        let failed = false
        const tracker: InMemoryTracker = {
            ...base,
            findOpenPullRequest: async (args) => {
                if (failed) return base.findOpenPullRequest(args)
                failed = true
                await failing.ok({ args: ['pr', 'list', '--head', args.head] })
                return base.findOpenPullRequest(args)
            },
        }
        const { journal } = await fixtureRun({
            tracker,
            entries: [
                ...intakeWith({ tickets: SUM }),
                ...built(),
                ...lensRound({ round: 1 }),
                finalReviewPassed(),
            ],
        })

        const records = journal.read()
        expect(ofKind(records, 'run_stuck')).toMatchObject([
            { content: { reason: 'pull_request_failed' } },
        ])
        expect(ofKind(records, 'auto_retried')).toMatchObject([
            {
                ticket: null,
                content: {
                    item: 'run',
                    reason: 'pull_request_failed',
                    body: RUN_RETRY_TEXT,
                },
            },
        ])
        expect(tracker.commentsOn({ number: 10 })[0]).toStartWith(
            `${RUN_RETRY_TEXT}\n\n<!-- luca:`
        )
        expect(ofKind(records, 'pull_request_opened')).toHaveLength(1)
        expect(ofKind(records, 'stuck_reported')).toEqual([])
        expect(replayRun({ records }).run_budget).toEqual({
            stuck: null,
            report: null,
            top_ups: 0,
        })
        expect(
            openStuck({ records: readRecords({ file: journal.file }) })
        ).toEqual([])
    })
})

describe('the auto_retry setting', () => {
    test('with auto_retry false, a newly stuck routine ticket is reported and not retried', async () => {
        const { journal, action } = await productRun({
            config: { ...AUTO_CONFIG, auto_retry: false },
            entries: [...productTestsCommitted(), ...ROUTINE],
        })

        expect(replayRun({ records: journal.read() }).config?.auto_retry).toBe(
            false
        )
        expect(action.type).toBe('wait_for_reply')
        expect(ofKind(journal.read(), 'stuck_reported')).toHaveLength(1)
        expect(ofKind(journal.read(), 'auto_retried')).toEqual([])
    })

    test('turning auto_retry on at a resume leaves an already reported ticket waiting; turning it off stops a later retry', async () => {
        const reloaded = (from: boolean, to: boolean): JournalEntry[] => [
            {
                kind: 'engine_resumed',
                ticket: null,
                role: null,
                content: { luca_version: '14.0.0-alpha.30' },
            },
            {
                kind: 'config_reloaded',
                ticket: null,
                role: null,
                content: { changes: [{ field: 'auto_retry', from, to }] },
            },
        ]
        const told = await productRun({
            config: { ...AUTO_CONFIG, auto_retry: false },
            entries: [...productTestsCommitted(), ...ROUTINE],
        })
        for (const entry of reloaded(false, true)) told.journal.append(entry)
        const after = await runOn({
            journal: told.journal,
            tracker: told.tracker,
            runs_dir: runsDir,
        })
        expect(after.type).toBe('wait_for_reply')
        expect(ofKind(told.journal.read(), 'auto_retried')).toEqual([])
        expect(ofKind(told.journal.read(), 'stuck_reported')).toHaveLength(1)

        await rm(join(runsDir, 'run'), { recursive: true, force: true })
        const off = await productRun({
            entries: [
                ...reloaded(true, false),
                ...productTestsCommitted(),
                ...ROUTINE,
            ],
        })
        expect(off.action.type).toBe('wait_for_reply')
        expect(ofKind(off.journal.read(), 'auto_retried')).toEqual([])
        expect(ofKind(off.journal.read(), 'stuck_reported')).toHaveLength(1)
    })
})

describe('a refused automatic retry, and a crash after its comment', () => {
    test('a refused automatic retry posts the refusal once, then reports the original stuck with the standard comment, and never retries by itself again', async () => {
        const tracker = productTracker()
        const journal = journalIn({ runs_dir: runsDir })
        await intakeRead({ journal, tracker })
        tracker.updateIssue({
            number: 12,
            changes: { body: '## What to build\n\nA product, somehow.' },
        })
        appendAll({
            journal,
            entries: [...productTestsCommitted(), ...ROUTINE],
        })

        const action = await runOn({ journal, tracker, runs_dir: runsDir })

        const records = journal.read()
        expect(action.type).toBe('wait_for_reply')
        expect(ofKind(records, 'auto_retried')).toHaveLength(1)
        expect(ofKind(records, 'ticket_retried')).toMatchObject([
            { ticket: 12, content: { mode: 'refused' } },
        ])
        const comments = tracker.commentsOn({ number: 10 })
        expect(
            comments.filter((body) => body.startsWith("Couldn't retry #12"))
        ).toHaveLength(1)
        const [report] = ofKind(records, 'stuck_reported')
        expect(ofKind(records, 'stuck_reported')).toHaveLength(1)
        expect(report?.ticket).toBe(12)
        expect(report?.content.body).toContain(
            'Ticket #12 is stuck: Add product'
        )
        expect(report?.content.body).toContain('`retry #12`')
        expect(ofKind(records, 'ticket_stuck').at(-1)?.content.reason).toBe(
            'agent_failed'
        )
    })

    test('a crash after the automatic retry comment posts no second comment on redo, and journals one auto_retried with its id', async () => {
        const tracker = productTracker()
        const journal = journalIn({ runs_dir: runsDir })
        await intakeRead({ journal, tracker })
        appendAll({
            journal,
            entries: [...productTestsCommitted(), ...ROUTINE],
        })
        let crashed = false
        const crashing: InMemoryTracker = {
            ...tracker,
            comment: async (args) => {
                const posted = await tracker.comment(args)
                if (!crashed && args.number === 10) {
                    crashed = true
                    throw new Error('The engine crashed.')
                }
                return posted
            },
        }

        await expect(
            runOn({ journal, tracker: crashing, runs_dir: runsDir })
        ).rejects.toThrow('The engine crashed.')
        await runOn({ journal, tracker, runs_dir: runsDir })

        const posted = await tracker.listComments({ number: 10, since_id: 0 })
        expect(posted).toHaveLength(1)
        expect(posted[0]?.body).toStartWith(TICKET_RETRY_TEXT)
        expect(
            ofKind(journal.read(), 'auto_retried').map(
                ({ content }) => content.comment_id
            )
        ).toEqual([posted[0]?.id ?? -1])
    })
})
