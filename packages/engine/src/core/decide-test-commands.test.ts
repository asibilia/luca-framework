import { describe, expect, test } from 'bun:test'

import { decide } from './decide'

import type { EngineConfig } from '../config/engine-config'
import type { IntakeRead } from '../intake/intake-schemas'
import type { JournalEntry } from '../journal/journal-record'
import {
    agentStarted,
    BUILD_CONFIG,
    implemented,
    intakePassed,
    practiceTicket,
    runBranchCreated,
    SESSIONS,
    ticketBuilt,
    withInstalls,
} from '../testing/build-fixtures'
import { recordsFrom, specIssue, ticketIssue } from '../testing/intake-fixtures'
import { REFACTOR_LABEL } from '../tracker/tracker'

/**
 * Seam 1: several test commands per repo (#428), through the decision step.
 * Intake needs a test command whose per-test results the engine can read
 * (`bun`), unless every open ticket is a refactor ticket. A failing
 * pass-or-fail test command goes into the normal gates fix loop.
 */

/** tmnb's test commands: bun's for the red check, vitest's as a gate. */
const TWO_RUNNERS = {
    checks: {
        test: [
            'bun test',
            { run: 'bun run test:workers', results: 'pass_fail' },
        ],
        types: 'bun run type-check',
        lint: 'bun run lint',
    },
    test_file_patterns: ['**/*.test.ts'],
    test_setup_files: [],
    rule_files: [],
} as unknown as EngineConfig

const withTests = (test: unknown): EngineConfig =>
    ({
        ...BUILD_CONFIG,
        checks: { ...BUILD_CONFIG.checks, test },
    }) as unknown as EngineConfig

const decideAfterIntake = ({
    config,
    intake,
}: {
    config: EngineConfig
    intake: IntakeRead
}) =>
    decide({
        records: recordsFrom({
            entries: [
                {
                    kind: 'run_started',
                    ticket: null,
                    role: null,
                    content: { spec_number: 10, config },
                },
                {
                    kind: 'intake_read',
                    ticket: null,
                    role: null,
                    content: intake,
                },
            ],
        }),
    })

const refactorTicket = (number: number) =>
    ticketIssue({ number, labels: ['ready-for-agent', REFACTOR_LABEL] })

/** Every message intake refused the run with, on the spec or any ticket. */
const refusals = (action: ReturnType<typeof decide>): string[] =>
    action.type === 'refuse_intake'
        ? action.problems.flatMap(({ missing }) => missing)
        : []

describe('decision step: intake with several test commands', () => {
    test('a list with one bun command among pass_fail commands passes intake', () => {
        const action = decideAfterIntake({
            config: TWO_RUNNERS,
            intake: {
                spec: specIssue({ number: 10 }),
                sub_tickets: [ticketIssue({ number: 11 })],
                outside_blockers: [],
            },
        })

        expect(action).toMatchObject({ type: 'snapshot_intake' })
    })

    test('no bun test command and a ticket that is not a refactor ticket refuses the run', () => {
        const action = decideAfterIntake({
            config: withTests(['bun run test:workers', 'bunx vitest run']),
            intake: {
                spec: specIssue({ number: 10 }),
                sub_tickets: [refactorTicket(11), ticketIssue({ number: 12 })],
                outside_blockers: [],
            },
        })

        expect(action).toMatchObject({ type: 'refuse_intake', spec_number: 10 })
        const messages = refusals(action)
        expect(messages).toHaveLength(1)
        // The reason names what is missing: a test command bun reads per test.
        expect(messages[0]).toContain('bun')
        expect(messages[0]).toContain('checks.test')
    })

    test('a bun test command marked pass_fail does not count for the red check', () => {
        const action = decideAfterIntake({
            config: withTests([{ run: 'bun test', results: 'pass_fail' }]),
            intake: {
                spec: specIssue({ number: 10 }),
                sub_tickets: [ticketIssue({ number: 11 })],
                outside_blockers: [],
            },
        })

        expect(action).toMatchObject({ type: 'refuse_intake' })
        expect(refusals(action)).toHaveLength(1)
    })

    test('no bun test command is fine when every open ticket is a refactor ticket', () => {
        const action = decideAfterIntake({
            config: withTests(['bun run test:workers']),
            intake: {
                spec: specIssue({ number: 10 }),
                sub_tickets: [
                    refactorTicket(11),
                    refactorTicket(12),
                    ticketIssue({ number: 13, state: 'closed' }),
                ],
                outside_blockers: [],
            },
        })

        expect(action).toMatchObject({ type: 'snapshot_intake' })
    })

    test('an empty test command list refuses the run like a missing test command', () => {
        const action = decideAfterIntake({
            config: withTests([]),
            intake: {
                spec: specIssue({ number: 10 }),
                sub_tickets: [refactorTicket(11)],
                outside_blockers: [],
            },
        })

        expect(action).toMatchObject({ type: 'refuse_intake' })
        expect(refusals(action)).toContain(
            'The engine config (.luca/config.json) has no test command at checks.test.'
        )
    })
})

