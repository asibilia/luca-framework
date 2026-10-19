import { describe, expect, test } from 'bun:test'

import { MAX_ENGINE_FAILURES, MAX_FIX_ROUNDS } from './decide-build'
import { decideAfter, stepsUpTo } from './decide-build-helpers'

import {
    agentFailed,
    agentStarted,
    gatesRun,
    implemented,
    leftoverScan,
    redCheck,
    testsWritten,
    ticketBuilt,
} from '../testing/build-fixtures'

/**
 * The decision steps for a ticket that goes wrong while it builds: it gets
 * stuck, an agent's try fails, or the engine crashes on a build step. The
 * helpers are in `decide-build-helpers.ts`.
 */

describe('decision step: a ticket gets stuck', () => {
    test('leftovers found before a commit make the ticket stuck, with no commit', () => {
        expect(
            decideAfter([
                ...stepsUpTo(8).slice(0, -1),
                leftoverScan({
                    ticket: 11,
                    stage: 'green',
                    hits: [{ path: 'debug.log', reason: 'a log file' }],
                }),
            ])
        ).toEqual({
            type: 'mark_stuck',
            ticket: 11,
            reason: 'leftovers_found',
            detail: 'debug.log: a log file',
        })
    })

    test('a join that clashes is not stuck: the ticket is fixed on top of the run branch', () => {
        expect(
            decideAfter([
                ...stepsUpTo(10),
                {
                    kind: 'ticket_joined',
                    ticket: 11,
                    role: null,
                    content: { ok: false, error: 'conflict in src/sum.ts' },
                },
            ])
        ).toEqual({
            type: 'rebase_ticket',
            ticket: 11,
            cause: 'clash',
            undo_first_sha: null,
        })
    })

    test('failing gates after the join undo it, with no push', () => {
        expect(
            decideAfter([
                ...stepsUpTo(11),
                gatesRun({ ticket: 11, target: 'run_branch', ok: false }),
            ])
        ).toMatchObject({ type: 'rebase_ticket', cause: 'join_gates' })
    })

    test('a stuck ticket is told to the spec issue, not built on, and gets no PR', () => {
        expect(
            decideAfter([
                ...stepsUpTo(2),
                redCheck({ ticket: 11, ok: false }),
                {
                    kind: 'ticket_stuck',
                    ticket: 11,
                    role: null,
                    content: { reason: 'red_check_failed', detail: 'why' },
                },
            ])
        ).toMatchObject({ type: 'report_stuck', ticket: 11, spec_number: 10 })
    })
})

