import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import type { DecisionModelClient, DecisionModelReply } from './clef-client'
import type { JevAnswer, JevQuestion } from './jev-schemas'

import type { ScriptedTurn } from '../agents/scripted-launcher'
import {
    createPracticeRepo,
    happyTurns,
    PRACTICE_ENGINE_CONFIG,
    type PracticeRun,
} from '../testing/practice-repo'

/**
 * Seam B for the model trial (#698): the engine end to end on the practice
 * repo, with a fake decision model unsure of a sonnet pick for the
 * test-writer, a trial share of 1, and the scripted launcher. The run is
 * built once and shared across its cases (#566).
 */

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

/** A decision model that picks sonnet for every model ask, at 0.2. */
const unsureClef: DecisionModelClient = {
    model: '@cf/cloudflare/clef',
    ask: async ({ request }): Promise<DecisionModelReply> => ({
        ok: true,
        answers: Object.fromEntries(
            Object.entries(request.questions).map(([id, question]) => [
                id,
                id === 'model'
                    ? {
                          value: 'sonnet',
                          confidence: 0.2,
                          raw: { choice: 'sonnet' },
                      }
                    : anyAnswer(question),
            ])
        ),
    }),
}

/** A scripted test-writer turn on #11 that fails this way. */
const failingWriter = (failure: 'agent' | 'engine'): ScriptedTurn => ({
    role: 'test-writer',
    ticket: 11,
    failure,
    error:
        failure === 'engine'
            ? 'The SDK process crashed.'
            : 'The agent ran out of turns.',
})

describe('a model trial with a trial share of 1 (#698)', () => {
    // #11's test-writer: a sonnet try that fails, its follow-up cut off by
    // an engine failure, then a fresh agent that writes the tests.
    let root = ''
    let run: PracticeRun | undefined
    beforeAll(async () => {
        root = await mkdtemp(join(tmpdir(), 'luca-engine-model-trial-'))
        const practice = await createPracticeRepo({
            root,
            config: {
                ...PRACTICE_ENGINE_CONFIG,
                models: {
                    floors: { 'test-writer': 'sonnet' },
                    trial_share: 1,
                },
            },
        })
        const ran = await practice.run({
            turns: [
                failingWriter('agent'),
                failingWriter('engine'),
                ...Object.values(happyTurns()),
            ],
            jev: { client: unsureClef },
        })
        run = { ...ran, origin: practice.origin }
    }, 120_000)
    afterAll(async () => {
        await rm(root, { recursive: true, force: true })
    })

    test("the test-writer's first launch runs on sonnet in the trial group, and after that try fails the next launch is opus with after_failure, in no group", () => {
        if (run === undefined) throw new Error('The run was not built.')
        const fresh = run.records.flatMap((record) =>
            record.kind === 'agent_started' &&
            record.role === 'test-writer' &&
            record.ticket === 11 &&
            record.content.follow_up_of === null
                ? [record.content]
                : []
        )

        expect(run.action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        expect(fresh[0]).toMatchObject({
            model: 'sonnet',
            model_reason: 'trial',
            trial_group: 'trial',
        })
        expect(fresh[1]).toMatchObject({
            model: 'opus',
            model_reason: 'after_failure',
            trial_group: null,
        })
        expect(
            run.launches
                .filter(
                    ({ kind, role, ticket }) =>
                        kind === 'launch' &&
                        role === 'test-writer' &&
                        ticket === 11
                )
                .map(({ model }) => model)
        ).toEqual(['sonnet', 'opus'])
    })
})
