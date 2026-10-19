import { describe, expect, test } from 'bun:test'

import {
    twoSteps,
    oneSteps,
    gatesFailedForGood,
    emptyTestForGood,
} from './decide-stuck-helpers'

import type { JournalEntry } from '../journal/journal-record'
import {
    agentStarted,
    baselineTests,
    commentRead,
    gatesRun,
    implemented,
    practiceTicket,
    replyReceived,
    runBranchCreated,
    stuckReported,
    ticketBuilt,
    ticketRetried,
    ticketStuck,
    testsWritten,
    worktreeReset,
    ticketWorktreeCreated,
} from '../testing/build-fixtures'

/** Seam 1 for stuck work (#366): the owner's `retry` reply. */

describe('retry', () => {
    const retried = (mode: 'resume' | 'restart' | 'refused') => [
        runBranchCreated(),
        ...gatesFailedForGood(),
        stuckReported({ ticket: 11, comment_id: 111 }),
        commentRead({ comment_id: 120, body: 'retry' }),
        replyReceived({ word: 'retry', ticket: 11, comment_id: 120 }),
        ticketRetried({ ticket: 11, mode }),
    ]

    test('a retried bad test the engine found is told to the fresh agent without blaming the implementer (#581)', () => {
        const [step] = oneSteps([
            runBranchCreated(),
            ...emptyTestForGood(),
            stuckReported({ ticket: 11, comment_id: 111 }),
            commentRead({ comment_id: 120, body: 'retry' }),
            replyReceived({ word: 'retry', ticket: 11, comment_id: 120 }),
            ticketRetried({ ticket: 11, mode: 'resume' }),
        ])

        expect(step).toMatchObject({
            type: 'launch_agent',
            role: 'implementer',
        })
        const prompt = step?.type === 'launch_agent' ? step.prompt : ''
        expect(prompt).toContain(
            'A test was sent back as bad (by the implementer, or because it checks nothing)'
        )
        expect(prompt).not.toContain('The implementer sent a test back')
    })

    test('an unchanged ticket resumes with a fresh agent, told why it got stuck, not a follow-up in the old session', () => {
        const [step] = oneSteps(retried('resume'))
        expect(step).toMatchObject({
            type: 'launch_agent',
            ticket: 11,
            role: 'implementer',
        })
        const prompt = step?.type === 'launch_agent' ? step.prompt : ''
        expect(prompt).toContain('This ticket was retried')
        expect(prompt).toContain('keep their changes')
        expect(prompt).toContain('test: 1 fail')
    })

    test('run notes from earlier agents still reach the fresh agent after a retry', () => {
        const [step] = twoSteps([
            runBranchCreated(),
            ticketWorktreeCreated({ ticket: 12 }),
            baselineTests({ ticket: 12 }),
            testsWritten({
                ticket: 12,
                run_notes: ['Run lint with --fix before the gates.'],
            }),
            ...gatesFailedForGood(),
            stuckReported({ ticket: 11, comment_id: 111 }),
            replyReceived({ word: 'retry', ticket: 11, comment_id: 120 }),
            ticketRetried({ ticket: 11, mode: 'resume' }),
        ])
        expect(step).toMatchObject({ type: 'launch_agent', ticket: 11 })
        const prompt = step?.type === 'launch_agent' ? step.prompt : ''
        expect(prompt).toContain('## Run notes from earlier agents in this run')
        expect(prompt).toContain(
            'Run lint with --fix before the gates. (test-writer, #12)'
        )
        expect(prompt).toContain('This ticket was retried')
    })

    test('a resumed ticket gets fresh counts: failing gates go back to the fresh agent, not straight to stuck', () => {
        expect(
            oneSteps([
                ...retried('resume'),
                agentStarted({ ticket: 11, role: 'implementer' }),
                implemented({ ticket: 11, session_id: 'impl-2' }),
                gatesRun({ ticket: 11, target: 'ticket', ok: false }),
            ])
        ).toEqual([
            {
                type: 'follow_up_agent',
                ticket: 11,
                role: 'implementer',
                session_id: 'impl-2',
                message: expect.any(String),
            },
        ])
    })

    test('a resumed ticket that passes its gates goes on to its green commit', () => {
        expect(
            oneSteps([
                ...retried('resume'),
                agentStarted({ ticket: 11, role: 'implementer' }),
                implemented({ ticket: 11, session_id: 'impl-2' }),
                gatesRun({ ticket: 11, target: 'ticket', ok: true }),
            ])
        ).toEqual([
            {
                type: 'commit_ticket',
                ticket: 11,
                stage: 'green',
                message: 'feat: build #11 Add sum',
            },
        ])
    })

    test('a ticket whose text or labels changed starts over from scratch, from its new copy', () => {
        const refactor = practiceTicket({
            number: 11,
            title: 'Rename sum',
            labels: ['ready-for-agent', 'refactor'],
        })
        const restarted = [
            runBranchCreated(),
            ...gatesFailedForGood(),
            stuckReported({ ticket: 11, comment_id: 111 }),
            commentRead({ comment_id: 120, body: 'retry' }),
            replyReceived({ word: 'retry', ticket: 11, comment_id: 120 }),
            {
                kind: 'ticket_snapshot',
                ticket: 11,
                role: null,
                content: refactor,
            } satisfies JournalEntry,
            ticketRetried({ ticket: 11, mode: 'restart' }),
        ]
        expect(oneSteps(restarted)).toEqual([
            { type: 'install_dependencies', target: 'ticket', ticket: 11 },
        ])
        const [step] = oneSteps([
            ...restarted,
            {
                kind: 'dependencies_installed',
                ticket: 11,
                role: null,
                content: { target: 'ticket', check: null },
            },
            baselineTests({ ticket: 11 }),
        ])
        // The new copy is a refactor ticket: no test-writer, a fresh
        // implementer with the new title, and no retry note.
        expect(step).toMatchObject({
            type: 'launch_agent',
            role: 'implementer',
            may_edit_tests: true,
        })
        const prompt = step?.type === 'launch_agent' ? step.prompt : ''
        expect(prompt).toContain('Rename sum')
        expect(prompt).not.toContain('This ticket was retried')
    })

    test('a refused retry leaves the ticket stuck, waiting for the next reply', () => {
        expect(oneSteps(retried('refused'))).toEqual([
            { type: 'wait_for_reply', spec_number: 10, since_id: 120 },
        ])
    })

    test('a ticket stuck in its test step resumes with a fresh test-writer', () => {
        const [step] = oneSteps([
            runBranchCreated(),
            ticketWorktreeCreated({ ticket: 11 }),
            baselineTests({ ticket: 11 }),
            agentStarted({ ticket: 11, role: 'test-writer' }),
            testsWritten({ ticket: 11 }),
            ticketStuck({ ticket: 11, reason: 'red_check_failed' }),
            stuckReported({ ticket: 11 }),
            replyReceived({ word: 'retry', ticket: 11, comment_id: 120 }),
            ticketRetried({ ticket: 11, mode: 'resume' }),
        ])
        expect(step).toMatchObject({
            type: 'launch_agent',
            ticket: 11,
            role: 'test-writer',
        })
    })

    test('a test-writer retried after the engine found an empty test still hears the engine found it, not the implementer (#581)', () => {
        const [step] = oneSteps([
            runBranchCreated(),
            ticketWorktreeCreated({ ticket: 11 }),
            baselineTests({ ticket: 11 }),
            ...ticketBuilt({ ticket: 11 }).slice(2, 6),
            implemented({ ticket: 11 }),
            gatesRun({
                ticket: 11,
                target: 'ticket',
                ok: true,
                cases: [
                    {
                        file: 'src/sum.test.ts',
                        full_name: 'sum adds two numbers',
                        status: 'passed',
                        assertions: 0,
                    },
                ],
            }),
            worktreeReset({
                ticket: 11,
                bad_test: {
                    file: 'src/sum.test.ts',
                    name: 'sum adds two numbers',
                    reason: 'It passes but runs no expect(), so it checks nothing (#581).',
                },
            }),
            agentStarted({ ticket: 11, role: 'test-writer' }),
            ticketStuck({ ticket: 11, reason: 'red_check_failed' }),
            stuckReported({ ticket: 11 }),
            replyReceived({ word: 'retry', ticket: 11, comment_id: 120 }),
            ticketRetried({ ticket: 11, mode: 'resume' }),
        ])

        expect(step).toMatchObject({
            type: 'launch_agent',
            ticket: 11,
            role: 'test-writer',
        })
        const prompt = step?.type === 'launch_agent' ? step.prompt : ''
        expect(prompt).toContain('The engine found this test checks nothing')
        expect(prompt).not.toContain('The implementer says')
    })

    test('a ticket stuck after its join undid joins again on retry, with fresh rebases', () => {
        expect(
            twoSteps([
                runBranchCreated(),
                ...ticketBuilt({ ticket: 11 }).slice(0, 12),
                gatesRun({ ticket: 11, target: 'run_branch', ok: false }),
                ticketStuck({ ticket: 11, reason: 'join_gates_failed' }),
                {
                    kind: 'join_undone',
                    ticket: 11,
                    role: null,
                    content: { shas: ['r1', 'g1'] },
                },
                stuckReported({ ticket: 11 }),
                replyReceived({ word: 'retry', ticket: 11, comment_id: 120 }),
                ticketRetried({ ticket: 11, mode: 'resume' }),
            ])
        ).toEqual([{ type: 'join_run_branch', ticket: 11 }])
    })
})
