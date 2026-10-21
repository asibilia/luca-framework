import { describe, expect, test } from 'bun:test'

import { asked, expectSameRun, replyTo, shareRuns } from './jev-shadow-helpers'

import { HAPPY_TURNS, SUM_TEST } from '../testing/practice-repo'

/**
 * Seam B, the second run: the engine with a fake Jev in shadow mode, end to
 * end on a practice repo, on a run with a failed red check and review findings.
 * The first run, the happy one, is in `jev-shadow.e2e.test.ts`; the helpers
 * both share are in `jev-shadow-helpers.ts`.
 */

describe('Jev in shadow mode on a run with a failed red check and review findings', () => {
    // One run (and the same run without Jev), built once (#566): the
    // test-writer's first tests pass already, so the red check fails and
    // goes back to its session, which fixes them; then the reviewer reports
    // a should-fix and a nit, the implementer declines the should-fix, and
    // a re-review approves.
    const changes = shareRuns({
        turns: () => {
            const [testWriter, implementer] = HAPPY_TURNS
            if (!testWriter || !implementer) throw new Error('turns')
            return [
                {
                    ...testWriter,
                    files: {
                        'src/sum.test.ts': SUM_TEST.replace(
                            "import { sum } from './sum'",
                            'const sum = ({ numbers }: { numbers: number[] }) =>\n    numbers.reduce((a, b) => a + b, 0)'
                        ),
                    },
                },
                // The engine sends the failed red check back to the
                // test-writer's session, and this follow-up fixes the tests.
                testWriter,
                implementer,
                {
                    role: 'ticket-reviewer',
                    ticket: 11,
                    result: {
                        verdict: 'changes_requested',
                        findings: [
                            {
                                id: 'F-1',
                                severity: 'should_fix',
                                kind: 'code',
                                file: 'src/sum.ts',
                                title: 'The name is vague',
                                detail: 'Call it total.',
                            },
                            {
                                id: 'F2',
                                severity: 'nit',
                                kind: 'test',
                                title: 'A typo in a test name',
                            },
                        ],
                        summary: 'Two things to fix.',
                        assumptions: [],
                    },
                },
                {
                    role: 'implementer',
                    ticket: 11,
                    result: {
                        outcome: 'done',
                        finding_responses: [
                            {
                                finding_id: 'F-1',
                                response: 'wont_fix',
                                reason: 'The spec names it sum.',
                            },
                        ],
                    },
                },
                {
                    role: 'ticket-reviewer',
                    ticket: 11,
                    result: { verdict: 'approve', findings: [] },
                },
            ]
        },
    })

    test('is asked the severity of each finding a reviewer reports', () => {
        const { run, without } = changes()

        expect(run.action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        expectSameRun({ run, without })
        const severity = asked(run.records).filter(
            ({ content }) => content.job === 'finding_severity'
        )
        expect(severity).toHaveLength(1)
        const [ask] = severity
        expect(ask?.role).toBe('ticket-reviewer')
        expect(ask?.content.fixed).toEqual({
            finding_F_1: 'should_fix',
            finding_F2: 'nit',
        })
        expect(ask?.content.request.questions.finding_F_1).toMatchObject({
            type: 'score',
            criteria: ['nit', 'should_fix', 'blocker'],
        })
        expect(ask?.content.request.state.finding_F_1).toContain(
            'The name is vague'
        )
        expect(ask?.content.request.state.finding_F_1).toContain('src/sum.ts')
        expect(ask && replyTo(run.records, ask)?.kind).toBe('jev_answered')
        // It is asked after the review is journaled, before the run stops.
        const finished = run.records.find(
            (record) =>
                record.kind === 'agent_finished' &&
                record.role === 'ticket-reviewer'
        )
        expect((ask?.seq ?? 0) > (finished?.seq ?? Infinity)).toBe(true)
    })

    test("a fix-loop follow-up runs on its session's model, and its agent_started says so", () => {
        const { run } = changes()

        const followUps = run.launches.filter(
            ({ kind }) => kind === 'follow_up'
        )
        expect(followUps.map(({ role }) => role)).toEqual(['test-writer'])
        const session = run.launches.find(
            ({ kind, session_id }) =>
                kind === 'launch' && session_id === followUps[0]?.session_id
        )
        expect(session?.model).toBe('opus')
        expect(followUps.map(({ model }) => model)).toEqual(['opus'])
        const started = run.records.flatMap((record) =>
            record.kind === 'agent_started' && record.content.follow_up_of
                ? [record.content.model]
                : []
        )
        expect(started).toEqual(['opus'])
    })

    test('asks agent_model only before fresh test-writers and implementers: never a follow-up, the ticket reviewer, or a lens', () => {
        const { run } = changes()

        const models = asked(run.records).filter(
            ({ content }) => content.job === 'agent_model'
        )
        // The test-writer, the implementer, and the implementer answering
        // the review: the red check's follow-up and both reviews get none.
        expect(models.map(({ role }) => role)).toEqual([
            'test-writer',
            'implementer',
            'implementer',
        ])
        for (const model of models) {
            const next = run.records.find(
                (record) =>
                    record.kind === 'agent_started' && record.seq > model.seq
            )
            expect(next?.role).toBe(model.role)
            expect(
                next?.kind === 'agent_started' && next.content.follow_up_of
            ).toBeNull()
        }
        expect(
            asked(run.records).map(({ content }) => content.acted)
        ).not.toContain(true)
    })

    test('asks agent_effort only before fresh test-writers and implementers: never a follow-up, the ticket reviewer, or a lens', () => {
        const { run } = changes()

        const efforts = asked(run.records).filter(
            ({ content }) => content.job === 'agent_effort'
        )
        // The test-writer, the implementer, and the implementer answering
        // the review: the red check's follow-up, both reviews and the lenses
        // get none.
        expect(efforts.map(({ role }) => role)).toEqual([
            'test-writer',
            'implementer',
            'implementer',
        ])
        for (const effort of efforts) {
            const next = run.records.find(
                (record) =>
                    record.kind === 'agent_started' && record.seq > effort.seq
            )
            expect(next?.role).toBe(effort.role)
            expect(
                next?.kind === 'agent_started' && next.content.follow_up_of
            ).toBeNull()
            expect(effort.content.acted).toBe(false)
        }
    })

    test('is asked the kind of a failure, with the engine routing it to the test-writer', () => {
        const { run, without } = changes()

        expect(run.action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        const followUps = run.records.flatMap((record) =>
            record.kind === 'agent_started' && record.content.follow_up_of
                ? [record.role]
                : []
        )
        expect(followUps).toEqual(['test-writer'])
        expectSameRun({ run, without })
        const kinds = asked(run.records).filter(
            ({ content }) => content.job === 'failure_kind'
        )
        expect(kinds).toHaveLength(1)
        const [ask] = kinds
        expect(ask?.content.fixed).toEqual({ kind: 'test' })
        expect(ask?.content.request.state).toMatchObject({
            step: 'red_check',
            failure: expect.stringContaining('passes already'),
        })
        expect(ask?.content.request.questions.kind).toMatchObject({
            type: 'choice',
            criteria: { code: null, test: null, agent: null, clash: null },
        })
        const reply = ask && replyTo(run.records, ask)
        expect(reply?.kind === 'jev_answered' && reply.content.answers).toEqual(
            {
                kind: {
                    value: 'clash',
                    confidence: 0.7,
                    raw: { choice: 'clash', confidence: 0.7 },
                },
            }
        )
    })
})
