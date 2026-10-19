import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, describe, expect, test } from 'bun:test'

import {
    createClefClient,
    type DecisionModelClient,
    type DecisionModelFetch,
} from './clef-client'
import type { JevAsk } from './jev-jobs'
import type { JevAnswer, JevQuestion, JevRequest } from './jev-schemas'
import { shadowAsker } from './jev-shadow'

import { createJournal } from '../journal/journal'

/**
 * `shadowAsker` on its own, with a fake Jev and no practice repo, so it runs
 * with the fast tests (#568). Jev in shadow mode on a whole run is in
 * `jev-shadow.e2e.test.ts`, where its answers change nothing; a Jev that
 * fails or is turned down is checked here (#566), since the asker never
 * throws and the run never waits on it.
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

describe('shadowAsker', () => {
    const choiceAsk = ({
        job,
        options,
    }: {
        job: JevAsk['job']
        options: string[]
    }): JevAsk => ({
        job,
        ticket: 11,
        role: null,
        request: {
            state: { spec: 'Practice spec' },
            questions: {
                pick: {
                    type: 'choice',
                    instructions: 'Which one?',
                    criteria: Object.fromEntries(
                        options.map((option) => [option, null])
                    ),
                },
            },
        },
        fixed: { pick: options[0] ?? 'none' },
    })

    test('skips any ask whose choice has fewer than two options: no call and no record', async () => {
        const root = await newRoot()
        const journal = createJournal({ file: join(root, 'journal.jsonl') })
        const jev = disagreeingJev()
        const ask = shadowAsker({ jev: { client: jev }, journal })

        await ask([
            choiceAsk({ job: 'ticket_order', options: ['ticket_11'] }),
            choiceAsk({ job: 'failure_kind', options: ['code'] }),
            choiceAsk({ job: 'ticket_model', options: [] }),
        ])

        expect(jev.signals).toHaveLength(0)
        expect(journal.read()).toEqual([])
    })

    test('still asks the valid asks beside a skipped one, exactly as before', async () => {
        const root = await newRoot()
        const journal = createJournal({ file: join(root, 'journal.jsonl') })
        const jev = disagreeingJev()
        const ask = shadowAsker({ jev: { client: jev }, journal })
        const valid = choiceAsk({
            job: 'ticket_model',
            options: ['claude-opus-5-5', 'claude-haiku-4-5'],
        })

        await ask([
            choiceAsk({ job: 'ticket_order', options: ['ticket_11'] }),
            valid,
        ])

        expect(jev.signals).toHaveLength(1)
        const records = journal.read()
        expect(records.map(({ kind }) => kind)).toEqual([
            'jev_asked',
            'jev_answered',
        ])
        expect(records[0]?.content).toMatchObject({
            job: 'ticket_model',
            request: valid.request,
            fixed: valid.fixed,
            model: FAKE_MODEL,
        })
        expect(records[1]?.content).toMatchObject({
            job: 'ticket_model',
            asked_seq: records[0]?.seq,
            answers: {
                pick: { value: 'claude-haiku-4-5', confidence: 0.7 },
            },
        })
    })

    test('journals every ask with acted false, since no answer changes anything', async () => {
        const root = await newRoot()
        const journal = createJournal({ file: join(root, 'journal.jsonl') })
        const ask = shadowAsker({ jev: { client: disagreeingJev() }, journal })

        await ask([
            twoOptionAsk('agent_skills'),
            {
                ...twoOptionAsk('agent_model'),
                request: {
                    state: { spec: 'Practice spec', role: 'test-writer' },
                    questions: {
                        model: {
                            type: 'choice',
                            instructions: 'Which model?',
                            criteria: { opus: null, sonnet: null, haiku: null },
                        },
                    },
                },
                fixed: { model: 'opus' },
            },
        ])

        const asks = journal
            .read()
            .filter((record) => record.kind === 'jev_asked')
        expect(asks.map(({ content }) => content)).toEqual([
            expect.objectContaining({ job: 'agent_skills', acted: false }),
            expect.objectContaining({ job: 'agent_model', acted: false }),
        ])
    })

    test("an older journal's ticket_model ask and answer still read, the ask with acted false", async () => {
        const root = await newRoot()
        const file = join(root, 'journal.jsonl')
        const time = '2026-10-01T00:00:00.000Z'
        const old = [
            {
                seq: 1,
                time,
                kind: 'jev_asked',
                ticket: 11,
                role: null,
                content: {
                    job: 'ticket_model',
                    request: twoOptionAsk('ticket_model').request,
                    fixed: { model: 'opus' },
                    model: FAKE_MODEL,
                },
            },
            {
                seq: 2,
                time,
                kind: 'jev_answered',
                ticket: 11,
                role: null,
                content: {
                    job: 'ticket_model',
                    asked_seq: 1,
                    answers: {
                        model: {
                            value: 'sonnet',
                            confidence: 0.9,
                            raw: { choice: 'sonnet', confidence: 0.9 },
                        },
                    },
                    ms: 120,
                    model: FAKE_MODEL,
                },
            },
        ]
        await Bun.write(
            file,
            `${old.map((record) => JSON.stringify(record)).join('\n')}\n`
        )

        const records = createJournal({ file }).read()
        expect(records.map(({ kind }) => kind)).toEqual([
            'jev_asked',
            'jev_answered',
        ])
        expect(records[0]?.content).toMatchObject({
            job: 'ticket_model',
            fixed: { model: 'opus' },
            acted: false,
        })
        expect(records[1]?.content).toMatchObject({
            job: 'ticket_model',
            answers: { model: { value: 'sonnet', confidence: 0.9 } },
        })
    })
})

/** A valid two-option ask, as a step's `jevAsksBefore` makes one. */
const twoOptionAsk = (job: JevAsk['job']): JevAsk => ({
    job,
    ticket: 11,
    role: 'test-writer',
    request: {
        state: { spec: 'Practice spec' },
        questions: {
            pick: {
                type: 'choice',
                instructions: 'Which one?',
                criteria: { 'claude-opus-5-5': null, 'claude-haiku-4-5': null },
            },
        },
    },
    fixed: { pick: 'claude-opus-5-5' },
})

