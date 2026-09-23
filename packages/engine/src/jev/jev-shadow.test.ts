import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, describe, expect, test } from 'bun:test'

import { createTypeSafeJev, type JevClient } from './jev-client'
import { JEV_FIXED_MODEL } from './jev-jobs'
import type { JevAnswer, JevQuestion } from './jev-schemas'

import type { ScriptedTurn } from '../agents/scripted-launcher'
import type { JournalRecord } from '../journal/journal-record'
import {
    HAPPY_TURNS,
    runPractice,
    SUM_TEST,
    type PracticeRun,
} from '../testing/practice-repo'

/**
 * Seam B: the engine with a fake Jev in shadow mode, end to end on a practice
 * repo. Jev is asked and journaled, but the run must go exactly as it does
 * without Jev, whatever Jev answers or however it fails.
 */

const roots: string[] = []

const newRoot = async (): Promise<string> => {
    const root = await mkdtemp(join(tmpdir(), 'luca-engine-jev-'))
    roots.push(root)
    return root
}

afterAll(async () => {
    await Promise.all(
        roots.map((root) => rm(root, { recursive: true, force: true }))
    )
})

/** Runs without Jev once per scenario; the Jev runs compare against it. */
const baselines = new Map<string, Promise<PracticeRun>>()

const baseline = ({
    name,
    turns,
}: {
    name: string
    turns: ScriptedTurn[]
}): Promise<PracticeRun> => {
    const known = baselines.get(name)
    if (known !== undefined) return known
    const run = newRoot().then((root) => runPractice({ root, turns }))
    baselines.set(name, run)
    return run
}

const isJev = (record: JournalRecord): boolean => record.kind.startsWith('jev_')

/**
 * Launches with test-run timings ("[7.00ms]") blanked out: a fix-loop
 * follow-up quotes test output, and its timings differ between two runs.
 */
const withoutTimings = (launches: PracticeRun['launches']) =>
    launches.map((launch) => ({
        ...launch,
        prompt: launch.prompt.replace(/\[\d+(\.\d+)?m?s\]/g, '[time]'),
    }))

/** The run as it would look without Jev: the same steps, prompts, and PR. */
const expectSameRun = ({
    run,
    without,
}: {
    run: PracticeRun
    without: PracticeRun
}) => {
    expect(run.action).toEqual(without.action)
    expect(
        run.records.filter((record) => !isJev(record)).map(({ kind }) => kind)
    ).toEqual(without.records.map(({ kind }) => kind))
    expect(withoutTimings(run.launches)).toEqual(
        withoutTimings(without.launches)
    )
    expect(run.tracker.pullRequests()).toEqual(without.tracker.pullRequests())
}

/**
 * A Jev that answers every question, and never as the engine would: the
 * last option of each choice, the top of each score, yes to every skill.
 */
const disagreeingAnswer = (question: JevQuestion): JevAnswer => {
    switch (question.type) {
        case 'choice': {
            const choice = Object.keys(question.criteria).at(-1) ?? null
            return {
                value: choice,
                confidence: 0.7,
                raw: { choice, confidence: 0.7 },
            }
        }
        case 'score': {
            const score = question.criteria.at(-1) ?? null
            return {
                value: score,
                confidence: 0.6,
                raw: { score, confidence: 0.6 },
            }
        }
        case 'noul':
            return { value: 0.95, confidence: null, raw: { probability: 0.95 } }
    }
}

const disagreeingJev = (): JevClient & { signals: AbortSignal[] } => {
    const signals: AbortSignal[] = []
    return {
        signals,
        ask: async ({ request, signal }) => {
            signals.push(signal)
            return {
                ok: true,
                answers: Object.fromEntries(
                    Object.entries(request.questions).map(([id, question]) => [
                        id,
                        disagreeingAnswer(question),
                    ])
                ),
            }
        },
    }
}

type Asked = Extract<JournalRecord, { kind: 'jev_asked' }>
type Answered = Extract<JournalRecord, { kind: 'jev_answered' }>
type Failed = Extract<JournalRecord, { kind: 'jev_failed' }>

const asked = (records: JournalRecord[]): Asked[] =>
    records.filter((record): record is Asked => record.kind === 'jev_asked')

/** The record right after each ask: its answer or its failure. */
const replyTo = (
    records: JournalRecord[],
    ask: Asked
): Answered | Failed | undefined => {
    const next = records[records.indexOf(ask) + 1]
    return next?.kind === 'jev_answered' || next?.kind === 'jev_failed'
        ? next
        : undefined
}

const SKILL_IDS = [
    'tdd',
    'systematic_debugging',
    'codebase_design',
    'domain_modeling',
]

