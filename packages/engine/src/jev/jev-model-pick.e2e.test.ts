import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import type { DecisionModelClient, DecisionModelReply } from './clef-client'
import type { JevAnswer, JevQuestion } from './jev-schemas'
import type { JevShadow } from './jev-shadow'

import { LENS_ROLES, lensRole, type LensName } from '../agents/role-results'
import type { ScriptedTurn } from '../agents/scripted-launcher'
import type { JournalRecord } from '../journal/journal-record'
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
 * Seam B for model floors (#603): the engine end to end on the practice
 * repo, with a fake decision model and the scripted launcher, which records
 * the model each launch asked for. Each run is built once and shared across
 * its cases (#566).
 */

/** What the fake decision model does with one role's `agent_model` ask. */
type ModelReply = { pick: string; confidence: number | null } | 'throw' | 'hang'

/** Any valid answer, for the questions other than the model. */
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

/** A decision model that answers each role's model ask as `models` says. */
const fakeClef = (models: Record<string, ModelReply>): DecisionModelClient => ({
    model: '@cf/cloudflare/clef',
    ask: async ({ request, signal }): Promise<DecisionModelReply> => {
        const reply =
            'model' in request.questions
                ? models[request.state.role ?? '']
                : undefined
        if (reply === 'throw') throw new Error('Clef broke.')
        if (reply === 'hang') {
            return new Promise((resolve) => {
                signal.addEventListener('abort', () =>
                    resolve({ ok: false, reason: 'error', error: 'aborted' })
                )
            })
        }
        return {
            ok: true,
            answers: Object.fromEntries(
                Object.entries(request.questions).map(([id, question]) => [
                    id,
                    id === 'model' && reply !== undefined
                        ? {
                              value: reply.pick,
                              confidence: reply.confidence,
                              raw: { choice: reply.pick },
                          }
                        : anyAnswer(question),
                ])
            ),
        }
    },
})

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

/**
 * The happy ticket, then a final review with a test and a code finding,
 * so both final-review fixers launch, then a clean re-review.
 */
const FIXER_TURNS: ScriptedTurn[] = [
    ...Object.values(happyTurns()),
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
        result: {
            ...TEST_WRITER_RESULT,
            finding_responses: [
                {
                    finding_id: 'architecture-A1',
                    response: 'fixed',
                    reason: '',
                },
            ],
        },
    },
    {
        role: 'implementer',
        ticket: 10,
        files: { 'src/sum.ts': SUM.replaceAll('total', 'running') },
        result: {
            ...IMPLEMENTER_RESULT,
            finding_responses: [
                { finding_id: 'security-S1', response: 'fixed', reason: '' },
            ],
        },
    },
    lensTurn('architecture'),
    lensTurn('security'),
]

/** One practice run with this config's `models` block, built once. */
const shareRun = ({
    models,
    jev,
    turns,
}: {
    models?: object
    jev?: JevShadow
    turns?: ScriptedTurn[]
}): (() => PracticeRun) => {
    let root = ''
    let run: PracticeRun | undefined
    beforeAll(async () => {
        root = await mkdtemp(join(tmpdir(), 'luca-engine-model-pick-'))
        const practice = await createPracticeRepo({
            root,
            config: {
                ...PRACTICE_ENGINE_CONFIG,
                ...(models === undefined ? {} : { models }),
            },
        })
        const ran = await practice.run({
            turns: turns ?? Object.values(happyTurns()),
            jev,
        })
        run = { ...ran, origin: practice.origin }
    }, 120_000)
    afterAll(async () => {
        await rm(root, { recursive: true, force: true })
    })
    return () => {
        if (run === undefined) throw new Error('The run was not built.')
        return run
    }
}

/** Each fresh agent's start: its role, ticket, model, and model reason. */
const starts = (records: JournalRecord[]) =>
    records.flatMap((record) =>
        record.kind === 'agent_started' && record.content.follow_up_of === null
            ? [
                  {
                      role: record.role,
                      ticket: record.ticket,
                      model: record.content.model,
                      model_reason:
                          'model_reason' in record.content
                              ? record.content.model_reason
                              : undefined,
                  },
              ]
            : []
    )

/** The fresh start of `role` on ticket #11. */
const startOf = (run: PracticeRun, role: string) =>
    starts(run.records).find(
        (start) => start.role === role && start.ticket === 11
    )

/** The model the scripted launcher was asked for by `role`'s first launch. */
const launchedOn = (run: PracticeRun, role: string, ticket = 11) =>
    run.launches.find(
        (launch) =>
            launch.kind === 'launch' &&
            launch.role === role &&
            launch.ticket === ticket
    )?.model

/** Each `agent_model` ask's role, sorted options, and `acted`. */
const modelAsks = (records: JournalRecord[]) =>
    records.flatMap((record) => {
        if (record.kind !== 'jev_asked') return []
        if (record.content.job !== 'agent_model') return []
        const model = record.content.request.questions.model
        return [
            {
                role: record.role,
                options:
                    model?.type === 'choice'
                        ? Object.keys(model.criteria).toSorted()
                        : [],
                acted: record.content.acted,
            },
        ]
    })

const SONNET_FLOORS = {
    floors: { 'test-writer': 'sonnet', implementer: 'sonnet' },
}

describe('model floors with a sure decision model (#603)', () => {
    // The test-writer's pick is offered and sure; the implementer's is
    // haiku, below its floor, so it wasn't offered.
    const routed = shareRun({
        models: SONNET_FLOORS,
        jev: {
            client: fakeClef({
                'test-writer': { pick: 'sonnet', confidence: 0.9 },
                implementer: { pick: 'haiku', confidence: 0.99 },
            }),
        },
        turns: FIXER_TURNS,
    })

    test("the test-writer launches on the decision model's sure pick of sonnet, with reason decision_model", () => {
        const run = routed()

        expect(run.action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        expect(launchedOn(run, 'test-writer')).toBe('sonnet')
        expect(startOf(run, 'test-writer')).toMatchObject({
            model: 'sonnet',
            model_reason: 'decision_model',
        })
    })

    test("a test-writer routed to sonnet launches at medium, its role's effort on any model (#659)", () => {
        const run = routed()

        const writer = run.launches.find(
            ({ kind, role, ticket }) =>
                kind === 'launch' && role === 'test-writer' && ticket === 11
        )
        expect(writer).toMatchObject({ model: 'sonnet', effort: 'medium' })
        const started = run.records.find(
            (record) =>
                record.kind === 'agent_started' &&
                record.role === 'test-writer' &&
                record.ticket === 11
        )
        expect(started?.content).toMatchObject({
            model: 'sonnet',
            effort: 'medium',
        })
    })

    test('the ticket reviewer and every lens launch on opus with reason locked, whatever the decision model answers', () => {
        const run = routed()

        const reviewers = starts(run.records).filter(
            ({ role }) =>
                role === 'ticket-reviewer' ||
                (LENS_ROLES as readonly (string | null)[]).includes(role)
        )
        expect(
            reviewers.map(({ role }) => role).filter((role) => role !== null)
        ).toEqual(expect.arrayContaining(['ticket-reviewer', ...LENS_ROLES]))
        for (const reviewer of reviewers) {
            expect(reviewer).toMatchObject({
                model: 'opus',
                model_reason: 'locked',
            })
        }
        const launched = run.launches.filter(
            ({ kind, role }) =>
                kind === 'launch' &&
                (role === 'ticket-reviewer' || role.endsWith('-lens'))
        )
        expect(new Set(launched.map(({ model }) => model))).toEqual(
            new Set(['opus'])
        )
    })

    test('an answer the ask did not offer runs opus, with reason unsure', () => {
        const run = routed()

        expect(launchedOn(run, 'implementer')).toBe('opus')
        expect(startOf(run, 'implementer')).toMatchObject({
            model: 'opus',
            model_reason: 'unsure',
        })
    })

    test('each ask offers only the models at or above the floor, journaled with acted true', () => {
        const run = routed()

        expect(modelAsks(run.records)).toEqual([
            { role: 'test-writer', options: ['opus', 'sonnet'], acted: true },
            { role: 'implementer', options: ['opus', 'sonnet'], acted: true },
        ])
    })

    test("the final review's fixers launch on opus, though their floors are sonnet", () => {
        const run = routed()

        const fixers = starts(run.records).filter(
            ({ role, ticket }) =>
                ticket === null &&
                (role === 'test-writer' || role === 'implementer')
        )
        expect(fixers.map(({ role }) => role)).toEqual([
            'test-writer',
            'implementer',
        ])
        expect(launchedOn(run, 'test-writer', 10)).toBe('opus')
        expect(launchedOn(run, 'implementer', 10)).toBe('opus')
        for (const fixer of fixers) {
            expect(fixer).toMatchObject({
                model: 'opus',
                model_reason: 'locked',
            })
        }
    })
})

describe('model floors with a doubtful decision model (#603)', () => {
    // A bar of 0.95: the test-writer's 0.9 is below it; the implementer's
    // pick comes with no confidence at all.
    const doubtful = shareRun({
        models: {
            floors: { 'test-writer': 'sonnet', implementer: 'haiku' },
            confidence_bar: 0.95,
        },
        jev: {
            client: fakeClef({
                'test-writer': { pick: 'sonnet', confidence: 0.9 },
                implementer: { pick: 'haiku', confidence: null },
            }),
        },
    })

    test('confidence below the bar, or missing, runs opus with reason unsure', () => {
        const run = doubtful()

        expect(run.action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        for (const role of ['test-writer', 'implementer']) {
            expect(launchedOn(run, role)).toBe('opus')
            expect(startOf(run, role)).toMatchObject({
                model: 'opus',
                model_reason: 'unsure',
            })
        }
    })

    test('a haiku floor offers all three models, with acted true', () => {
        const run = doubtful()

        expect(modelAsks(run.records)).toEqual([
            { role: 'test-writer', options: ['opus', 'sonnet'], acted: true },
            {
                role: 'implementer',
                options: ['haiku', 'opus', 'sonnet'],
                acted: true,
            },
        ])
    })
})

describe('model floors with no answer from the decision model (#603)', () => {
    // The test-writer's ask throws and the implementer's never answers.
    const failing = shareRun({
        models: SONNET_FLOORS,
        jev: {
            client: fakeClef({ 'test-writer': 'throw', implementer: 'hang' }),
            timeout_ms: 200,
        },
    })
    // No decision model at all: it is off for the run.
    const off = shareRun({ models: SONNET_FLOORS })

    test('a decision model that errors or times out runs opus, with reason no_answer', () => {
        const run = failing()

        expect(run.action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        const failed = run.records.flatMap((record) =>
            record.kind === 'jev_failed' && record.content.job === 'agent_model'
                ? [{ role: record.role, reason: record.content.reason }]
                : []
        )
        expect(failed).toEqual([
            { role: 'test-writer', reason: 'error' },
            { role: 'implementer', reason: 'timeout' },
        ])
        for (const role of ['test-writer', 'implementer']) {
            expect(launchedOn(run, role)).toBe('opus')
            expect(startOf(run, role)).toMatchObject({
                model: 'opus',
                model_reason: 'no_answer',
            })
        }
    })

    test('a decision model that is off runs opus, with reason no_answer', () => {
        const run = off()

        expect(run.action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        for (const role of ['test-writer', 'implementer']) {
            expect(launchedOn(run, role)).toBe('opus')
            expect(startOf(run, role)).toMatchObject({
                model: 'opus',
                model_reason: 'no_answer',
            })
        }
    })
})

describe('no models block (#603)', () => {
    // Every floor is opus, so a sure pick of haiku is only shadow.
    const unset = shareRun({
        jev: {
            client: fakeClef({
                'test-writer': { pick: 'haiku', confidence: 0.99 },
                implementer: { pick: 'haiku', confidence: 0.99 },
            }),
        },
    })

    test('a floor of opus runs opus with reason floor, and the ask is journaled with acted false and all three models', () => {
        const run = unset()

        for (const role of ['test-writer', 'implementer']) {
            expect(startOf(run, role)).toMatchObject({
                model: 'opus',
                model_reason: 'floor',
            })
        }
        expect(modelAsks(run.records)).toEqual([
            {
                role: 'test-writer',
                options: ['haiku', 'opus', 'sonnet'],
                acted: false,
            },
            {
                role: 'implementer',
                options: ['haiku', 'opus', 'sonnet'],
                acted: false,
            },
        ])
    })

    test('every launch is on opus, and every agent_started names its reason', () => {
        const run = unset()

        expect(run.action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        expect(new Set(run.launches.map(({ model }) => model))).toEqual(
            new Set(['opus'])
        )
        expect(
            starts(run.records).map(({ role, model_reason }) => ({
                role,
                model_reason,
            }))
        ).toEqual(
            expect.arrayContaining([
                { role: 'test-writer', model_reason: 'floor' },
                { role: 'implementer', model_reason: 'floor' },
                { role: 'ticket-reviewer', model_reason: 'locked' },
                { role: 'rules-lens', model_reason: 'locked' },
            ])
        )
    })
})
