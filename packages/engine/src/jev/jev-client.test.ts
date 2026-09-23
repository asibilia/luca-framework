import { describe, expect, test } from 'bun:test'

import {
    createTypeSafeJev,
    JEV_MODEL,
    JEV_URL,
    type JevFetch,
} from './jev-client'
import type { JevRequest } from './jev-schemas'

/**
 * Seam A: the TypeSafe client, with a fake fetch. It never reaches the
 * network, and never reads a real key.
 */

const KEY = 'test-key-not-real-123'

const REQUEST: JevRequest = {
    state: { ticket: '#11 Add sum' },
    questions: {
        model: {
            type: 'choice',
            instructions: 'Which model?',
            criteria: { opus: null, haiku: null },
        },
        severity: {
            type: 'score',
            instructions: 'How bad?',
            criteria: ['nit', 'should_fix', 'blocker'],
        },
        tdd: { type: 'noul', instructions: 'Use tdd?' },
    },
}

type Call = { url: string; init: RequestInit }

const fakeFetch = ({
    status,
    body,
}: {
    status?: number
    body: string
}): { fetch: JevFetch; calls: Call[] } => {
    const calls: Call[] = []
    return {
        calls,
        fetch: async (url, init) => {
            calls.push({ url, init })
            return new Response(body, { status: status ?? 200 })
        },
    }
}

const ask = (jev: ReturnType<typeof createTypeSafeJev>) =>
    jev.ask({ request: REQUEST, signal: new AbortController().signal })

describe('the TypeSafe Jev client', () => {
    test('posts the model, state, and questions with the bearer key', async () => {
        const fake = fakeFetch({ body: JSON.stringify({ answers: {} }) })

        await ask(createTypeSafeJev({ api_key: KEY, fetch: fake.fetch }))

        expect(fake.calls).toHaveLength(1)
        const [call] = fake.calls
        expect(call?.url).toBe(JEV_URL)
        expect(call?.url).toBe('https://api.typesafe.ai/v1/systemone')
        expect(call?.init.method).toBe('POST')
        const headers = new Headers(call?.init.headers)
        expect(headers.get('authorization')).toBe(`Bearer ${KEY}`)
        expect(headers.get('content-type')).toBe('application/json')
        expect(JSON.parse(String(call?.init.body))).toEqual({
            model: JEV_MODEL,
            state: REQUEST.state,
            questions: REQUEST.questions,
        })
        expect(JEV_MODEL).toBe('jev-latest')
        expect(call?.init.signal).toBeDefined()
    })

    test('keeps each raw answer and its value and confidence', async () => {
        const answers = {
            model: {
                choice: 'haiku',
                probabilities: { opus: 0.2, haiku: 0.8 },
                confidence: 0.6,
            },
            severity: {
                score: 'blocker',
                legend: ['nit', 'should_fix', 'blocker'],
                probabilities: [0.1, 0.2, 0.7],
                confidence: 0.5,
            },
            tdd: { probability: 0.9 },
        }
        const fake = fakeFetch({ body: JSON.stringify({ answers }) })

        const reply = await ask(
            createTypeSafeJev({ api_key: KEY, fetch: fake.fetch })
        )

        expect(reply).toEqual({
            ok: true,
            answers: {
                model: { value: 'haiku', confidence: 0.6, raw: answers.model },
                severity: {
                    value: 'blocker',
                    confidence: 0.5,
                    raw: answers.severity,
                },
                tdd: { value: 0.9, confidence: null, raw: answers.tdd },
            },
        })
    })

    test('an answer of an unknown shape keeps its raw form with no value', async () => {
        const fake = fakeFetch({
            body: JSON.stringify({ answers: { model: 'haiku' } }),
        })

        const reply = await ask(
            createTypeSafeJev({ api_key: KEY, fetch: fake.fetch })
        )

        expect(reply).toEqual({
            ok: true,
            answers: {
                model: { value: null, confidence: null, raw: 'haiku' },
            },
        })
    })

    test('with no key it fails as missing_key and never calls fetch', async () => {
        const fake = fakeFetch({ body: '{}' })

        const reply = await ask(
            createTypeSafeJev({ api_key: '', fetch: fake.fetch })
        )

        expect(reply).toMatchObject({ ok: false, reason: 'missing_key' })
        expect(fake.calls).toEqual([])
    })

    test('reads the key from TYPESAFE_API_KEY when none is given', async () => {
        const saved = process.env.TYPESAFE_API_KEY
        const fake = fakeFetch({ body: JSON.stringify({ answers: {} }) })
        try {
            process.env.TYPESAFE_API_KEY = KEY
            const reply = await ask(createTypeSafeJev({ fetch: fake.fetch }))
            expect(reply).toEqual({ ok: true, answers: {} })
            expect(
                new Headers(fake.calls[0]?.init.headers).get('authorization')
            ).toBe(`Bearer ${KEY}`)

            delete process.env.TYPESAFE_API_KEY
            const missing = await ask(createTypeSafeJev({ fetch: fake.fetch }))
            expect(missing).toMatchObject({ ok: false, reason: 'missing_key' })
        } finally {
            if (saved === undefined) delete process.env.TYPESAFE_API_KEY
            else process.env.TYPESAFE_API_KEY = saved
        }
    })

    test('a status that is not 2xx is an error that never shows the key', async () => {
        for (const status of [401, 429, 500, 529]) {
            const fake = fakeFetch({
                status,
                body: `bad key ${KEY}, slow down`,
            })

            const reply = await ask(
                createTypeSafeJev({ api_key: KEY, fetch: fake.fetch })
            )

            expect(reply).toMatchObject({ ok: false, reason: 'error' })
            const error = reply.ok ? '' : reply.error
            expect(error).toContain(String(status))
            expect(error).toContain('slow down')
            expect(error).not.toContain(KEY)
        }
    })

    test('an aborted call is a timeout', async () => {
        const controller = new AbortController()
        const jev = createTypeSafeJev({
            api_key: KEY,
            fetch: (_url, init) =>
                new Promise((_resolve, reject) => {
                    init.signal?.addEventListener('abort', () =>
                        reject(new DOMException('aborted', 'AbortError'))
                    )
                }),
        })

        const pending = jev.ask({
            request: REQUEST,
            signal: controller.signal,
        })
        controller.abort()

        expect(await pending).toMatchObject({ ok: false, reason: 'timeout' })
    })

    test('a body that is not JSON, or not answers, is an error', async () => {
        for (const body of ['<html>oops</html>', '{"nope":1}', 'null']) {
            const fake = fakeFetch({ body })

            const reply = await ask(
                createTypeSafeJev({ api_key: KEY, fetch: fake.fetch })
            )

            expect(reply).toMatchObject({ ok: false, reason: 'error' })
        }
    })

    test('a fetch that throws is an error, not a throw', async () => {
        const jev = createTypeSafeJev({
            api_key: KEY,
            fetch: async () => {
                throw new Error('network down')
            },
        })

        expect(await ask(jev)).toMatchObject({
            ok: false,
            reason: 'error',
            error: expect.stringContaining('network down'),
        })
    })
})
