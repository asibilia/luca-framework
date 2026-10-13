import { describe, expect, test } from 'bun:test'

import { decideSteps, type EngineAction } from './decide'
import { STOP_ACTIONS } from './execute'

import type { TicketSnapshot } from '../intake/intake-schemas'
import {
    JournalRecordSchema,
    type JournalEntry,
} from '../journal/journal-record'
import {
    intakePassed,
    practiceTicket,
    runBranchCreated,
    ticketWorktreeCreated,
    withInstalls,
} from '../testing/build-fixtures'
import { recordsFrom } from '../testing/intake-fixtures'

/**
 * Seam 1 for Luca's version (#460): the run's `run_started` records the
 * version the run started on (`luca_version`), and each time the engine
 * starts again on the run's journal it appends an `engine_resumed` with the
 * version it resumed on. The decision step reads neither: a resume on a
 * different version changes no step, and the run keeps going. A journal
 * from before the version was recorded replays with `luca_version: null`.
 */

const STARTED_ON = '14.0.0-alpha.1'
const UPGRADED_TO = '14.0.0-alpha.2'

const SUM: TicketSnapshot = practiceTicket({ number: 11 })

/** Intake passed on spec 10, its `run_started` naming `luca_version`. */
const intakeOn = ({ version }: { version: string }): JournalEntry[] =>
    intakePassed({ tickets: [SUM] }).map(
        (entry): JournalEntry =>
            entry.kind === 'run_started'
                ? {
                      ...entry,
                      content: { ...entry.content, luca_version: version },
                  }
                : entry
    )

/** The engine started again on the run's journal, on `version`. */
const engineResumed = ({ version }: { version: string }): JournalEntry => ({
    kind: 'engine_resumed',
    ticket: null,
    role: null,
    content: { luca_version: version },
})

/** The run branch and #11's worktree made, each with its install. */
const underway = (): JournalEntry[] =>
    withInstalls({
        entries: [runBranchCreated(), ticketWorktreeCreated({ ticket: 11 })],
    })

const stepsOf = (entries: JournalEntry[]): EngineAction[] =>
    decideSteps({ records: recordsFrom({ entries }) })

describe("Luca's version in the journal", () => {
    test('run_started keeps the version the run started on', () => {
        const [started] = recordsFrom({
            entries: intakeOn({ version: STARTED_ON }),
        })

        expect(started?.kind).toBe('run_started')
        expect(
            started?.kind === 'run_started'
                ? started.content.luca_version
                : undefined
        ).toBe(STARTED_ON)
    })

    test('engine_resumed keeps the version the run resumed on', () => {
        const records = recordsFrom({
            entries: [
                ...intakeOn({ version: STARTED_ON }),
                engineResumed({ version: UPGRADED_TO }),
            ],
        })
        const resumed = records.at(-1)

        expect(resumed?.kind).toBe('engine_resumed')
        expect(resumed?.content).toEqual({ luca_version: UPGRADED_TO })
    })

    test('a run_started from before the version was recorded replays with luca_version null', () => {
        const line = JSON.stringify({
            seq: 1,
            time: '2026-09-01T00:00:00.000Z',
            kind: 'run_started',
            ticket: null,
            role: null,
            content: {
                spec_number: 10,
                config: {
                    checks: { test: 'bun test' },
                    test_file_patterns: ['src/**/*.test.ts'],
                    test_setup_files: [],
                    rule_files: [],
                },
                base_branch: 'main',
                memory: null,
                repo: '/code/app',
            },
        })

        const record = JournalRecordSchema.parse(JSON.parse(line))

        expect(record.kind).toBe('run_started')
        expect(
            record.kind === 'run_started'
                ? record.content.luca_version
                : undefined
        ).toBeNull()
    })
})

describe('the decision step on a resumed run', () => {
    test('a resume on a different version changes no step: the run keeps going', () => {
        const before = [...intakeOn({ version: STARTED_ON }), ...underway()]
        const after = [...before, engineResumed({ version: UPGRADED_TO })]

        const steps = stepsOf(after)

        expect(steps).toEqual(stepsOf(before))
        expect(steps.length).toBeGreaterThan(0)
        expect(steps.some(({ type }) => STOP_ACTIONS.has(type))).toBe(false)
    })

    test('a resume on the same version changes no step either', () => {
        const before = [...intakeOn({ version: STARTED_ON }), ...underway()]
        const after = [...before, engineResumed({ version: STARTED_ON })]

        expect(stepsOf(after)).toEqual(stepsOf(before))
    })

    test('a run resumed twice on new versions keeps going', () => {
        const before = [...intakeOn({ version: STARTED_ON }), ...underway()]
        const after = [
            ...intakeOn({ version: STARTED_ON }),
            engineResumed({ version: UPGRADED_TO }),
            ...underway(),
            engineResumed({ version: '14.0.0-alpha.3' }),
        ]

        expect(stepsOf(after)).toEqual(stepsOf(before))
    })

    test('a journal from before the version was recorded decides the same steps as one with it', () => {
        const old = [...intakePassed({ tickets: [SUM] }), ...underway()]
        const recorded = [
            ...intakeOn({ version: STARTED_ON }),
            ...underway(),
            engineResumed({ version: STARTED_ON }),
        ]

        expect(stepsOf(old)).toEqual(stepsOf(recorded))
    })
})
