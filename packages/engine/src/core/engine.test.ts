import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { runEngine, startRun } from './execute'

import type { EngineConfig } from '../config/engine-config'
import { createJournal, runJournalPath, type Journal } from '../journal/journal'
import { replayRun } from '../journal/replay'
import { specIssue, ticketIssue } from '../testing/intake-fixtures'
import { createInMemoryTracker } from '../tracker/in-memory-tracker'
import type { TrackerIssue } from '../tracker/tracker'

const CONFIG: EngineConfig = {
    checks: { test: 'bun test' },
    test_file_patterns: ['**/*.test.ts'],
    test_setup_files: [],
    rule_files: [],
}

let runsDir = ''
let journal: Journal

beforeEach(async () => {
    runsDir = await mkdtemp(join(tmpdir(), 'luca-engine-run-'))
    journal = createJournal({
        file: runJournalPath({ runs_dir: runsDir, run_id: 'run' }),
    })
})

afterEach(async () => {
    await rm(runsDir, { recursive: true, force: true })
})

const runSpec = async ({
    issues,
    sub_tickets,
    config,
}: {
    issues: TrackerIssue[]
    sub_tickets: number[]
    config: EngineConfig
}) => {
    const tracker = createInMemoryTracker({
        issues,
        sub_tickets: { 10: sub_tickets },
    })
    startRun({ journal, spec_number: 10, config })
    const action = await runEngine({ journal, tracker })
    return { tracker, action, kinds: journal.read().map((r) => r.kind) }
}

describe('engine: intake refuses the run', () => {
    test('each bad ticket gets a comment and needs-info; good tickets are left alone', async () => {
        const { tracker, action, kinds } = await runSpec({
            config: CONFIG,
            issues: [
                specIssue({ number: 10 }),
                ticketIssue({ number: 11 }),
                ticketIssue({ number: 12, criteria: [] }),
                ticketIssue({ number: 13, labels: ['enhancement'] }),
            ],
            sub_tickets: [11, 12, 13],
        })

        expect(action).toEqual({ type: 'done', outcome: 'refused' })
        expect(kinds).toEqual(['run_started', 'intake_read', 'intake_refused'])

        expect(tracker.commentsOn({ number: 11 })).toEqual([])
        expect(tracker.labelsOf({ number: 11 })).toEqual(['ready-for-agent'])

        expect(tracker.commentsOn({ number: 12 })).toEqual([
            'Luca intake refused the run for spec #10. This issue is not ready yet:\n\n' +
                '- The ticket has no checkbox under "Acceptance criteria".\n\n' +
                'Fix these, move the issue back to `ready-for-agent`, and start the run again.',
        ])
        expect(tracker.labelsOf({ number: 12 })).toEqual(['needs-info'])

        expect(tracker.commentsOn({ number: 13 })).toHaveLength(1)
        expect(tracker.labelsOf({ number: 13 })).toEqual([
            'enhancement',
            'needs-info',
        ])
    })

    test('a spec without Testing Decisions gets the comment and needs-info', async () => {
        const { tracker } = await runSpec({
            config: CONFIG,
            issues: [
                specIssue({ number: 10, testing_decisions: '' }),
                ticketIssue({ number: 11 }),
            ],
            sub_tickets: [11],
        })

        expect(tracker.commentsOn({ number: 10 })).toHaveLength(1)
        expect(tracker.labelsOf({ number: 10 })).toEqual(['needs-info'])
        expect(tracker.commentsOn({ number: 11 })).toEqual([])
    })

    test('a missing test command refuses without touching any ticket', async () => {
        const { tracker, action } = await runSpec({
            config: { ...CONFIG, checks: {} },
            issues: [specIssue({ number: 10 }), ticketIssue({ number: 11 })],
            sub_tickets: [11],
        })
        const records = journal.read()

        expect(action).toEqual({ type: 'done', outcome: 'refused' })
        expect(tracker.commentsOn({ number: 10 })).toEqual([])
        expect(tracker.commentsOn({ number: 11 })).toEqual([])
        expect(replayRun({ records }).problems).toEqual([
            {
                ticket: null,
                missing: [
                    'The engine config (luca.config.json) has no test command at checks.test.',
                ],
            },
        ])
    })

    test('an open blocker outside the spec is read from the tracker and refused', async () => {
        const { tracker, action } = await runSpec({
            config: CONFIG,
            issues: [
                specIssue({ number: 10 }),
                ticketIssue({ number: 11, blocked_by_section: '- #99' }),
                ticketIssue({ number: 99 }),
            ],
            sub_tickets: [11],
        })

        expect(action).toEqual({ type: 'done', outcome: 'refused' })
        expect(tracker.labelsOf({ number: 11 })).toEqual(['needs-info'])
    })
})