describe('Jev in shadow mode', () => {
    test('is asked about order, model, and skills, and the engine ignores its answers', async () => {
        const jev = disagreeingJev()
        const run = await runPractice({
            root: await newRoot(),
            turns: HAPPY_TURNS,
            jev: { client: jev },
        })

        expect(run.action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        expectSameRun({
            run,
            without: await baseline({ name: 'happy', turns: HAPPY_TURNS }),
        })

        const asks = asked(run.records)
        expect(asks.map(({ content }) => content.job)).toEqual([
            'ticket_order',
            'ticket_model',
            'agent_skills',
            'agent_skills',
            'agent_skills',
        ])
        expect(jev.signals).toHaveLength(5)

        // Each ask is answered right away, linked by asked_seq.
        for (const ask of asks) {
            const reply = replyTo(run.records, ask)
            expect(reply?.kind).toBe('jev_answered')
            expect(reply?.content).toMatchObject({
                job: ask.content.job,
                asked_seq: ask.seq,
                ms: expect.any(Number),
            })
            expect(reply?.ticket).toBe(11)
            expect(reply?.role).toBe(ask.role)
        }

        const [order, model, ...skills] = asks
        expect(order?.content.request.questions).toEqual({
            next: {
                type: 'choice',
                instructions: 'Which of these tickets should be built next?',
                criteria: { ticket_11: null },
            },
        })
        expect(order?.content.request.state.candidates).toContain(
            'ticket_11: #11 Add sum'
        )
        expect(order?.content.fixed).toEqual({ next: 'ticket_11' })

        expect(model?.content.fixed).toEqual({ model: JEV_FIXED_MODEL })
        expect(model?.content.request.state).toMatchObject({
            spec: 'Practice spec',
            ticket: '#11 Add sum',
        })
        const modelReply = model && replyTo(run.records, model)
        expect(
            modelReply?.kind === 'jev_answered' && modelReply.content.answers
        ).toEqual({
            model: {
                value: 'claude-haiku-4-5',
                confidence: 0.7,
                raw: { choice: 'claude-haiku-4-5', confidence: 0.7 },
            },
        })

        // One skills ask per agent, just before it starts, all fixed at no.
        expect(skills.map(({ role }) => role)).toEqual([
            'test-writer',
            'implementer',
            'ticket-reviewer',
        ])
        for (const skill of skills) {
            expect(Object.keys(skill.content.request.questions)).toEqual(
                SKILL_IDS
            )
            expect(skill.content.fixed).toEqual(
                Object.fromEntries(SKILL_IDS.map((id) => [id, false]))
            )
            const reply = replyTo(run.records, skill)
            expect(
                reply?.kind === 'jev_answered' && reply.content.answers.tdd
            ).toMatchObject({ value: 0.95, confidence: null })
            const started = run.records.find(
                (record) =>
                    record.kind === 'agent_started' && record.seq > skill.seq
            )
            expect(started?.role).toBe(skill.role)
        }
    }, 60_000)

    test('is asked the severity of each finding a reviewer reports', async () => {
        const [testWriter, implementer] = HAPPY_TURNS
        if (!testWriter || !implementer) throw new Error('turns')
        const turns: ScriptedTurn[] = [
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
        ]

        const run = await runPractice({
            root: await newRoot(),
            turns,
            jev: { client: disagreeingJev() },
        })

        expect(run.action).toMatchObject({
            type: 'done',
            outcome: 'stuck',
            reason: 'changes_requested',
        })
        expectSameRun({
            run,
            without: await baseline({ name: 'changes', turns }),
        })
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
    }, 60_000)

    test('is asked the kind of a failure, with the engine routing it to the test-writer', async () => {
        const [testWriter, implementer, reviewer] = HAPPY_TURNS
        if (!testWriter || !implementer || !reviewer) throw new Error('turns')
        const turns: ScriptedTurn[] = [
            {
                ...testWriter,
                files: {
                    'src/sum.test.ts': SUM_TEST.replace(
                        "import { sum } from './sum'",
                        'const sum = ({ numbers }: { numbers: number[] }) =>\n    numbers.reduce((a, b) => a + b, 0)'
                    ),
                },
            },
            // The engine sends the failed red check back to the test-writer's
            // session, and this follow-up fixes the tests.
            testWriter,
            implementer,
            reviewer,
        ]

        const run = await runPractice({
            root: await newRoot(),
            turns,
            jev: { client: disagreeingJev() },
        })

        expect(run.action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        const followUps = run.records.flatMap((record) =>
            record.kind === 'agent_started' && record.content.follow_up_of
                ? [record.role]
                : []
        )
        expect(followUps).toEqual(['test-writer'])
        expectSameRun({
            run,
            without: await baseline({ name: 'red', turns }),
        })
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
    }, 60_000)

    const failingJevs: {
        name: string
        reason: 'error' | 'timeout' | 'missing_key'
        jev: () => JevClient & { calls: () => number }
    }[] = [
        {
            name: 'a Jev that throws',
            reason: 'error',
            jev: () => {
                let calls = 0
                return {
                    calls: () => calls,
                    ask: async () => {
                        calls += 1
                        throw new Error('Jev fell over')
                    },
                }
            },
        },
        {
            name: 'a Jev that never answers',
            reason: 'timeout',
            jev: () => {
                let calls = 0
                return {
                    calls: () => calls,
                    // It ignores the abort signal; the timeout still cuts it off.
                    ask: () => {
                        calls += 1
                        return new Promise(() => {})
                    },
                }
            },
        },
        {
            name: 'the TypeSafe client with no key',
            reason: 'missing_key',
            jev: () => {
                let calls = 0
                return {
                    calls: () => calls,
                    ...createTypeSafeJev({
                        api_key: '',
                        fetch: async () => {
                            calls += 1
                            throw new Error('fetch must not be called')
                        },
                    }),
                }
            },
        },
    ]

    for (const { name, reason, jev } of failingJevs) {
        test(`${name} is journaled as ${reason} and the run goes on`, async () => {
            const client = jev()
            const run = await runPractice({
                root: await newRoot(),
                turns: HAPPY_TURNS,
                jev: { client, timeout_ms: 50 },
            })

            expectSameRun({
                run,
                without: await baseline({ name: 'happy', turns: HAPPY_TURNS }),
            })
            const asks = asked(run.records)
            expect(asks).toHaveLength(5)
            for (const ask of asks) {
                const reply = replyTo(run.records, ask)
                expect(reply?.kind).toBe('jev_failed')
                expect(reply?.content).toMatchObject({
                    job: ask.content.job,
                    asked_seq: ask.seq,
                    reason,
                    error: expect.any(String),
                })
            }
            expect(
                run.records.some((record) => record.kind === 'jev_answered')
            ).toBe(false)
            expect(client.calls()).toBe(reason === 'missing_key' ? 0 : 5)
        }, 60_000)
    }
})
