import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { runEngine, startRun } from './execute'

import type { EngineConfig } from '../config/engine-config'
import { createJournal, runJournalPath } from '../journal/journal'
import type { JournalRecord } from '../journal/journal-record'
import { specIssue, ticketIssue } from '../testing/intake-fixtures'
import {
    createInMemoryTracker,
    type InMemoryTracker,
} from '../tracker/in-memory-tracker'

/**
 * Crash recovery (#369) for intake refusals. These need only the in-memory
 * tracker, so they run with the fast tests (#568). The rest of crash
 * recovery runs a practice repo and lives in `run-crash-recovery.e2e.test.ts`.
 */

let root = ''

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'luca-crash-'))
})

afterEach(async () => {
    await rm(root, { recursive: true, force: true })
})

/**
 * A tracker whose `comment` on issue `number` posts for real, then throws
 * once, as if the engine died before journaling the comment.
 */
const crashAfterComment = ({
    tracker,
    number,
}: {
    tracker: InMemoryTracker
    number: number
}): InMemoryTracker => {
    let crashed = false
    return {
        ...tracker,
        comment: async (args) => {
            const posted = await tracker.comment(args)
            if (!crashed && args.number === number) {
                crashed = true
                throw new Error('The engine crashed.')
            }
            return posted
        },
    }
}

const ofKind = <Kind extends JournalRecord['kind']>(
    records: JournalRecord[],
    kind: Kind
): Extract<JournalRecord, { kind: Kind }>[] =>
    records.filter(
        (record): record is Extract<JournalRecord, { kind: Kind }> =>
            record.kind === kind
    )

describe('crash recovery: intake refusals', () => {
    test('intake refusal comments are posted once when a crash cut the refusal off', async () => {
        const journal = createJournal({
            file: runJournalPath({ runs_dir: root, run_id: 'run-1' }),
        })
        const config: EngineConfig = {
            checks: { test: 'bun test' },
            test_file_patterns: ['**/*.test.ts'],
            test_setup_files: [],
            rule_files: [],
        }
        const tracker = createInMemoryTracker({
            issues: [
                specIssue({ number: 10 }),
                ticketIssue({ number: 12, criteria: [] }),
                ticketIssue({ number: 13, labels: ['enhancement'] }),
            ],
            sub_tickets: { 10: [12, 13] },
        })
        startRun({ journal, spec_number: 10, config })

        await expect(
            runEngine({
                journal,
                tracker: crashAfterComment({ tracker, number: 13 }),
            })
        ).rejects.toThrow('The engine crashed.')
        const action = await runEngine({ journal, tracker })

        expect(action).toEqual({ type: 'done', outcome: 'refused' })
        for (const number of [12, 13]) {
            const comments = tracker.commentsOn({ number })
            expect(comments).toHaveLength(1)
            expect(comments[0]).toStartWith('Luca intake refused the run')
            expect(tracker.labelsOf({ number })).toContain('needs-info')
        }
        expect(ofKind(journal.read(), 'intake_refused')).toHaveLength(1)
    })

    test('a refusal redone after a crash past its comments and labels posts nothing twice (#500)', async () => {
        const journal = createJournal({
            file: runJournalPath({ runs_dir: root, run_id: 'run-1' }),
        })
        const config: EngineConfig = {
            checks: { test: 'bun test' },
            test_file_patterns: ['**/*.test.ts'],
            test_setup_files: [],
            rule_files: [],
        }
        const tracker = createInMemoryTracker({
            issues: [
                specIssue({ number: 10 }),
                ticketIssue({ number: 12, criteria: [] }),
                ticketIssue({ number: 13, labels: ['enhancement'] }),
            ],
            sub_tickets: { 10: [12, 13] },
        })
        startRun({ journal, spec_number: 10, config })
        // The engine dies as it journals the refusal, as the first try of
        // run luca-20260929-011317-wq72 died in refuse_intake.
        const dying: typeof journal = {
            ...journal,
            append: (entry) => {
                if (entry.kind === 'intake_refused') {
                    throw new Error('The engine crashed.')
                }
                return journal.append(entry)
            },
        }

        await expect(runEngine({ journal: dying, tracker })).rejects.toThrow(
            'The engine crashed.'
        )
        const action = await runEngine({ journal, tracker })

        expect(action).toEqual({ type: 'done', outcome: 'refused' })
        for (const number of [12, 13]) {
            expect(tracker.commentsOn({ number })).toHaveLength(1)
            expect(tracker.labelsOf({ number })).toContain('needs-info')
        }
        expect(ofKind(journal.read(), 'intake_refused')).toHaveLength(1)
    })
})
