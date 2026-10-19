import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import type { DecisionModelClient, DecisionModelReply } from './clef-client'
import type { JevAnswer, JevQuestion } from './jev-schemas'

import type { AgentLauncher } from '../agents/agent-launcher'
import {
    createScriptedLauncher,
    type ScriptedCall,
    type ScriptedTurn,
} from '../agents/scripted-launcher'
import type { JournalRecord } from '../journal/journal-record'
import {
    createPracticeRepo,
    happyTurns,
    PRACTICE_ENGINE_CONFIG,
    type PracticeRun,
} from '../testing/practice-repo'
import { DEMO_TURNS, demoTracker } from '../testing/practice-run'

/**
 * Seam B for the model pick's safety nets (#604): the engine end to end on
 * the practice repo, with a fake decision model and the scripted launcher,
 * which records the model each launch asked for. A failed try on a cheaper
 * model steps that role up to Opus on that ticket; a crash doesn't re-roll
 * the model; a follow-up keeps its session's. Each run is built once and
 * shared across its cases (#566).
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

/** A decision model that picks `pick` for every model ask, sure of it. */
const sureClef = (pick: string): DecisionModelClient => ({
    model: '@cf/cloudflare/clef',
    ask: async ({ request }): Promise<DecisionModelReply> => ({
        ok: true,
        answers: Object.fromEntries(
            Object.entries(request.questions).map(([id, question]) => [
                id,
                id === 'model'
                    ? { value: pick, confidence: 0.95, raw: { choice: pick } }
                    : anyAnswer(question),
            ])
        ),
    }),
})

/** A launcher whose launches throw, as if the engine died mid-turn. */
const crashingLaunches = (launcher: AgentLauncher): AgentLauncher => ({
    launch: () => Promise.reject(new Error('The engine crashed.')),
    followUp: (args) => launcher.followUp(args),
    closeSession: (args) => launcher.closeSession(args),
})

/** Only the test-writer is routed, as in this repo's own config. */
const ROUTED_CONFIG = {
    ...PRACTICE_ENGINE_CONFIG,
    models: { floors: { 'test-writer': 'sonnet' } },
}

/**
 * Builds one practice run once, before its cases, from `build` on a fresh
 * practice repo under a temp folder.
 */
const shareRun = (
    build: (
        practice: Awaited<ReturnType<typeof createPracticeRepo>>
    ) => Promise<Omit<PracticeRun, 'origin'>>
): (() => PracticeRun) => {
    let root = ''
    let run: PracticeRun | undefined
    beforeAll(async () => {
        root = await mkdtemp(join(tmpdir(), 'luca-engine-model-safety-'))
        const practice = await createPracticeRepo({
            root,
            config: ROUTED_CONFIG,
        })
        run = { ...(await build(practice)), origin: practice.origin }
    }, 120_000)
    afterAll(async () => {
        await rm(root, { recursive: true, force: true })
    })
    return () => {
        if (run === undefined) throw new Error('The run was not built.')
        return run
    }
}

/** Each fresh test-writer's model and model reason on `ticket`, in order. */
const freshWriters = (
    records: JournalRecord[],
    ticket: number
): { model: string | null; model_reason: string | null }[] =>
    records.flatMap((record) =>
        record.kind === 'agent_started' &&
        record.role === 'test-writer' &&
        record.ticket === ticket &&
        record.content.follow_up_of === null
            ? [
                  {
                      model: record.content.model,
                      model_reason: record.content.model_reason,
                  },
              ]
            : []
    )

/** The models of each follow-up's `agent_started` for the test-writer. */
const followUpWriters = (records: JournalRecord[], ticket: number) =>
    records.flatMap((record) =>
        record.kind === 'agent_started' &&
        record.role === 'test-writer' &&
        record.ticket === ticket &&
        record.content.follow_up_of !== null
            ? [record.content.model]
            : []
    )

/** The test-writer's `agent_model` asks on `ticket`, by `acted`. */
const writerAsks = (records: JournalRecord[], ticket: number) =>
    records.flatMap((record) =>
        record.kind === 'jev_asked' &&
        record.content.job === 'agent_model' &&
        record.role === 'test-writer' &&
        record.ticket === ticket
            ? [{ acted: record.content.acted }]
            : []
    )

