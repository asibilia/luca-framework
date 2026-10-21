import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import { LENS_ROLES, lensRole, type LensName } from '../agents/role-results'
import type { ScriptedCall, ScriptedTurn } from '../agents/scripted-launcher'
import type { DecisionModelClient } from '../jev/clef-client'
import type { JevAnswer, JevQuestion } from '../jev/jev-schemas'
import type { JournalRecord } from '../journal/journal-record'
import { createFakeMuninn } from '../testing/fake-muninn'
import {
    createPracticeRepo,
    happyTurns,
    IMPLEMENTER_RESULT,
    PRACTICE_ENGINE_CONFIG,
    SUM,
    SUM_TEST,
    TEST_WRITER_RESULT,
    type PracticeRun,
} from '../testing/practice-repo'

/**
 * Seam B for effort per role (#659): the engine end to end on the practice
 * repo, with scripted agents (the scripted launcher records the effort each
 * launch asked for, and a follow-up's session's) and no effort settings.
 * One run, built once and shared (#566): the decision model routes the
 * test-writer to sonnet; ticket #11's implementer fails the gates once and
 * fixes them in a follow-up; the final review's round 1 sends a test and a
 * code finding to both fixers; the fresh pass's (#548) code finding goes to
 * an implementer that fails the gates once and fixes them in a follow-up;
 * memory is on, so the learner runs.
 */

/** Any valid answer, for the questions other than the test-writer's model. */
const anyAnswer = (question: JevQuestion): JevAnswer => {
    switch (question.type) {
        case 'choice': {
            const choice = Object.keys(question.criteria)[0] ?? null
            return { value: choice, confidence: 0.9, raw: { choice } }
        }
        case 'score': {
            const score = question.criteria[0] ?? null
            return { value: score, confidence: 0.9, raw: { score } }
        }
        case 'noul':
            return { value: 0.1, confidence: null, raw: { probability: 0.1 } }
    }
}

/** A decision model sure the test-writer should run on sonnet. */
const SONNET_FOR_THE_TEST_WRITER: DecisionModelClient = {
    model: '@cf/cloudflare/clef',
    ask: async ({ request }) => ({
        ok: true,
        answers: Object.fromEntries(
            Object.entries(request.questions).map(([id, question]) => [
                id,
                id === 'model' && request.state.role === 'test-writer'
                    ? {
                          value: 'sonnet',
                          confidence: 0.9,
                          raw: { choice: 'sonnet' },
                      }
                    : anyAnswer(question),
            ])
        ),
    }),
}

/** A lens turn of spec #10 with these findings (none: it approves). */
const lensTurn = (lens: LensName, findings: object[] = []): ScriptedTurn => ({
    role: lensRole({ lens }),
    ticket: 10,
    result: {
        verdict: findings.length > 0 ? 'changes_requested' : 'approve',
        findings,
        summary: `The ${lens} lens looked.`,
        assumptions: [],
    },
})

/** A final review fixer's result, answering `finding_id` as fixed. */
const fixed = (result: object, finding_id: string) => ({
    ...result,
    finding_responses: [{ finding_id, response: 'fixed', reason: '' }],
})

const RENAMED_SUM = SUM.replaceAll('total', 'running')

/** Subtracts: the fresh pass's fixer's first try, which fails the gates. */
const BROKEN_SUM = RENAMED_SUM.replace('running + each', 'running - each')

const DOCUMENTED_SUM = `/** Adds the numbers; past Number.MAX_SAFE_INTEGER the total loses precision. */
${RENAMED_SUM}`

const { testWriter, implementer, reviewer } = happyTurns()