describe('decision step: failed tries', () => {
    const GUARD_ERROR =
        "The test-writer broke its role's rules, so the engine undid it:\n- wrote src/sum.ts, which a test-writer may not write"

    test('the caps are three failed tries and three engine failures in a row', () => {
        expect(MAX_FIX_ROUNDS).toBe(3)
        expect(MAX_ENGINE_FAILURES).toBe(3)
    })

    test("a test-writer's guard failure goes back to its session with what failed", () => {
        const action = decideAfter([
            ...stepsUpTo(1),
            agentStarted({ ticket: 11, role: 'test-writer' }),
            agentFailed({
                ticket: 11,
                role: 'test-writer',
                failure: 'guard',
                error: GUARD_ERROR,
            }),
        ])

        expect(action).toEqual({
            type: 'follow_up_agent',
            ticket: 11,
            role: 'test-writer',
            session_id: 'tw-1',
            message: expect.stringContaining(
                'Your last turn changed things your role may not change.'
            ),
        })
        if (action.type !== 'follow_up_agent') throw new Error(action.type)
        expect(action.message).toContain(
            '- wrote src/sum.ts, which a test-writer may not write'
        )
        expect(action.message).toContain(
            'The engine undid every change your role may not make'
        )
    })

    test('after a clean retry the ticket carries on to the red check', () => {
        expect(
            decideAfter([
                ...stepsUpTo(1),
                agentStarted({ ticket: 11, role: 'test-writer' }),
                agentFailed({
                    ticket: 11,
                    role: 'test-writer',
                    failure: 'guard',
                }),
                agentStarted({
                    ticket: 11,
                    role: 'test-writer',
                    follow_up_of: 'tw-1',
                }),
                testsWritten({ ticket: 11 }),
            ])
        ).toMatchObject({ type: 'run_red_check', ticket: 11 })
    })

    test('a restart after a retry was started sends the same retry again', () => {
        const failed = [
            ...stepsUpTo(1),
            agentStarted({ ticket: 11, role: 'test-writer' }),
            agentFailed({ ticket: 11, role: 'test-writer', failure: 'guard' }),
        ]
        expect(
            decideAfter([
                ...failed,
                agentStarted({
                    ticket: 11,
                    role: 'test-writer',
                    follow_up_of: 'tw-1',
                }),
            ])
        ).toEqual(decideAfter(failed))
    })

    test('a result failure uses one try and goes back to the implementer', () => {
        expect(
            decideAfter([
                ...stepsUpTo(5),
                agentFailed({
                    ticket: 11,
                    role: 'implementer',
                    failure: 'result',
                    error: 'The implementer finished with no structured output.',
                }),
            ])
        ).toEqual({
            type: 'follow_up_agent',
            ticket: 11,
            role: 'implementer',
            session_id: 'impl-1',
            message: expect.stringContaining(
                'The implementer finished with no structured output.'
            ),
        })
    })

    test('the third failed try makes the ticket stuck, saying so', () => {
        const fail = (error: string) =>
            agentFailed({
                ticket: 11,
                role: 'implementer',
                failure: 'result',
                error,
            })
        const two = [...stepsUpTo(5), fail('first'), fail('second')]

        expect(decideAfter(two)).toMatchObject({ type: 'follow_up_agent' })
        expect(decideAfter([...two, fail('third')])).toEqual({
            type: 'mark_stuck',
            ticket: 11,
            reason: 'agent_failed',
            detail: 'The implementer failed 3 tries; the last one: third',
        })
    })

    test("a test-writer that breaks its rules on every try is stuck after the third, with the last guard's error", () => {
        const fail = agentFailed({
            ticket: 11,
            role: 'test-writer',
            failure: 'guard',
            error: GUARD_ERROR,
        })
        const retry = agentStarted({
            ticket: 11,
            role: 'test-writer',
            follow_up_of: 'tw-1',
        })
        const two = [
            ...stepsUpTo(1),
            agentStarted({ ticket: 11, role: 'test-writer' }),
            fail,
            retry,
            fail,
        ]

        expect(decideAfter(two)).toMatchObject({
            type: 'follow_up_agent',
            role: 'test-writer',
            session_id: 'tw-1',
        })
        expect(decideAfter([...two, retry, fail])).toEqual({
            type: 'mark_stuck',
            ticket: 11,
            reason: 'agent_failed',
            detail: `The test-writer failed 3 tries; the last one: ${GUARD_ERROR}`,
        })
    })

    test('failed tries add up over the ticket, even across successes', () => {
        const fail = () =>
            agentFailed({ ticket: 11, role: 'implementer', failure: 'agent' })
        expect(
            decideAfter([
                ...stepsUpTo(5),
                fail(),
                implemented({ ticket: 11 }),
                gatesRun({ ticket: 11, target: 'ticket', ok: false }),
                fail(),
                fail(),
            ])
        ).toMatchObject({ type: 'mark_stuck', reason: 'agent_failed' })
    })

    test('an engine failure launches a fresh agent of the role, without using a try', () => {
        expect(
            decideAfter([
                ...stepsUpTo(1),
                agentFailed({
                    ticket: 11,
                    role: 'test-writer',
                    failure: 'guard',
                }),
                agentFailed({
                    ticket: 11,
                    role: 'test-writer',
                    failure: 'guard',
                }),
                agentFailed({
                    ticket: 11,
                    role: 'test-writer',
                    failure: 'engine',
                }),
            ])
        ).toMatchObject({
            type: 'launch_agent',
            ticket: 11,
            role: 'test-writer',
            may_edit_tests: true,
        })
        // Two tries used, and the engine failure used none: one try is left.
        expect(
            decideAfter([
                ...stepsUpTo(1),
                agentFailed({
                    ticket: 11,
                    role: 'test-writer',
                    failure: 'guard',
                }),
                agentFailed({
                    ticket: 11,
                    role: 'test-writer',
                    failure: 'engine',
                }),
                agentFailed({
                    ticket: 11,
                    role: 'test-writer',
                    failure: 'guard',
                    session_id: 'tw-2',
                }),
            ])
        ).toMatchObject({ type: 'follow_up_agent', session_id: 'tw-2' })
    })

    test('three engine failures in a row make the ticket stuck', () => {
        const crash = agentFailed({
            ticket: 11,
            role: 'implementer',
            failure: 'engine',
            error: 'The agent session ended with no result.',
            session_id: null,
        })

        expect(decideAfter([...stepsUpTo(5), crash, crash])).toMatchObject({
            type: 'launch_agent',
            role: 'implementer',
        })
        expect(decideAfter([...stepsUpTo(5), crash, crash, crash])).toEqual({
            type: 'mark_stuck',
            ticket: 11,
            reason: 'agent_failed',
            detail: 'The engine failed to run the implementer 3 times in a row: The agent session ended with no result.',
        })
    })

    test('an agent finishing ends a run of engine failures', () => {
        const crash = (role: 'test-writer' | 'implementer') =>
            agentFailed({ ticket: 11, role, failure: 'engine' })
        expect(
            decideAfter([
                ...stepsUpTo(1),
                crash('test-writer'),
                crash('test-writer'),
                ...ticketBuilt({ ticket: 11 }).slice(2, 6),
                crash('implementer'),
            ])
        ).toMatchObject({ type: 'launch_agent', role: 'implementer' })
    })

    test("a reviewer's guard failure launches a fresh reviewer", () => {
        expect(
            decideAfter([
                ...stepsUpTo(9),
                agentFailed({
                    ticket: 11,
                    role: 'ticket-reviewer',
                    failure: 'guard',
                }),
            ])
        ).toMatchObject({
            type: 'launch_agent',
            ticket: 11,
            role: 'ticket-reviewer',
            may_edit_tests: false,
        })
    })

    test('a failed turn with no session gets a fresh launch', () => {
        expect(
            decideAfter([
                ...stepsUpTo(5),
                agentFailed({
                    ticket: 11,
                    role: 'implementer',
                    failure: 'agent',
                    session_id: null,
                }),
            ])
        ).toMatchObject({
            type: 'launch_agent',
            role: 'implementer',
            may_edit_tests: false,
        })
    })

    test('a retry that finishes in the gates fix loop runs the gates again', () => {
        const gateLoop = [
            ...stepsUpTo(6),
            gatesRun({ ticket: 11, target: 'ticket', ok: false }),
            agentStarted({
                ticket: 11,
                role: 'implementer',
                follow_up_of: 'impl-1',
            }),
            agentFailed({ ticket: 11, role: 'implementer', failure: 'guard' }),
        ]

        expect(decideAfter(gateLoop)).toMatchObject({
            type: 'follow_up_agent',
            role: 'implementer',
            session_id: 'impl-1',
        })
        expect(decideAfter([...gateLoop, implemented({ ticket: 11 })])).toEqual(
            {
                type: 'run_gates',
                ticket: 11,
                target: 'ticket',
            }
        )
    })
})

describe('decision step: crash recovery on the build steps', () => {
    test('an agent that started but never finished is started again', () => {
        expect(
            decideAfter([
                ...stepsUpTo(1),
                {
                    kind: 'agent_started',
                    ticket: 11,
                    role: 'test-writer',
                    content: { role: 'test-writer', prompt: 'p' },
                },
            ])
        ).toMatchObject({ type: 'launch_agent', role: 'test-writer' })
    })
})
