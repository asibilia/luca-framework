import { describe, expect, test } from 'bun:test'

import {
    clefUrl,
    createClefClient,
    type DecisionModelClient,
    type DecisionModelFetch,
} from './clef-client'
import type { JevRequest } from './jev-schemas'

/**
 * Seam A: the Clef client, with a fake fetch. It never reaches the network,
 * and never reads real credentials.
 */

const TOKEN = 'test-token-not-real-123'
const ACCOUNT = 'acc0123456789'
const CREDENTIALS = { account_id: ACCOUNT, api_token: TOKEN }

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
}): { fetch: DecisionModelFetch; calls: Call[] } => {
    const calls: Call[] = []
    return {
        calls,
        fetch: async (url, init) => {
            calls.push({ url, init })
            return new Response(body, { status: status ?? 200 })
        },
    }
}

const ask = (client: DecisionModelClient) =>
    client.ask({ request: REQUEST, signal: new AbortController().signal })

const ANSWERS = {
    model: {
        type: 'choice',
        choice: 'haiku',
        probabilities: { opus: 0.2, haiku: 0.8 },
        confidence: 0.6,
    },
    severity: {
        type: 'score',
        score: 3,
        legend: { '1': 'nit', '2': 'should_fix', '3': 'blocker' },
        probabilities: { '1': 0.1, '2': 0.2, '3': 0.7 },
        confidence: 0.5,
    },
    tdd: { type: 'noul', noul: 0.9 },
}

const CLEF_OUTPUT = {
    model: 'clef',
    answers: ANSWERS,
    usage: { input_tokens: 120, output_tokens: 8 },
}

const NORMALIZED = {
    model: { value: 'haiku', confidence: 0.6, raw: ANSWERS.model },
    severity: { value: 3, confidence: 0.5, raw: ANSWERS.severity },
    tdd: { value: 0.9, confidence: null, raw: ANSWERS.tdd },
}