const TURNS: ScriptedTurn[] = [
    testWriter,
    {
        ...implementer,
        files: {
            'src/sum.ts': 'export const sum = (): number => 42\n',
            'src/index.ts': "export { sum } from './sum'\n",
        },
    },
    implementer,
    reviewer,
    // Round 1: a test finding and a code finding.
    lensTurn('architecture', [
        {
            id: 'A1',
            severity: 'blocker',
            kind: 'test',
            file: 'src/sum.test.ts',
            title: 'No test adds negative numbers',
            detail: 'Add one.',
        },
    ]),
    lensTurn('security', [
        {
            id: 'S1',
            severity: 'should_fix',
            kind: 'code',
            file: 'src/sum.ts',
            title: 'Name the accumulator for what it holds',
            detail: 'total reads like the result.',
        },
    ]),
    {
        role: 'test-writer',
        ticket: 10,
        files: {
            'src/sum.test.ts': SUM_TEST.replace(
                "    test('of no numbers is zero'",
                "    test('adds negative numbers', () => {\n        expect(sum({ numbers: [-1, -2] })).toBe(-3)\n    })\n\n    test('of no numbers is zero'"
            ),
        },
        result: fixed(TEST_WRITER_RESULT, 'architecture-A1'),
    },
    {
        role: 'implementer',
        ticket: 10,
        files: { 'src/sum.ts': RENAMED_SUM },
        result: fixed(IMPLEMENTER_RESULT, 'security-S1'),
    },
    // Round 2, the re-review.
    lensTurn('architecture'),
    lensTurn('security'),
    // The fresh pass; the other lenses fall back on clean turns.
    lensTurn('security', [
        {
            id: 'S2',
            severity: 'blocker',
            kind: 'code',
            file: 'src/sum.ts',
            title: 'Sum loses precision past the safe integers',
            detail: 'Large totals round silently.',
        },
    ]),
    {
        role: 'implementer',
        ticket: 10,
        files: { 'src/sum.ts': BROKEN_SUM },
        result: fixed(IMPLEMENTER_RESULT, 'security-S2'),
    },
    {
        role: 'implementer',
        ticket: 10,
        files: { 'src/sum.ts': DOCUMENTED_SUM },
        result: fixed(IMPLEMENTER_RESULT, 'security-S2'),
    },
    // The re-check.
    lensTurn('security'),
]

/** The effort a call or a record's content names, or `null` for none. */
const effortOf = (value: object): unknown =>
    'effort' in value ? value.effort : null

/** Each scripted call as `<kind> <role> #<ticket> <effort>`. */
const callLines = (calls: ScriptedCall[]) =>
    calls.map(
        (call) =>
            `${call.kind} ${call.role} #${call.ticket} ${String(effortOf(call))}`
    )

/** Each `agent_started` as `<kind> <role> <effort>`, `launch` or `follow_up`. */
const startedLines = (records: JournalRecord[]) =>
    records.flatMap((record) =>
        record.kind === 'agent_started'
            ? [
                  `${record.content.follow_up_of === null ? 'launch' : 'follow_up'} ${record.content.role} ${String(effortOf(record.content))}`,
              ]
            : []
    )

const isReviewer = (role: string) =>
    role === 'ticket-reviewer' || role.endsWith('-lens')

