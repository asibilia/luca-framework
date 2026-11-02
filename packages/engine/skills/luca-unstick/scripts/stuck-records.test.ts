import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { readRecords, runState } from './stuck-records'
import { formatSummary, repoRuns } from './stuck-summary'

import { autoRetryText } from '../../../src/core/auto-retry'
import { runEnding } from '../../../src/core/run-ended'
import type { JournalEntry } from '../../../src/journal/journal-record'
import { autoRetried } from '../../../src/testing/auto-retry-fixtures'
import {
    agentFailed,
    alreadyDoneChecked,
    commentRead,
    intakePassed,
    practiceTicket,
    replyReceived,
    runBranchCreated,
    stuckReported,
    ticketRetried,
    ticketSkipped,
    ticketStuck,
    ticketWorktreeCreated,
} from '../../../src/testing/build-fixtures'
import { recordsFrom } from '../../../src/testing/intake-fixtures'
import { runStuck } from '../../../src/testing/run-budget-fixtures'

/**
 * `/luca-unstick`'s journal reading for `/luca-watch` (#706): the summary
 * the watcher picks its run from must see `run_ended`, and must show a
 * stuck item's retry history, which the watcher's two-retry budget, its
 * first-`run_budget` rule and its `guard` rule read.
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

const TICKETS = [
    practiceTicket({ number: 11, title: 'Add sum' }),
    practiceTicket({ number: 12, title: 'Add product' }),
]

/** The summary's line that starts with `start`, trimmed. */
const lineOf = (summary: string, start: string): string =>
    summary
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line.startsWith(start)) ?? ''

/** The engine's own retry of `ticket` after a routine stuck on `reason`. */
const engineRetried = (ticket: number, reason: string): JournalEntry[] => [
    autoRetried({
        item: 'ticket',
        ticket,
        reason,
        comment_id: 300 + ticket,
        body: autoRetryText({ item: 'ticket', ticket, reason }),
    }),
    ticketRetried({ ticket, mode: 'resume' }),
]

/** A failed try of ticket #12's implementer. */
const implementerFailed = (
    failure: 'agent' | 'result' | 'guard' | 'engine'
): JournalEntry => agentFailed({ ticket: 12, role: 'implementer', failure })

/**
 * Ticket #12's test-writer gave `already_done` evidence that didn't check
 * out, then its implementer failed a try, then a try its guard caught.
 */
const stuckOnGuard = (): JournalEntry[] => [
    ...intakePassed({ tickets: TICKETS }),
    runBranchCreated(),
    ticketWorktreeCreated({ ticket: 12 }),
    alreadyDoneChecked({ ticket: 12, problems: ['No commit does it.'] }),
    implementerFailed('agent'),
    implementerFailed('guard'),
    ticketStuck({ ticket: 12, reason: 'agent_failed' }),
    stuckReported({ ticket: 12 }),
]

/** The run stuck on `reason`, reported in comment `comment_id`. */
const runStuckOn = (
    reason: 'run_budget' | 'repo_busy',
    comment_id: number
): JournalEntry[] => [
    reason === 'run_budget'
        ? runStuck()
        : {
              kind: 'run_stuck',
              ticket: null,
              role: null,
              content: { reason, detail: 'Another run uses the repo.' },
          },
    {
        kind: 'stuck_reported',
        ticket: null,
        role: null,
        content: { comment_id, body: 'stuck' },
    },
]

/** The owner's bare `retry` for the run, in comment `comment_id`. */
const ownerRetriedRun = (comment_id: number): JournalEntry[] => [
    commentRead({ comment_id, body: 'retry' }),
    replyReceived({ word: 'retry', ticket: null, comment_id }),
]

describe("a stuck item's retry history, for /luca-watch", () => {
    test("a ticket stuck again counts the engine's own retry from before its current stuck, and no other ticket's", async () => {
        const records = await writeRun({
            entries: [
                ...intakePassed({ tickets: TICKETS }),
                runBranchCreated(),
                ticketWorktreeCreated({ ticket: 11 }),
                ticketStuck({ ticket: 11, reason: 'join_failed' }),
                ...engineRetried(11, 'join_failed'),
                ticketWorktreeCreated({ ticket: 12 }),
                implementerFailed('agent'),
                ticketStuck({ ticket: 12, reason: 'agent_failed' }),
                ...engineRetried(12, 'agent_failed'),
                implementerFailed('agent'),
                ticketStuck({ ticket: 12, reason: 'agent_failed' }),
                stuckReported({ ticket: 12 }),
            ],
        })
        const summary = formatSummary({ run_id: 'run-1', records })
        expect(summary).toContain('Ticket #12 "Add product": agent_failed')
        expect(
            lineOf(summary, 'Retried by the engine itself (auto_retried)')
        ).toBe('Retried by the engine itself (auto_retried): 1')
    })

    test('the run counts the run_budget stucks before its current one, an answered one too, and no other reason', async () => {
        const first = [
            ...intakePassed({ tickets: TICKETS }),
            ...runStuckOn('repo_busy', 150),
            ...ownerRetriedRun(200),
            runBranchCreated(),
            ...runStuckOn('run_budget', 151),
        ]
        expect(
            lineOf(
                formatSummary({
                    run_id: 'run-1',
                    records: await writeRun({ entries: first }),
                }),
                'Earlier run_budget stucks in this run'
            )
        ).toBe('Earlier run_budget stucks in this run: 0')

        const records = await writeRun({
            entries: [
                ...first,
                ...ownerRetriedRun(201),
                ...runStuckOn('run_budget', 152),
            ],
        })
        expect(
            lineOf(
                formatSummary({ run_id: 'run-1', records }),
                'Earlier run_budget stucks in this run'
            )
        ).toBe('Earlier run_budget stucks in this run: 1')
    })

    test('a stuck ticket shows a guard or evidence failed try since its last retry, even after a refused retry', async () => {
        const records = await writeRun({
            entries: [
                ...stuckOnGuard(),
                ticketRetried({ ticket: 12, mode: 'refused' }),
            ],
        })
        expect(
            lineOf(
                formatSummary({ run_id: 'run-1', records }),
                'Failed tries since its last retry'
            )
        ).toBe(
            'Failed tries since its last retry: test-writer evidence; implementer agent, guard'
        )
    })

    test('a successful retry starts its failed tries over, and an engine failure is no try', async () => {
        const records = await writeRun({
            entries: [
                ...stuckOnGuard(),
                commentRead({ comment_id: 202, body: 'retry #12' }),
                replyReceived({ word: 'retry', ticket: 12, comment_id: 202 }),
                ticketRetried({ ticket: 12, mode: 'resume' }),
                implementerFailed('engine'),
                implementerFailed('result'),
                ticketStuck({ ticket: 12, reason: 'agent_failed' }),
                stuckReported({ ticket: 12, comment_id: 113 }),
            ],
        })
        expect(
            lineOf(
                formatSummary({ run_id: 'run-1', records }),
                'Failed tries since its last retry'
            )
        ).toBe('Failed tries since its last retry: implementer result')
    })
})
