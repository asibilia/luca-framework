import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import type { DecisionModelClient } from './clef-client'
import { JEV_FIXED_MODEL } from './jev-jobs'
import type { JevAnswer, JevQuestion, JevRequest } from './jev-schemas'

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
 * without Jev, whatever Jev answers.
 *
 * Each run with Jev, and the same run without it, is built once (#566). A
 * Jev that throws, never answers, has no credentials, or has its token
 * turned down is checked on `shadowAsker` itself, in `jev-shadow.test.ts`:
 * it journals the failure and never throws, so the run goes on as here.
 */

/** A shadow-mode record: an ask, its reply, or the decision model turning off. */
const isJev = (record: JournalRecord): boolean =>
    record.kind.startsWith('jev_') || record.kind === 'decision_model_off'

/**
 * Launches with test-run timings (" [7.00ms]") removed and commit shas
 * (which carry the time) masked: a fix-loop follow-up quotes test output,
 * whose timings differ between two runs, and bun leaves the timing off a
 * test that runs very fast, so a timing is dropped whether or not it's there.
 */
const withoutTimings = (launches: PracticeRun['launches']) =>
    launches.map((launch) => ({
        ...launch,
        prompt: launch.prompt
            .replace(/ ?\[\d+(\.\d+)?m?s\]/g, '')
            .replace(/\b[0-9a-f]{40}\b/g, '[sha]'),
    }))

/**
 * Record kinds in order, but the final review's lenses run at once, so
 * the kinds between its start and its pass are sorted.
 */
const kindsInOrder = (records: JournalRecord[]): string[] => {
    const kinds = records
        .filter((record) => !isJev(record))
        .map(({ kind }) => kind)
    const from = kinds.indexOf('final_review_started')
    const to = kinds.indexOf('final_review_passed')
    if (from === -1 || to === -1) return kinds
    return [
        ...kinds.slice(0, from + 1),
        ...kinds.slice(from + 1, to).toSorted(),
        ...kinds.slice(to),
    ]
}

/**
 * Launches in order, but the final review's lenses (which start at once, in
 * any order) sorted by role, with their session numbers masked.
 */
const launchesInOrder = (launches: PracticeRun['launches']) => {
    const lens = (launch: PracticeRun['launches'][number]) =>
        launch.role.endsWith('-lens')
    return [
        ...launches.filter((launch) => !lens(launch)),
        ...launches
            .filter(lens)
            .map((launch) => ({
                ...launch,
                session_id: launch.session_id.replace(/-\d+$/, '-[n]'),
            }))
            .toSorted((left, right) => left.role.localeCompare(right.role)),
    ]
}

/** The run as it would look without Jev: the same steps, prompts, and PR. */
const expectSameRun = ({
    run,
    without,
}: {
    run: PracticeRun
    without: PracticeRun
}) => {
    expect(run.action).toEqual(without.action)
    expect(kindsInOrder(run.records)).toEqual(kindsInOrder(without.records))
    expect(withoutTimings(launchesInOrder(run.launches))).toEqual(
        withoutTimings(launchesInOrder(without.launches))
    )
    expect(run.tracker.pullRequests()).toEqual(without.tracker.pullRequests())
}

/** The model id the fake decision models say they are. */
const FAKE_MODEL = '@cf/cloudflare/clef'

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

/** Whether a request has a choice Clef refuses: fewer than two options (#546). */
const hasOneOptionChoice = (request: JevRequest): boolean =>
    Object.values(request.questions).some(
        (question) =>
            question.type === 'choice' &&
            Object.keys(question.criteria).length < 2
    )

const disagreeingJev = (): DecisionModelClient & {
    signals: AbortSignal[]
    requests: JevRequest[]
} => {
    const signals: AbortSignal[] = []
    const requests: JevRequest[] = []
    return {
        signals,
        requests,
        model: FAKE_MODEL,
        ask: async ({ request, signal }) => {
            signals.push(signal)
            requests.push(request)
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

/** A practice run with Jev, and the same run without it, built once. */
const shareRuns = ({ turns }: { turns: () => ScriptedTurn[] }) => {
    const shared: {
        roots: string[]
        jev?: ReturnType<typeof disagreeingJev>
        run?: PracticeRun
        without?: PracticeRun
    } = { roots: [] }
    beforeAll(async () => {
        const root = await mkdtemp(join(tmpdir(), 'luca-engine-jev-'))
        shared.roots.push(root)
        const jev = disagreeingJev()
        shared.jev = jev
        shared.run = await runPractice({
            root: join(root, 'with-jev'),
            turns: turns(),
            jev: { client: jev },
        })
        shared.without = await runPractice({
            root: join(root, 'without-jev'),
            turns: turns(),
        })
    }, 120_000)
    afterAll(async () => {
        await Promise.all(
            shared.roots.map((root) =>
                rm(root, { recursive: true, force: true })
            )
        )
    })
    return () => {
        const { jev, run, without } = shared
        if (jev === undefined || run === undefined || without === undefined) {
            throw new Error('The shared runs were not built.')
        }
        return { jev, run, without }
    }
}

describe('Jev in shadow mode on the happy run', () => {
    // The one-ticket happy run with a Jev that disagrees with everything,
    // and the same run without Jev, built once (#566).
    const happy = shareRuns({ turns: () => HAPPY_TURNS })

    test('is asked about order, model, and skills, and the engine ignores its answers', () => {
        const { run, jev, without } = happy()

        expect(run.action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        expectSameRun({ run, without })

        const asks = asked(run.records).filter(
            ({ content }) => content.job !== 'ticket_order'
        )
        expect(asks.map(({ content }) => content.job)).toEqual([
            'ticket_model',
            'agent_skills',
            'agent_skills',
            'agent_skills',
        ])
        expect(jev.signals).toHaveLength(asked(run.records).length)

        // Each ask is answered right away, linked by asked_seq, and both
        // name the model.
        for (const ask of asks) {
            expect(ask.content.model).toBe(FAKE_MODEL)
            const reply = replyTo(run.records, ask)
            expect(reply?.kind).toBe('jev_answered')
            expect(reply?.content).toMatchObject({
                job: ask.content.job,
                asked_seq: ask.seq,
                model: FAKE_MODEL,
                ms: expect.any(Number),
            })
            expect(reply?.ticket).toBe(11)
            expect(reply?.role).toBe(ask.role)
        }

        const [model, ...skills] = asks
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
    })

    test('with one ticket, asks no ticket order, sends no one-option choice, and journals no failure', () => {
        const { run, jev } = happy()

        expect(asked(run.records).map(({ content }) => content.job)).toEqual([
            'ticket_model',
            'agent_skills',
            'agent_skills',
            'agent_skills',
        ])
        expect(jev.signals).toHaveLength(4)
        expect(jev.requests.filter(hasOneOptionChoice)).toEqual([])
        expect(
            run.records.filter((record) => record.kind === 'jev_failed')
        ).toEqual([])
    })
})

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