describe('effort per role, end to end, with no effort settings (#659)', () => {
    let root = ''
    let built: PracticeRun | undefined
    beforeAll(async () => {
        root = await mkdtemp(join(tmpdir(), 'luca-engine-effort-'))
        const practice = await createPracticeRepo({
            root,
            config: {
                ...PRACTICE_ENGINE_CONFIG,
                models: { floors: { 'test-writer': 'sonnet' } },
            },
        })
        const ran = await practice.run({
            turns: TURNS,
            jev: { client: SONNET_FOR_THE_TEST_WRITER },
            memory: { client: createFakeMuninn(), project_vault: null },
        })
        built = { ...ran, origin: practice.origin }
    }, 180_000)
    afterAll(async () => {
        await rm(root, { recursive: true, force: true })
    })
    const run = (): PracticeRun => {
        if (built === undefined) throw new Error('The run was not built.')
        return built
    }

    test("the test-writer and the implementer on a ticket launch at medium, and so does the implementer's fix-loop follow-up", () => {
        const { action, launches, records } = run()

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        expect(
            callLines(
                launches.filter(
                    ({ ticket, role }) => ticket === 11 && !isReviewer(role)
                )
            )
        ).toEqual([
            'launch test-writer #11 medium',
            'launch implementer #11 medium',
            'follow_up implementer #11 medium',
        ])
        expect(
            startedLines(records.filter(({ ticket }) => ticket === 11))
        ).toEqual(
            expect.arrayContaining([
                'launch test-writer medium',
                'launch implementer medium',
                'follow_up implementer medium',
            ])
        )
    })

    test('the learner launches at medium', () => {
        const { launches, records } = run()
        const learner = launches.filter(({ role }) => role === 'learner')

        expect(callLines(learner)).toEqual(['launch learner #10 medium'])
        expect(
            startedLines(records.filter(({ role }) => role === 'learner'))
        ).toEqual(['launch learner medium'])
    })

    test('the ticket reviewer and each of the five lenses launch at xhigh, in every round', () => {
        const { launches } = run()
        const reviewers = launches.filter(({ role }) => isReviewer(role))

        expect(new Set(reviewers.map(({ role }) => role))).toEqual(
            new Set(['ticket-reviewer', ...LENS_ROLES])
        )
        expect(reviewers.map(effortOf)).toEqual(reviewers.map(() => 'xhigh'))
    })

    test("the final review's fixers launch at xhigh, the fresh pass's fix round included", () => {
        const { launches, records } = run()
        const fresh = records.some(
            (record) =>
                record.kind === 'final_review_started' && record.content.fresh
        )

        expect(fresh).toBe(true)
        expect(
            callLines(
                launches.filter(
                    ({ kind, ticket, role }) =>
                        kind === 'launch' &&
                        ticket === 10 &&
                        (role === 'test-writer' || role === 'implementer')
                )
            )
        ).toEqual([
            'launch test-writer #10 xhigh',
            'launch implementer #10 xhigh',
            'launch implementer #10 xhigh',
        ])
    })

    test('a test-writer the decision model routes to sonnet launches at medium', () => {
        const { launches, records } = run()
        const call = launches.find(
            ({ kind, role, ticket }) =>
                kind === 'launch' && role === 'test-writer' && ticket === 11
        )
        const started = records.find(
            (record) =>
                record.kind === 'agent_started' &&
                record.ticket === 11 &&
                record.content.role === 'test-writer'
        )

        expect(call?.model).toBe('sonnet')
        expect(call === undefined ? null : effortOf(call)).toBe('medium')
        expect(started?.content).toMatchObject({
            model: 'sonnet',
            model_reason: 'decision_model',
            effort: 'medium',
        })
    })

    test("a fix-loop follow-up runs at its session's effort: medium on a ticket, xhigh in a final review fixer's", () => {
        const { launches, records } = run()
        const writerFollowUps = launches.filter(
            ({ kind, role }) => kind === 'follow_up' && !isReviewer(role)
        )

        expect(callLines(writerFollowUps)).toEqual([
            'follow_up implementer #11 medium',
            'follow_up implementer #10 xhigh',
        ])
        expect(
            startedLines(records).filter((line) =>
                /^follow_up (test-writer|implementer) /.test(line)
            )
        ).toEqual([
            'follow_up implementer medium',
            'follow_up implementer xhigh',
        ])
    })

    test('every agent_started records the effort its agent ran at', () => {
        const { launches, records } = run()
        const fromCalls = launches.map(
            (call) => `${call.kind} ${call.role} ${String(effortOf(call))}`
        )

        expect(startedLines(records).toSorted()).toEqual(fromCalls.toSorted())
        expect(
            startedLines(records).some((line) => line.endsWith(' null'))
        ).toBe(false)
    })
})
