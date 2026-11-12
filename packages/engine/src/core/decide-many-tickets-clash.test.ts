import { describe, expect, test } from 'bun:test'

import { MAX_FIX_ROUNDS, MAX_REJOINS } from './decide-build'
import {
    twoSteps,
    oneSteps,
    clashed,
    codeClash,
    fixedOnRunBranch,
} from './decide-many-tickets-helpers'

import {
    agentStarted,
    finding,
    gatesRun,
    implemented,
    joinClashed,
    reviewed,
    runBranchCreated,
    SESSIONS,
    testsWritten,
    ticketApproved,
    ticketBuilt,
    ticketRebased,
} from '../testing/build-fixtures'

/**
 * The decision step for many tickets in one run, when a ticket's join
 * clashes on the run branch. Split from `decide-many-tickets.test.ts`.
 */

describe('decision step: a clash on the run branch', () => {
    test(`the rejoin cap is ${MAX_FIX_ROUNDS}, like the fix loops`, () => {
        expect(MAX_REJOINS).toBe(MAX_FIX_ROUNDS)
    })

    test("a join that clashes puts the ticket's change back on top of the run branch", () => {
        expect(oneSteps(clashed())).toEqual([
            {
                type: 'rebase_ticket',
                ticket: 11,
                cause: 'clash',
                undo_first_sha: null,
            },
        ])
    })

    test('clashed code goes back to the implementer session, naming the files', () => {
        const steps = oneSteps([...clashed(), codeClash()])

        expect(steps).toMatchObject([
            {
                type: 'follow_up_agent',
                ticket: 11,
                role: 'implementer',
                session_id: SESSIONS.implementer,
            },
        ])
        const [step] = steps
        if (step?.type !== 'follow_up_agent') throw new Error(step?.type)
        expect(step.message).toContain('- src/index.ts')
        expect(step.message).toContain('onto-sha')
        expect(step.message).toContain('conflict markers')
    })

    test('clashed tests go to a fresh test-writer, naming the files', () => {
        const steps = oneSteps([
            ...clashed(),
            ticketRebased({
                ticket: 11,
                cause: 'clash',
                tests: ['src/sum.test.ts'],
                code: ['src/index.ts'],
            }),
        ])

        expect(steps).toMatchObject([
            {
                type: 'launch_agent',
                ticket: 11,
                role: 'test-writer',
                may_edit_tests: true,
            },
        ])
        const [step] = steps
        if (step?.type !== 'launch_agent') throw new Error(step?.type)
        expect(step.prompt).toContain('clashed with the run branch')
        expect(step.prompt).toContain('- src/sum.test.ts')
    })

    test('after the test-writer, the clashed code goes to the implementer; no fix round is counted', () => {
        const steps = oneSteps([
            ...clashed(),
            ticketRebased({
                ticket: 11,
                cause: 'clash',
                tests: ['src/sum.test.ts'],
                code: ['src/index.ts'],
            }),
            agentStarted({ ticket: 11, role: 'test-writer' }),
            testsWritten({ ticket: 11, session_id: 'tw-2' }),
        ])

        expect(steps).toMatchObject([
            { type: 'follow_up_agent', role: 'implementer' },
        ])
    })

    test('then the gates run in the ticket worktree', () => {
        expect(
            oneSteps([
                ...clashed(),
                codeClash(),
                ...fixedOnRunBranch().slice(0, 2),
            ])
        ).toEqual([{ type: 'run_gates', ticket: 11, target: 'ticket' }])
    })

    test('passing gates make one new commit that says it rejoins the run branch', () => {
        expect(
            oneSteps([
                ...clashed(),
                codeClash(),
                ...fixedOnRunBranch().slice(0, 3),
            ])
        ).toEqual([
            {
                type: 'commit_ticket',
                ticket: 11,
                stage: 'green',
                message: 'fix: rejoin #11 Add sum onto the run branch',
            },
        ])
    })

    test('then a fresh reviewer re-reviews only the new changes, with the earlier findings', () => {
        const steps = oneSteps([
            runBranchCreated(),
            ...ticketBuilt({ ticket: 11 }).slice(0, 10),
            reviewed({
                ticket: 11,
                findings: [
                    finding({
                        id: 'F1',
                        severity: 'nit',
                        title: 'Name the argument',
                    }),
                ],
            }),
            joinClashed({ ticket: 11 }),
            codeClash(),
            ...fixedOnRunBranch().slice(0, 5),
        ])

        expect(steps).toMatchObject([
            { type: 'launch_agent', ticket: 11, role: 'ticket-reviewer' },
        ])
        const [step] = steps
        if (step?.type !== 'launch_agent') throw new Error(step?.type)
        expect(step.prompt).toContain('Re-review only the new changes')
        expect(step.prompt).toContain('- src/index.ts')
        expect(step.prompt).toContain('onto-sha')
        expect(step.prompt).toContain(
            '- F1 [nit, code] (src/sum.ts): Name the argument'
        )
    })

    test('an approved re-review joins again', () => {
        expect(
            oneSteps([...clashed(), codeClash(), ...fixedOnRunBranch()])
        ).toEqual([{ type: 'join_run_branch', ticket: 11 }])
    })

    test('a clashed ticket leaves the join queue, so the next approved ticket joins', () => {
        expect(
            twoSteps([
                runBranchCreated(),
                ...ticketApproved({ ticket: 11 }),
                ...ticketApproved({ ticket: 12 }),
                joinClashed({ ticket: 11 }),
                codeClash(),
            ])
        ).toMatchObject([
            { type: 'follow_up_agent', ticket: 11, role: 'implementer' },
            { type: 'join_run_branch', ticket: 12 },
        ])
    })

    test('a worktree whose dependencies moved under it gets its install again, before anything else', () => {
        expect(
            oneSteps([
                ...clashed(),
                {
                    kind: 'ticket_rebased',
                    ticket: 11,
                    role: null,
                    content: {
                        cause: 'clash',
                        base_sha: 'onto-sha',
                        tests: [],
                        code: ['src/index.ts'],
                        undone: [],
                        reinstall: true,
                    },
                },
            ])
        ).toEqual([
            { type: 'install_dependencies', target: 'ticket', ticket: 11 },
        ])
    })

    test('failing gates after the join undo the join and put the ticket back on top of the run branch', () => {
        expect(
            oneSteps([
                runBranchCreated(),
                ...ticketBuilt({ ticket: 11 }).slice(0, 12),
                gatesRun({ ticket: 11, target: 'run_branch', ok: false }),
            ])
        ).toEqual([
            {
                type: 'rebase_ticket',
                ticket: 11,
                cause: 'join_gates',
                undo_first_sha: 'r1',
            },
        ])
    })

    test('after that rebase the gates run in the worktree, and failing, go to the implementer', () => {
        const rebased = [
            runBranchCreated(),
            ...ticketBuilt({ ticket: 11 }).slice(0, 12),
            gatesRun({ ticket: 11, target: 'run_branch', ok: false }),
            ticketRebased({
                ticket: 11,
                cause: 'join_gates',
                undone: ['r1', 'g1'],
            }),
        ]

        expect(oneSteps(rebased)).toEqual([
            { type: 'run_gates', ticket: 11, target: 'ticket' },
        ])
        expect(
            oneSteps([
                ...rebased,
                gatesRun({ ticket: 11, target: 'ticket', ok: false }),
            ])
        ).toMatchObject([
            {
                type: 'follow_up_agent',
                role: 'implementer',
                session_id: SESSIONS.implementer,
                message: expect.stringContaining('The gates failed'),
            },
        ])
    })

    test(`a clash after ${MAX_REJOINS} rebases makes the ticket stuck`, () => {
        const rounds = Array.from({ length: MAX_REJOINS }, () => [
            joinClashed({ ticket: 11 }),
            codeClash(),
            ...fixedOnRunBranch(),
        ]).flat()

        expect(
            oneSteps([
                runBranchCreated(),
                ...ticketApproved({ ticket: 11 }),
                ...rounds,
                joinClashed({ ticket: 11, error: 'CONFLICT again' }),
            ])
        ).toEqual([
            {
                type: 'mark_stuck',
                ticket: 11,
                reason: 'join_failed',
                detail: expect.stringContaining('CONFLICT again'),
            },
        ])
    })

    test('a bad test while fixing on the run branch goes back to the test-writer, not a reset that would throw the ticket away', () => {
        expect(
            oneSteps([
                ...clashed(),
                codeClash(),
                agentStarted({
                    ticket: 11,
                    role: 'implementer',
                    follow_up_of: SESSIONS.implementer,
                }),
                implemented({ ticket: 11, outcome: 'bad_test' }),
            ])
        ).toMatchObject([{ type: 'send_tests_back', ticket: 11, round: 1 }])
    })
})