const TICKET = practiceTicket({ number: 11 })

/** Decide on a two-runner run with ticket #11 and these entries after intake. */
const decideAfter = (entries: JournalEntry[]) => {
    const [started, ...rest] = intakePassed({ tickets: [TICKET] })
    if (started?.kind !== 'run_started') throw new Error('no run_started')
    return decide({
        records: recordsFrom({
            entries: [
                {
                    ...started,
                    content: { ...started.content, config: TWO_RUNNERS },
                },
                ...rest,
                ...withInstalls({ entries }),
            ],
        }),
    })
}

/** #11 up to and including the implementer's first answer. */
const upToImplemented = (): JournalEntry[] => [
    runBranchCreated(),
    ...ticketBuilt({ ticket: 11 }).slice(0, 7),
]

const WORKERS_OUTPUT =
    'FAIL workers/queue.test.ts > drains the queue\nTests 1 failed | 4 passed'

/** The ticket's gates: bun's tests pass, and the workers' pass unless not. */
const twoRunnerGates = ({
    workers_ok,
}: {
    workers_ok: boolean
}): JournalEntry => ({
    kind: 'gates_run',
    ticket: 11,
    role: null,
    content: {
        target: 'ticket',
        ok: workers_ok,
        checks: [
            {
                name: 'test',
                command: 'bun test',
                ok: true,
                exit_code: 0,
                output: '',
            },
            {
                name: 'test',
                command: 'bun run test:workers',
                ok: workers_ok,
                exit_code: workers_ok ? 0 : 1,
                output: workers_ok ? '' : WORKERS_OUTPUT,
            },
            {
                name: 'types',
                command: 'bun run type-check',
                ok: true,
                exit_code: 0,
                output: '',
            },
            {
                name: 'lint',
                command: 'bun run lint',
                ok: true,
                exit_code: 0,
                output: '',
            },
        ],
    },
})

describe('decision step: a failing pass_fail test command', () => {
    test('goes back to the same implementer session with its output', () => {
        const action = decideAfter([
            ...upToImplemented(),
            twoRunnerGates({ workers_ok: false }),
        ])

        expect(action).toMatchObject({
            type: 'follow_up_agent',
            ticket: 11,
            role: 'implementer',
            session_id: SESSIONS.implementer,
        })
        if (action.type !== 'follow_up_agent') throw new Error(action.type)
        expect(action.message).toContain(WORKERS_OUTPUT)
    })

    test('a later passing run clears it, and the green commit follows', () => {
        const action = decideAfter([
            ...upToImplemented(),
            twoRunnerGates({ workers_ok: false }),
            agentStarted({
                ticket: 11,
                role: 'implementer',
                follow_up_of: SESSIONS.implementer,
            }),
            implemented({ ticket: 11 }),
            twoRunnerGates({ workers_ok: true }),
        ])

        expect(action).toMatchObject({ type: 'commit_ticket', stage: 'green' })
    })
})