describe('shadowAsker with a Jev that fails', () => {
    const failingJevs: {
        name: string
        reason: 'error' | 'timeout' | 'missing_credentials'
        jev: () => DecisionModelClient & { calls: () => number }
    }[] = [
        {
            name: 'a Jev that throws',
            reason: 'error',
            jev: () => {
                let calls = 0
                return {
                    calls: () => calls,
                    model: FAKE_MODEL,
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
                    model: FAKE_MODEL,
                    // It ignores the abort signal; the timeout still cuts it off.
                    ask: () => {
                        calls += 1
                        return new Promise(() => {})
                    },
                }
            },
        },
        {
            name: 'the Clef client with no credentials',
            reason: 'missing_credentials',
            jev: () => {
                let calls = 0
                return {
                    calls: () => calls,
                    ...createClefClient({
                        credentials: null,
                        model: FAKE_MODEL,
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
        test(`${name} is journaled as ${reason}, never thrown, and the next ask tries again`, async () => {
            const root = await newRoot()
            const journal = createJournal({ file: join(root, 'journal.jsonl') })
            const client = jev()
            const ask = shadowAsker({
                jev: { client, timeout_ms: 50 },
                journal,
            })

            await ask([
                twoOptionAsk('ticket_model'),
                twoOptionAsk('agent_skills'),
            ])

            const records = journal.read()
            expect(records.map(({ kind }) => kind)).toEqual([
                'jev_asked',
                'jev_failed',
                'jev_asked',
                'jev_failed',
            ])
            for (const [index, job] of [
                'ticket_model',
                'agent_skills',
            ].entries()) {
                const asked = records[index * 2]
                expect(records[index * 2 + 1]?.content).toMatchObject({
                    job,
                    asked_seq: asked?.seq,
                    reason,
                    error: expect.any(String),
                })
            }
            expect(client.calls()).toBe(
                reason === 'missing_credentials' ? 0 : 2
            )
        })
    }

    test('a rejected token turns the decision model off for the rest of its run: one record, one line, no token kept; a new run asks again', async () => {
        const urls: string[] = []
        const fetch: DecisionModelFetch = async (url) => {
            urls.push(url)
            return new Response(
                JSON.stringify({
                    success: false,
                    errors: [{ code: 10000, message: 'Authentication error' }],
                }),
                { status: 401 }
            )
        }
        const logged: string[] = []
        const jev = {
            client: createClefClient({
                credentials: { account_id: 'acc', api_token: 'not-real-tok' },
                model: FAKE_MODEL,
                fetch,
            }),
            log: (line: string) => {
                logged.push(line)
            },
        }
        const asks = [
            twoOptionAsk('ticket_model'),
            twoOptionAsk('agent_skills'),
            twoOptionAsk('agent_skills'),
        ]
        const root = await newRoot()
        const journal = createJournal({ file: join(root, 'journal.jsonl') })

        const ask = shadowAsker({ jev, journal })
        await ask(asks)
        await ask(asks)

        const records = journal.read()
        expect(records.map(({ kind }) => kind)).toEqual([
            'jev_asked',
            'jev_failed',
            'decision_model_off',
        ])
        expect(records[1]?.content).toMatchObject({ reason: 'rejected' })
        expect(records[2]?.content).toEqual({
            model: FAKE_MODEL,
            reason: 'rejected',
            detail: expect.stringContaining('401'),
        })
        expect(JSON.stringify(records)).not.toContain('not-real-tok')
        expect(urls).toHaveLength(1)
        expect(logged).toHaveLength(1)
        expect(logged[0]).toContain('off')

        // The off switch is the run's own: the next run's asker asks again.
        const next = createJournal({ file: join(root, 'next.jsonl') })
        await shadowAsker({ jev, journal: next })(asks)
        expect(
            next.read().filter(({ kind }) => kind === 'jev_asked')
        ).toHaveLength(1)
        expect(urls).toHaveLength(2)
    })
})
