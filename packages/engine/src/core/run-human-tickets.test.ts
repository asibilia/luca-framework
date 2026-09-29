import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { runEngine, startRun } from './execute'
import { nothingToDoText } from './left-out'
import { openTicketsNotInRun } from './not-in-run'

import type { EngineConfig } from '../config/engine-config'
import { createJournal, runJournalPath, type Journal } from '../journal/journal'
import { replayRun } from '../journal/replay'
import {
    specIssue,
    ticketIssue,
    withoutStepRecords,
} from '../testing/intake-fixtures'
import { createInMemoryTracker } from '../tracker/in-memory-tracker'
import type { TrackerIssue } from '../tracker/tracker'

/**
 * A run on a spec with tickets for a person (#499): they are left out of
 * the run, not refused. Nobody comments on them or relabels them, and the
 * journal says what was left out and why.
 */

const CONFIG: EngineConfig = {
    checks: { test: 'bun test' },
    test_file_patterns: ['**/*.test.ts'],
    test_setup_files: [],
    rule_files: [],
}

let runsDir = ''
let journal: Journal

beforeEach(async () => {
    runsDir = await mkdtemp(join(tmpdir(), 'luca-human-tickets-'))
    journal = createJournal({
        file: runJournalPath({ runs_dir: runsDir, run_id: 'run' }),
    })
})

afterEach(async () => {
    await rm(runsDir, { recursive: true, force: true })
})

const runIntake = async ({ issues }: { issues: TrackerIssue[] }) => {
    const tracker = createInMemoryTracker({
        issues,
        sub_tickets: {
            10: issues
                .map(({ number }) => number)
                .filter((number) => number !== 10),
        },
    })
    startRun({ journal, spec_number: 10, config: CONFIG })
    const action = await runEngine({
        journal,
        tracker,
        stop_before: ['create_run_branch'],
    })
    return { tracker, action, records: withoutStepRecords(journal.read()) }
}

const human = (options: Parameters<typeof ticketIssue>[0]) =>
    ticketIssue({ labels: ['ready-for-human'], ...options })

describe('a run with tickets for a person', () => {
    test('passes intake, leaves them untouched, and journals what was left out', async () => {
        const { tracker, action, records } = await runIntake({
            issues: [
                specIssue({ number: 10 }),
                ticketIssue({ number: 11 }),
                human({ number: 12, title: 'Make the store page' }),
                ticketIssue({ number: 13, blocked_by: [12] }),
            ],
        })

        expect(action).toEqual({
            type: 'create_run_branch',
            spec_number: 10,
            base_branch: 'main',
        })
        for (const number of [10, 11, 12, 13]) {
            expect(tracker.commentsOn({ number })).toEqual([])
        }
        expect(tracker.labelsOf({ number: 12 })).toEqual(['ready-for-human'])
        expect(tracker.labelsOf({ number: 13 })).toEqual(['ready-for-agent'])

        const spec = records.find(({ kind }) => kind === 'spec_snapshot')
        expect(spec?.content).toMatchObject({
            ticket_order: [11],
            left_out: [
                { number: 12, reason: 'for_a_person' },
                { number: 13, reason: 'waits_on_person', waits_on: [12] },
            ],
        })
        expect(
            records.filter(({ kind }) => kind === 'ticket_snapshot')
        ).toHaveLength(1)
    })

    test('the "Not in this run" list does not name them again', async () => {
        const { tracker } = await runIntake({
            issues: [
                specIssue({ number: 10 }),
                ticketIssue({ number: 11 }),
                human({ number: 12, title: 'Make the store page' }),
                ticketIssue({ number: 13, blocked_by: [12] }),
                ticketIssue({ number: 14, title: 'Menu', state: 'closed' }),
            ],
        })
        const state = replayRun({ records: journal.read() })
        // Reopened while the run went: it is the only one "Not in this run" names.
        tracker.updateIssue({ number: 14, changes: { state: 'open' } })

        expect(await openTicketsNotInRun({ tracker, state })).toEqual([
            { number: 14, title: 'Menu' },
        ])
    })

    test('with nothing left to build, the run ends with nothing to do, saying why', async () => {
        const { tracker, action, records } = await runIntake({
            issues: [
                specIssue({ number: 10 }),
                ticketIssue({ number: 11, state: 'closed' }),
                human({ number: 12, title: 'Make the store page' }),
                ticketIssue({ number: 13, blocked_by: [12] }),
            ],
        })

        expect(action).toEqual({ type: 'done', outcome: 'nothing_to_do' })
        expect(tracker.commentsOn({ number: 12 })).toEqual([])
        const end = records.find(({ kind }) => kind === 'nothing_to_do')
        if (end?.kind !== 'nothing_to_do') throw new Error('no nothing_to_do')
        expect(end.content.left_out.map(({ number }) => number)).toEqual([
            12, 13,
        ])
        expect(nothingToDoText({ content: end.content })).toBe(
            'Nothing to do: #12 is for a person, and #13 waits on a ticket for a person.'
        )
    })
})

describe('what a run with nothing to do says', () => {
    test('every ticket closed', () => {
        expect(
            nothingToDoText({
                content: {
                    closed_tickets: [11],
                    already_done: [],
                    left_out: [],
                },
            })
        ).toBe('Nothing to do: every ticket of the spec is closed.')
    })

    test('every ticket already done', () => {
        expect(
            nothingToDoText({
                content: {
                    closed_tickets: [],
                    already_done: [11, 12],
                    left_out: [],
                },
            })
        ).toBe(
            'Nothing to do: the work of #11, #12 was already on the base branch.'
        )
    })
})