describe('the Clef client', () => {
    test('posts the short model name, state, and questions to Workers AI with the bearer token', async () => {
        const fake = fakeFetch({
            body: JSON.stringify({ result: CLEF_OUTPUT, success: true }),
        })

        await ask(
            createClefClient({
                credentials: CREDENTIALS,
                model: '@cf/cloudflare/clef',
                fetch: fake.fetch,
            })
        )

        expect(fake.calls).toHaveLength(1)
        const [call] = fake.calls
        expect(call?.url).toBe(
            `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/ai/run/@cf/cloudflare/clef`
        )
        expect(call?.init.method).toBe('POST')
        const headers = new Headers(call?.init.headers)
        expect(headers.get('authorization')).toBe(`Bearer ${TOKEN}`)
        expect(headers.get('content-type')).toBe('application/json')
        expect(JSON.parse(String(call?.init.body))).toEqual({
            model: 'clef',
            state: REQUEST.state,
            questions: REQUEST.questions,
        })
        expect(call?.init.signal).toBeDefined()
    })

    test('clef-flash is asked by its own id and short name', async () => {
        const fake = fakeFetch({ body: JSON.stringify(CLEF_OUTPUT) })
        const client = createClefClient({
            credentials: CREDENTIALS,
            model: '@cf/cloudflare/clef-flash',
            fetch: fake.fetch,
        })

        await ask(client)

        expect(client.model).toBe('@cf/cloudflare/clef-flash')
        expect(fake.calls[0]?.url).toBe(
            clefUrl({ account_id: ACCOUNT, model: '@cf/cloudflare/clef-flash' })
        )
        expect(
            fake.calls[0]?.url.endsWith('/ai/run/@cf/cloudflare/clef-flash')
        ).toBe(true)
        expect(JSON.parse(String(fake.calls[0]?.init.body)).model).toBe(
            'clef-flash'
        )
    })

    test('reads noul, choice, and score answers inside the REST envelope', async () => {
        const fake = fakeFetch({
            body: JSON.stringify({
                result: CLEF_OUTPUT,
                success: true,
                errors: [],
                messages: [],
            }),
        })

        const reply = await ask(
            createClefClient({
                credentials: CREDENTIALS,
                model: '@cf/cloudflare/clef',
                fetch: fake.fetch,
            })
        )

        expect(reply).toEqual({ ok: true, model: 'clef', answers: NORMALIZED })
    })

    test('reads the same answers when they come back bare', async () => {
        const fake = fakeFetch({ body: JSON.stringify(CLEF_OUTPUT) })

        const reply = await ask(
            createClefClient({
                credentials: CREDENTIALS,
                model: '@cf/cloudflare/clef',
                fetch: fake.fetch,
            })
        )

        expect(reply).toEqual({ ok: true, model: 'clef', answers: NORMALIZED })
    })

    test('with no model in the reply, the asked model is the one that answered', async () => {
        const fake = fakeFetch({
            body: JSON.stringify({ result: { answers: {} } }),
        })

        const reply = await ask(
            createClefClient({
                credentials: CREDENTIALS,
                model: '@cf/cloudflare/clef',
                fetch: fake.fetch,
            })
        )

        expect(reply).toEqual({
            ok: true,
            model: '@cf/cloudflare/clef',
            answers: {},
        })
    })

    test('an answer of an unknown shape keeps its raw form with no value', async () => {
        const fake = fakeFetch({
            body: JSON.stringify({ answers: { model: 'haiku' } }),
        })

        const reply = await ask(
            createClefClient({
                credentials: CREDENTIALS,
                model: '@cf/cloudflare/clef',
                fetch: fake.fetch,
            })
        )

        expect(reply).toMatchObject({
            ok: true,
            answers: {
                model: { value: null, confidence: null, raw: 'haiku' },
            },
        })
    })

    test('with no credentials it fails as missing_credentials and never calls fetch', async () => {
        for (const credentials of [
            null,
            { account_id: '', api_token: TOKEN },
            { account_id: ACCOUNT, api_token: '' },
        ]) {
            const fake = fakeFetch({ body: '{}' })

            const reply = await ask(
                createClefClient({
                    credentials,
                    model: '@cf/cloudflare/clef',
                    fetch: fake.fetch,
                })
            )

            expect(reply).toMatchObject({
                ok: false,
                reason: 'missing_credentials',
            })
            expect(fake.calls).toEqual([])
        }
    })

    test('401 and 403 are rejected, with Cloudflare’s message and never the token', async () => {
        for (const status of [401, 403]) {
            const fake = fakeFetch({
                status,
                body: JSON.stringify({
                    success: false,
                    errors: [
                        {
                            code: 10000,
                            message: `Authentication error for ${TOKEN}`,
                        },
                    ],
                    messages: [],
                    result: null,
                }),
            })

            const reply = await ask(
                createClefClient({
                    credentials: CREDENTIALS,
                    model: '@cf/cloudflare/clef',
                    fetch: fake.fetch,
                })
            )

            expect(reply).toMatchObject({ ok: false, reason: 'rejected' })
            const error = reply.ok ? '' : reply.error
            expect(error).toContain(String(status))
            expect(error).toContain('Authentication error')
            expect(error).not.toContain(TOKEN)
        }
    })

    test('another status that is not 2xx is an error that never shows the token', async () => {
        for (const status of [400, 429, 500, 529]) {
            const fake = fakeFetch({
                status,
                body: `bad call ${TOKEN}, slow down`,
            })

            const reply = await ask(
                createClefClient({
                    credentials: CREDENTIALS,
                    model: '@cf/cloudflare/clef',
                    fetch: fake.fetch,
                })
            )

            expect(reply).toMatchObject({ ok: false, reason: 'error' })
            const error = reply.ok ? '' : reply.error
            expect(error).toContain(String(status))
            expect(error).toContain('slow down')
            expect(error).not.toContain(TOKEN)
        }
    })

    test('a Cloudflare error envelope’s messages are in the error text', async () => {
        const fake = fakeFetch({
            status: 500,
            body: JSON.stringify({
                success: false,
                errors: [{ code: 3043, message: 'Internal server error' }],
            }),
        })

        const reply = await ask(
            createClefClient({
                credentials: CREDENTIALS,
                model: '@cf/cloudflare/clef',
                fetch: fake.fetch,
            })
        )

        expect(reply).toMatchObject({
            ok: false,
            reason: 'error',
            error: expect.stringContaining('Internal server error'),
        })
    })

    test('an aborted call is a timeout', async () => {
        const controller = new AbortController()
        const client = createClefClient({
            credentials: CREDENTIALS,
            model: '@cf/cloudflare/clef',
            fetch: (_url, init) =>
                new Promise((_resolve, reject) => {
                    init.signal?.addEventListener('abort', () =>
                        reject(new DOMException('aborted', 'AbortError'))
                    )
                }),
        })

        const pending = client.ask({
            request: REQUEST,
            signal: controller.signal,
        })
        controller.abort()

        expect(await pending).toMatchObject({ ok: false, reason: 'timeout' })
    })

    test('a body that is not JSON, or has no answers, is an error', async () => {
        for (const body of [
            '<html>oops</html>',
            '{"nope":1}',
            'null',
            '{"result":{"nope":1},"success":true}',
        ]) {
            const fake = fakeFetch({ body })

            const reply = await ask(
                createClefClient({
                    credentials: CREDENTIALS,
                    model: '@cf/cloudflare/clef',
                    fetch: fake.fetch,
                })
            )

            expect(reply).toMatchObject({ ok: false, reason: 'error' })
        }
    })

    test('a fetch that throws is an error, not a throw, and hides the token', async () => {
        const client = createClefClient({
            credentials: CREDENTIALS,
            model: '@cf/cloudflare/clef',
            fetch: async () => {
                throw new Error(`network down near ${TOKEN}`)
            },
        })

        const reply = await ask(client)

        expect(reply).toMatchObject({ ok: false, reason: 'error' })
        const error = reply.ok ? '' : reply.error
        expect(error).toContain('network down')
        expect(error).not.toContain(TOKEN)
    })
})