describe('engine: nothing to do', () => {
    test('a spec whose tickets are all closed ends with nothing to do', async () => {
        const { tracker, action, kinds } = await runSpec({
            config: CONFIG,
            issues: [
                specIssue({ number: 10 }),
                ticketIssue({ number: 11, state: 'closed' }),
            ],
            sub_tickets: [11],
        })

        expect(action).toEqual({ type: 'done', outcome: 'nothing_to_do' })
        expect(kinds).toEqual(['run_started', 'intake_read', 'nothing_to_do'])
        expect(tracker.commentsOn({ number: 10 })).toEqual([])
    })
})

describe('engine: intake passes', () => {
    const readySpec = (): TrackerIssue[] => [
        specIssue({ number: 10, title: 'Checkout' }),
        ticketIssue({ number: 11, title: 'Pay', blocked_by: [12] }),
        ticketIssue({ number: 12, title: 'Cart', blocked_by: [99] }),
        ticketIssue({ number: 99, title: 'Done elsewhere', state: 'closed' }),
    ]

    test('the spec and every ticket are snapshotted into the journal', async () => {
        const { tracker, action, kinds } = await runSpec({
            config: CONFIG,
            issues: readySpec(),
            sub_tickets: [11, 12],
        })

        expect(action).toEqual({ type: 'await_build', tickets: [12, 11] })
        expect(kinds).toEqual([
            'run_started',
            'intake_read',
            'spec_snapshot',
            'ticket_snapshot',
            'ticket_snapshot',
        ])
        const records = journal.read()
        expect(
            records.map(({ seq, ticket, role }) => ({ seq, ticket, role }))
        ).toEqual([
            { seq: 1, ticket: null, role: null },
            { seq: 2, ticket: null, role: null },
            { seq: 3, ticket: 10, role: null },
            { seq: 4, ticket: 12, role: null },
            { seq: 5, ticket: 11, role: null },
        ])
        expect(records[4]).toMatchObject({
            kind: 'ticket_snapshot',
            content: {
                number: 11,
                title: 'Pay',
                criteria: [{ id: 'AC1', text: 'It works' }],
                blockers: [12],
            },
        })
        expect(tracker.commentsOn({ number: 11 })).toEqual([])
    })

    test('editing a ticket after the snapshot does not change the run', async () => {
        const { tracker } = await runSpec({
            config: CONFIG,
            issues: readySpec(),
            sub_tickets: [11, 12],
        })

        tracker.updateIssue({
            number: 11,
            changes: { title: 'Pay (edited)', body: 'Rewritten.' },
        })
        const again = await runEngine({ journal, tracker })

        expect(again).toEqual({ type: 'await_build', tickets: [12, 11] })
        const state = replayRun({ records: journal.read() })
        expect(state.snapshot?.tickets[11]?.title).toBe('Pay')
        expect(journal.read()).toHaveLength(5)
    })

    test('a run picks up where its journal left off', async () => {
        const tracker = createInMemoryTracker({
            issues: readySpec(),
            sub_tickets: { 10: [11, 12] },
        })
        startRun({ journal, spec_number: 10, config: CONFIG })

        const reopened = createJournal({ file: journal.file })
        const action = await runEngine({ journal: reopened, tracker })

        expect(action).toEqual({ type: 'await_build', tickets: [12, 11] })
        expect(reopened.read().map((r) => r.seq)).toEqual([1, 2, 3, 4, 5])
    })
})
