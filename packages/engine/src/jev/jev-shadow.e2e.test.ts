import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import { createClefClient, type DecisionModelFetch } from './clef-client'
import { JEV_FIXED_MODEL } from './jev-jobs'
import {
    asked,
    expectSameRun,
    FAKE_MODEL,
    hasOneOptionChoice,
    isJev,
    replyTo,
    shareRuns,
    SKILL_IDS,
} from './jev-shadow-helpers'

import {
    HAPPY_TURNS,
    runPractice,
    type PracticeRun,
} from '../testing/practice-repo'

/**
 * Seam B: the engine with a fake Jev in shadow mode, end to end on a practice
 * repo. Jev is asked and journaled, but the run must go exactly as it does
 * without Jev, whatever Jev answers or however it fails.
 *
 * Each run with Jev, and the same run without it, is built once (#566). A
 * token Cloudflare turns down runs here; a Jev that throws, never answers,
 * or has no credentials is checked on `shadowAsker` itself, in
 * `jev-shadow.test.ts`: it journals the failure and never throws. The run with
 * a failed red check and review findings is in `jev-shadow-findings.e2e.test.ts`;
 * the helpers both share are in `jev-shadow-helpers.ts`.
 */

describe('Jev in shadow mode on the happy run', () => {
    // The one-ticket happy run with a Jev that disagrees with everything,
    // and the same run without Jev, built once (#566).
    const happy = shareRuns({ turns: () => HAPPY_TURNS })

    test('is asked about order, model, and skills, and the engine ignores its answers', () => {
        const { run, jev, without } = happy()

        expect(run.action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        expectSameRun({ run, without })

        // The effort asks (#661) are checked in their own test below.
        const asks = asked(run.records).filter(
            ({ content }) =>
                content.job !== 'ticket_order' && content.job !== 'agent_effort'
        )
        expect(asks.map(({ content }) => content.job).toSorted()).toEqual([
            'agent_model',
            'agent_model',
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

        // One model ask before each fresh test-writer and implementer, with
        // its role and try; Clef picks haiku, yet each launches on opus.
        const models = asks.filter(
            ({ content }) => content.job === 'agent_model'
        )
        const skills = asks.filter(
            ({ content }) => content.job === 'agent_skills'
        )
        expect(models.map(({ role }) => role)).toEqual([
            'test-writer',
            'implementer',
        ])
        for (const model of models) {
            expect(model.content.fixed).toEqual({ model: JEV_FIXED_MODEL })
            expect(model.content.request.state).toMatchObject({
                spec: 'Practice spec',
                ticket: '#11 Add sum',
                role: model.role ?? '',
                try: '1',
            })
            const modelReply = replyTo(run.records, model)
            expect(
                modelReply?.kind === 'jev_answered' &&
                    modelReply.content.answers
            ).toEqual({
                model: {
                    value: 'haiku',
                    confidence: 0.7,
                    raw: { choice: 'haiku', confidence: 0.7 },
                },
            })
            const started = run.records.find(
                (record) =>
                    record.kind === 'agent_started' && record.seq > model.seq
            )
            expect(started?.role).toBe(model.role)
        }
        expect(new Set(run.launches.map(({ model }) => model))).toEqual(
            new Set(['opus'])
        )

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

    test('every agent, reviewers and lenses included, launches on opus whatever the decision model picks, and its agent_started says so', () => {
        const { run, without } = happy()

        for (const each of [run, without]) {
            const launches = each.launches.filter(
                ({ kind }) => kind === 'launch'
            )
            expect(launches.map(({ role }) => role)).toEqual(
                expect.arrayContaining([
                    'test-writer',
                    'implementer',
                    'ticket-reviewer',
                    'architecture-lens',
                    'rules-lens',
                ])
            )
            expect(new Set(launches.map(({ model }) => model))).toEqual(
                new Set(['opus'])
            )
            const started = each.records.filter(
                (record) => record.kind === 'agent_started'
            )
            expect(started).toHaveLength(each.launches.length)
            expect(
                new Set(
                    started.map((record) =>
                        record.kind === 'agent_started'
                            ? record.content.model
                            : null
                    )
                )
            ).toEqual(new Set(['opus']))
        }
    })

    test('with one ticket, asks no ticket order, sends no one-option choice, and journals no failure', () => {
        const { run, jev } = happy()

        const jobs = asked(run.records).map(({ content }) => content.job)
        // The effort asks (#661) are checked in their own test below.
        expect(jobs.filter((job) => job !== 'agent_effort').toSorted()).toEqual(
            [
                'agent_model',
                'agent_model',
                'agent_skills',
                'agent_skills',
                'agent_skills',
            ]
        )
        expect(jobs).not.toContain('ticket_model')
        // Shadow mode: no ask's answer can change anything.
        expect(
            new Set(asked(run.records).map(({ content }) => content.acted))
        ).toEqual(new Set([false]))
        expect(jev.signals).toHaveLength(jobs.length)
        expect(jev.requests.filter(hasOneOptionChoice)).toEqual([])
        expect(
            run.records.filter((record) => record.kind === 'jev_failed')
        ).toEqual([])
    })

    test("asks agent_effort before each fresh test-writer and implementer, with the agent_model ask's facts, fixed at medium and never acted on: Clef picks xhigh, yet the test-writer launches at medium", () => {
        const { run, jev } = happy()

        const all = asked(run.records)
        expect(all.map(({ content }) => content.job).toSorted()).toEqual([
            'agent_effort',
            'agent_effort',
            'agent_model',
            'agent_model',
            'agent_skills',
            'agent_skills',
            'agent_skills',
        ])
        expect(jev.signals).toHaveLength(all.length)

        const efforts = all.filter(
            ({ content }) => content.job === 'agent_effort'
        )
        expect(efforts.map(({ role }) => role)).toEqual([
            'test-writer',
            'implementer',
        ])
        for (const effort of efforts) {
            expect(effort.ticket).toBe(11)
            expect(effort.content.acted).toBe(false)
            expect(effort.content.fixed).toEqual({ effort: 'medium' })
            expect(effort.content.request.questions).toEqual({
                effort: {
                    type: 'choice',
                    instructions:
                        'Which effort should this agent use? Pick the lowest that will get it right.',
                    criteria: { medium: null, high: null, xhigh: null },
                },
            })
            const model = all.find(
                ({ content, role }) =>
                    content.job === 'agent_model' && role === effort.role
            )
            expect(effort.content.request.state).toEqual(
                model?.content.request.state ?? {}
            )
            const reply = replyTo(run.records, effort)
            expect(
                reply?.kind === 'jev_answered' && reply.content.answers.effort
            ).toMatchObject({ value: 'xhigh' })
            // The next agent to start is this fresh one, at its role's effort.
            const started = run.records.find(
                (record) =>
                    record.kind === 'agent_started' && record.seq > effort.seq
            )
            expect(started?.role).toBe(effort.role)
            expect(
                started?.kind === 'agent_started' && {
                    follow_up_of: started.content.follow_up_of,
                    effort: started.content.effort,
                }
            ).toEqual({ follow_up_of: null, effort: 'medium' })
        }
        expect(
            run.launches
                .filter(({ role }) => role === 'test-writer')
                .map(({ kind, effort }) => ({ kind, effort }))
        ).toEqual([{ kind: 'launch', effort: 'medium' }])
    })

    describe('with a token Cloudflare turns down', () => {
        // Two happy runs with the same Clef client, whose every call is
        // turned down with a 401, built once (#566).
        const roots: string[] = []
        const urls: string[] = []
        const logged: string[] = []
        let rejected: PracticeRun
        let again: PracticeRun
        // How many asks the first run sent and logged, before the next.
        let urlsAfterFirst = 0
        let loggedAfterFirst: string[] = []

        beforeAll(async () => {
            const fetch: DecisionModelFetch = async (url) => {
                urls.push(url)
                return new Response(
                    JSON.stringify({
                        success: false,
                        errors: [
                            { code: 10000, message: 'Authentication error' },
                        ],
                    }),
                    { status: 401 }
                )
            }
            const jev = {
                client: createClefClient({
                    credentials: {
                        account_id: 'acc',
                        api_token: 'not-real-tok',
                    },
                    model: FAKE_MODEL,
                    fetch,
                }),
                log: (line: string) => {
                    logged.push(line)
                },
            }
            const root = await mkdtemp(join(tmpdir(), 'luca-engine-jev-'))
            roots.push(root)
            rejected = await runPractice({
                root: join(root, 'rejected'),
                turns: HAPPY_TURNS,
                jev,
            })
            urlsAfterFirst = urls.length
            loggedAfterFirst = [...logged]
            again = await runPractice({
                root: join(root, 'again'),
                turns: HAPPY_TURNS,
                jev,
            })
        }, 120_000)

        afterAll(async () => {
            await Promise.all(
                roots.map((root) => rm(root, { recursive: true, force: true }))
            )
        })

        test('a rejected token turns the decision model off for the rest of the run', () => {
            const { without } = happy()

            expectSameRun({ run: rejected, without })
            const shadow = rejected.records.filter(isJev)
            expect(shadow.map(({ kind }) => kind)).toEqual([
                'jev_asked',
                'jev_failed',
                'decision_model_off',
            ])
            expect(shadow[1]?.content).toMatchObject({ reason: 'rejected' })
            expect(shadow[2]?.content).toEqual({
                model: FAKE_MODEL,
                reason: 'rejected',
                detail: expect.stringContaining('401'),
            })
            expect(JSON.stringify(shadow)).not.toContain('not-real-tok')
            expect(urlsAfterFirst).toBe(1)
            expect(loggedAfterFirst).toHaveLength(1)
            expect(loggedAfterFirst[0]).toContain('off')
        })

        test("the off switch is the run's own: the next run asks again", () => {
            expect(asked(again.records)).toHaveLength(1)
            expect(urls).toHaveLength(2)
        })
    })
})
