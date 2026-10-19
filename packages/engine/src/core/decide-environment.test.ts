import { describe, expect, test } from 'bun:test'

import { decideAfter, stepsUpTo } from './decide-build-helpers'
import { MAX_FIX_ROUNDS } from './loop-caps'

import type { GateName } from '../gates/gate-schemas'
import type { JournalEntry } from '../journal/journal-record'
import {
    agentStarted,
    commitMade,
    emptyTestRun,
    implemented,
    leftoverScan,
    redCheck,
    SESSIONS,
    testsWritten,
    ticketStuck,
} from '../testing/build-fixtures'

/**
 * The decision steps for a writer's `environment` answer (#613): a
 * test-writer or implementer says a failed red check or failed gates are not
 * its ticket's fault, with its evidence. The engine reruns the check once,
 * using no fix round; a rerun that fails the same way, or a third such
 * answer in one ticket, makes the ticket stuck as `environment_failed`.
 */

const EVIDENCE =
    'EADDRINUSE on port 4000: another ticket holds the port. I changed nothing.'

/** A writer's follow-up turn on ticket #11 started. */
const followUp = (role: 'test-writer' | 'implementer'): JournalEntry =>
    agentStarted({ ticket: 11, role, follow_up_of: SESSIONS[role] })

/** The test-writer answers `environment`, with the evidence. */
const testWriterBlamesEnvironment = (): JournalEntry => ({
    kind: 'agent_finished',
    ticket: 11,
    role: 'test-writer',
    content: {
        role: 'test-writer',
        session_id: SESSIONS['test-writer'],
        result: {
            outcome: 'environment',
            environment: { evidence: EVIDENCE },
            summary: 'Not this ticket.',
        },
    },
})

/** The implementer answers `environment`, with the evidence. */
const implementerBlamesEnvironment = (): JournalEntry => ({
    kind: 'agent_finished',
    ticket: 11,
    role: 'implementer',
    content: {
        role: 'implementer',
        session_id: SESSIONS.implementer,
        result: {
            outcome: 'environment',
            environment: { evidence: EVIDENCE },
            summary: 'Not this ticket.',
        },
    },
})

/** The ticket's gates, failing only on `check`. */
const gatesFailedOn = ({
    check,
    output,
}: {
    check: GateName
    /** Defaults to a line naming the check. */
    output?: string
}): JournalEntry => ({
    kind: 'gates_run',
    ticket: 11,
    role: null,
    content: {
        target: 'ticket',
        ok: false,
        checks: [
            {
                name: check,
                command: `run ${check}`,
                ok: false,
                exit_code: 1,
                output: output ?? `${check} broke`,
            },
        ],
    },
})

/** A failed red check with this one problem and output. */
const redFailedWith = ({
    problem,
    output,
}: {
    problem: string
    output: string
}): JournalEntry => ({
    kind: 'red_check',
    ticket: 11,
    role: null,
    content: {
        ok: false,
        problems: [problem],
        notes: [],
        tests: { ...emptyTestRun(), ok: false, output },
    },
})

/** Failed gates on `check`, then an implementer follow-up answered `done`, `n` times. */
const gateRounds = (n: number, check: GateName): JournalEntry[] =>
    Array.from({ length: n }, () => [
        gatesFailedOn({ check }),
        followUp('implementer'),
        implemented({ ticket: 11 }),
    ]).flat()

/** #11's implementer answered `environment` after its gates failed on the tests. */
const gatesBlamed = (): JournalEntry[] => [
    ...stepsUpTo(6),
    gatesFailedOn({ check: 'test' }),
    followUp('implementer'),
    implementerBlamesEnvironment(),
]

/** #11's test-writer answered `environment` after its red check failed. */
const redBlamed = (): JournalEntry[] => [
    ...stepsUpTo(2),
    redCheck({ ticket: 11, ok: false }),
    followUp('test-writer'),
    testWriterBlamesEnvironment(),
]

describe('decision step: an environment answer reruns the failed check (#613)', () => {
    test('after failed gates, an environment answer reruns the gates once, and no fix round is counted', () => {
        expect(decideAfter(gatesBlamed())).toMatchObject({
            type: 'run_gates',
            ticket: 11,
            target: 'ticket',
        })
        // The rerun fails another way, so the usual fix loop goes on: with
        // the environment answer uncounted, the implementer still has its
        // last fix round after two more.
        expect(
            decideAfter([
                ...gatesBlamed(),
                ...gateRounds(MAX_FIX_ROUNDS - 1, 'types'),
                gatesFailedOn({ check: 'types' }),
            ])
        ).toMatchObject({
            type: 'follow_up_agent',
            ticket: 11,
            role: 'implementer',
        })
    })

    test('after a failed red check, an environment answer reruns the red check once with the earlier tests, and no fix round is counted', () => {
        const rerun = decideAfter(redBlamed())
        expect(rerun).toMatchObject({ type: 'run_red_check', ticket: 11 })
        if (rerun.type !== 'run_red_check') throw new Error(rerun.type)
        expect(rerun.mapping).toEqual([
            {
                criterion_id: 'AC1',
                tests: [
                    { file: 'src/sum.test.ts', name: 'sum adds two numbers' },
                ],
            },
        ])
        const otherFailure = redFailedWith({
            problem: 'AC1 has no test',
            output: '0 pass',
        })
        expect(
            decideAfter([
                ...redBlamed(),
                otherFailure,
                ...Array.from({ length: MAX_FIX_ROUNDS - 1 }, () => [
                    followUp('test-writer'),
                    testsWritten({ ticket: 11 }),
                    otherFailure,
                ]).flat(),
            ])
        ).toMatchObject({
            type: 'follow_up_agent',
            ticket: 11,
            role: 'test-writer',
        })
    })

    test('gates that pass on the rerun let the ticket go on to its green commit', () => {
        expect(
            decideAfter([
                ...gatesBlamed(),
                {
                    kind: 'gates_run',
                    ticket: 11,
                    role: null,
                    content: {
                        target: 'ticket',
                        ok: true,
                        checks: [
                            {
                                name: 'test',
                                command: 'run test',
                                ok: true,
                                exit_code: 0,
                                output: '',
                            },
                        ],
                    },
                },
            ])
        ).toMatchObject({ type: 'commit_ticket', ticket: 11, stage: 'green' })
    })

    test('a red check that passes on the rerun lets the ticket go on to its red commit', () => {
        expect(
            decideAfter([...redBlamed(), redCheck({ ticket: 11, ok: true })])
        ).toMatchObject({ type: 'commit_ticket', ticket: 11, stage: 'red' })
    })
})