/** The scripted launcher's calls for the test-writer on `ticket`. */
const writerCalls = (launches: ScriptedCall[], ticket: number) =>
    launches
        .filter(
            ({ role, ticket: on }) => role === 'test-writer' && on === ticket
        )
        .map(({ kind, model }) => ({ kind, model }))

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

describe('a failed try steps the role up to opus on its ticket (#604)', () => {
    // #11's test-writer: an engine failure, then a sonnet try that fails,
    // then its follow-up, cut off by an engine failure, then a fresh agent
    // that writes the tests. #12 waits on #11 and builds cleanly.
    const stepped = shareRun((practice) =>
        practice.run({
            turns: [
                failingWriter('engine'),
                failingWriter('agent'),
                failingWriter('engine'),
                ...DEMO_TURNS,
            ],
            tracker: demoTracker(),
            jev: { client: sureClef('sonnet') },
        })
    )

    test('after a sonnet test-writer fails a try, the next fresh test-writer on that ticket launches on opus with reason after_failure, and no agent_model ask is journaled for it', () => {
        const run = stepped()

        expect(run.action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        expect(freshWriters(run.records, 11).at(-1)).toEqual({
            model: 'opus',
            model_reason: 'after_failure',
        })
        expect(writerCalls(run.launches, 11).at(-1)).toEqual({
            kind: 'launch',
            model: 'opus',
        })
        // One ask before each of the two fresh agents before the failed try.
        expect(writerAsks(run.records, 11)).toEqual([
            { acted: true },
            { acted: true },
        ])
    })

    test('an engine failure is not a failed try: the fresh test-writer after it is asked again and picks sonnet, and only the failed try steps up', () => {
        const run = stepped()

        expect(freshWriters(run.records, 11)).toEqual([
            { model: 'sonnet', model_reason: 'decision_model' },
            { model: 'sonnet', model_reason: 'decision_model' },
            { model: 'opus', model_reason: 'after_failure' },
        ])
    })

    test("the step-up is per ticket: #12's test-writer is still asked and launches on the decision model's sonnet", () => {
        const run = stepped()

        expect(freshWriters(run.records, 11).at(-1)?.model_reason).toBe(
            'after_failure'
        )
        expect(freshWriters(run.records, 12)).toEqual([
            { model: 'sonnet', model_reason: 'decision_model' },
        ])
        expect(writerCalls(run.launches, 12)).toEqual([
            { kind: 'launch', model: 'sonnet' },
        ])
        expect(writerAsks(run.records, 12)).toEqual([{ acted: true }])
    })

    test("the failed try's fix-loop follow-up runs on its session's sonnet, and only the next fresh agent steps up to opus", () => {
        const run = stepped()

        expect(followUpWriters(run.records, 11)).toEqual(['sonnet'])
        expect(writerCalls(run.launches, 11)).toEqual([
            { kind: 'launch', model: 'sonnet' },
            { kind: 'launch', model: 'sonnet' },
            { kind: 'follow_up', model: 'sonnet' },
            { kind: 'launch', model: 'opus' },
        ])
    })
})

describe("a crash doesn't re-roll the model (#604)", () => {
    // The first run picks sonnet and crashes in the test-writer's launch;
    // on the resume, the decision model would pick opus if asked again.
    const redone = shareRun(async (practice) => {
        await practice
            .run({
                launcher: crashingLaunches(
                    createScriptedLauncher({ turns: [] })
                ),
                jev: { client: sureClef('sonnet') },
            })
            .catch(() => undefined)
        return practice.run({
            resume: true,
            turns: Object.values(happyTurns()),
            jev: { client: sureClef('opus') },
        })
    })

    test('a launch step a crash cut off is redone on the model it first journaled, with no new ask', () => {
        const run = redone()

        expect(run.action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        expect(freshWriters(run.records, 11).map(({ model }) => model)).toEqual(
            ['sonnet', 'sonnet']
        )
        expect(writerCalls(run.launches, 11)).toEqual([
            { kind: 'launch', model: 'sonnet' },
        ])
        expect(writerAsks(run.records, 11)).toEqual([{ acted: true }])
    })
})