describe('decision step: a ticket stuck as environment_failed (#613)', () => {
    const LONG_OUTPUT = `EADDRINUSE: address already in use :::4000\n${'x'.repeat(20_000)}\nlast line`

    test('gates that fail the same way on the rerun make the ticket stuck, and the stuck text shows the evidence and the clipped output', () => {
        const entries = [
            ...stepsUpTo(6),
            gatesFailedOn({ check: 'test', output: LONG_OUTPUT }),
            followUp('implementer'),
            implementerBlamesEnvironment(),
            gatesFailedOn({ check: 'test', output: LONG_OUTPUT }),
        ]
        const stuck = decideAfter(entries)
        expect(stuck).toMatchObject({
            type: 'mark_stuck',
            ticket: 11,
            reason: 'environment_failed',
        })
        if (stuck.type !== 'mark_stuck') throw new Error(stuck.type)
        expect(stuck.detail).toContain(EVIDENCE)
        expect(stuck.detail).toContain('EADDRINUSE: address already in use')
        expect(stuck.detail).toContain('[...]')
        expect(stuck.detail.length).toBeLessThan(LONG_OUTPUT.length)

        const report = decideAfter([
            ...entries,
            ticketStuck({
                ticket: 11,
                reason: 'environment_failed',
                detail: stuck.detail,
            }),
        ])
        expect(report).toMatchObject({ type: 'report_stuck', ticket: 11 })
        if (report.type !== 'report_stuck') throw new Error(report.type)
        expect(report.body).toContain(EVIDENCE)
        expect(report.body).toContain('last line')
        expect(report.body).not.toContain('undefined')
        expect(report.body).toContain('`retry #11`')
        expect(report.body).toContain('`skip #11`')
        expect(report.body).toContain('`stop`')
    })

    test('a red check that fails the same way on the rerun makes the ticket stuck, with the evidence and the output', () => {
        const stuck = decideAfter([
            ...redBlamed(),
            redCheck({ ticket: 11, ok: false }),
        ])
        expect(stuck).toMatchObject({
            type: 'mark_stuck',
            ticket: 11,
            reason: 'environment_failed',
        })
        if (stuck.type !== 'mark_stuck') throw new Error(stuck.type)
        expect(stuck.detail).toContain(EVIDENCE)
        expect(stuck.detail).toContain('(pass) sum adds two numbers')
    })

    test('a third environment answer in one ticket makes it stuck, whichever checks the answers came after', () => {
        const stuck = decideAfter([
            // 1: the red check, whose rerun passes.
            ...redBlamed(),
            redCheck({ ticket: 11, ok: true }),
            leftoverScan({ ticket: 11, stage: 'red' }),
            commitMade({ ticket: 11, stage: 'red' }),
            implemented({ ticket: 11 }),
            // 2: the gates, whose rerun fails another way.
            gatesFailedOn({ check: 'test' }),
            followUp('implementer'),
            implementerBlamesEnvironment(),
            gatesFailedOn({ check: 'types' }),
            // 3: past the cap of two reruns.
            followUp('implementer'),
            implementerBlamesEnvironment(),
        ])
        expect(stuck).toMatchObject({
            type: 'mark_stuck',
            ticket: 11,
            reason: 'environment_failed',
        })
        if (stuck.type !== 'mark_stuck') throw new Error(stuck.type)
        expect(stuck.detail).toContain(EVIDENCE)
    })
})

describe('decision step: journals from before the environment answer (#613)', () => {
    test('an old journal mid gates fix loop still counts its rounds, and an environment answer after them reruns without one', () => {
        // Written by an engine without the environment answer: two fix
        // rounds answered `done`, then failed gates.
        const old = [
            ...stepsUpTo(6),
            ...gateRounds(MAX_FIX_ROUNDS - 1, 'test'),
            gatesFailedOn({ check: 'test' }),
        ]
        expect(decideAfter(old)).toMatchObject({
            type: 'follow_up_agent',
            role: 'implementer',
        })
        const resumed = [
            ...old,
            followUp('implementer'),
            implementerBlamesEnvironment(),
        ]
        expect(decideAfter(resumed)).toMatchObject({
            type: 'run_gates',
            ticket: 11,
        })
        const lastRound = [
            ...resumed,
            gatesFailedOn({ check: 'types' }),
            followUp('implementer'),
            implemented({ ticket: 11 }),
            gatesFailedOn({ check: 'types' }),
        ]
        expect(decideAfter(lastRound)).toMatchObject({
            type: 'mark_stuck',
            reason: 'gates_failed',
        })
    })
})
