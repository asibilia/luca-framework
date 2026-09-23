import mapValues from 'lodash/mapValues'
import { z } from 'zod'

import type { JevAnswer, JevFailureReason, JevRequest } from './jev-schemas'

/** TypeSafe's endpoint for Jev. */
export const JEV_URL = 'https://api.typesafe.ai/v1/systemone'

/** The Jev model the engine asks. */
export const JEV_MODEL = 'jev-latest'

/** How much of an error body a failed call keeps. */
const ERROR_SNIPPET_CHARS = 300

/** Jev's answers by question id, or why there are none. Never a throw. */
export type JevReply =
    | { ok: true; answers: Record<string, JevAnswer> }
    | { ok: false; reason: JevFailureReason; error: string }

/** Asks Jev one request. The signal cuts the call short. */
export type JevClient = {
    ask: (args: {
        request: JevRequest
        signal: AbortSignal
    }) => Promise<JevReply>
}

/** The part of `fetch` the client uses, so tests can hand in a fake. */
export type JevFetch = (url: string, init: RequestInit) => Promise<Response>

const JevResponseSchema = z.object({
    answers: z.record(z.string(), z.unknown()),
})

/**
 * The answer fields the engine knows. Jev's exact answer shapes are not
 * pinned down yet, so each field falls back to `null` when it doesn't fit.
 */
const LooseAnswerSchema = z.object({
    choice: z.string().nullish().catch(null),
    score: z.union([z.string(), z.number()]).nullish().catch(null),
    probability: z.number().nullish().catch(null),
    value: z.union([z.string(), z.number()]).nullish().catch(null),
    confidence: z.number().nullish().catch(null),
})

const normalizeAnswer = (raw: unknown): JevAnswer => {
    const parsed = LooseAnswerSchema.safeParse(raw)
    if (!parsed.success) return { value: null, confidence: null, raw }
    const { choice, score, probability, value, confidence } = parsed.data
    return {
        value: choice ?? score ?? probability ?? value ?? null,
        confidence: confidence ?? null,
        raw,
    }
}

const isAbort = ({
    error,
    signal,
}: {
    error: unknown
    signal: AbortSignal
}): boolean =>
    signal.aborted ||
    (error instanceof Error &&
        (error.name === 'AbortError' || error.name === 'TimeoutError'))

/** Removes the key from any text, so it never lands in the journal. */
const hideKey = ({ text, key }: { text: string; key: string }): string =>
    text.split(key).join('[key]')

/**
 * The real Jev client, through TypeSafe's API. It never throws: a missing
 * key, a timeout, a bad status, or a bad body each come back as a failed
 * reply, and no error text ever holds the key.
 *
 * @param api_key - Defaults to `TYPESAFE_API_KEY`, read on each call. An
 *   empty key is a missing key; the client then never calls `fetch`.
 * @param fetch - Defaults to the global `fetch`.
 * @param url - Defaults to `JEV_URL`.
 *
 * @example
 * const jev = createTypeSafeJev()
 * const reply = await jev.ask({ request, signal: AbortSignal.timeout(10_000) })
 * if (reply.ok) console.log(reply.answers)
 */
export const createTypeSafeJev = ({
    api_key,
    fetch: fetchJev,
    url,
}: {
    api_key?: string
    fetch?: JevFetch
    url?: string
} = {}): JevClient => ({
    ask: async ({ request, signal }) => {
        const key = api_key ?? process.env.TYPESAFE_API_KEY ?? ''
        if (key === '') {
            return {
                ok: false,
                reason: 'missing_key',
                error: 'TYPESAFE_API_KEY is not set.',
            }
        }
        const endpoint = url ?? JEV_URL
        try {
            const response = await (fetchJev ?? fetch)(endpoint, {
                method: 'POST',
                headers: {
                    authorization: `Bearer ${key}`,
                    'content-type': 'application/json',
                },
                body: JSON.stringify({
                    model: JEV_MODEL,
                    state: request.state,
                    questions: request.questions,
                }),
                signal,
            })
            const text = await response.text()
            if (!response.ok) {
                const snippet = hideKey({
                    text: text.slice(0, ERROR_SNIPPET_CHARS),
                    key,
                })
                return {
                    ok: false,
                    reason: 'error',
                    error: `Jev answered ${response.status}: ${snippet}`,
                }
            }
            let json: unknown
            try {
                json = JSON.parse(text)
            } catch {
                return {
                    ok: false,
                    reason: 'error',
                    error: 'Jev answered with a body that is not JSON.',
                }
            }
            const parsed = JevResponseSchema.safeParse(json)
            if (!parsed.success) {
                return {
                    ok: false,
                    reason: 'error',
                    error: `Jev answered with no answers: ${z.prettifyError(parsed.error)}`,
                }
            }
            return {
                ok: true,
                answers: mapValues(parsed.data.answers, normalizeAnswer),
            }
        } catch (error) {
            if (isAbort({ error, signal })) {
                return {
                    ok: false,
                    reason: 'timeout',
                    error: 'Jev did not answer in time.',
                }
            }
            return {
                ok: false,
                reason: 'error',
                error: hideKey({
                    text: `Jev call failed: ${String(error)}`,
                    key,
                }),
            }
        }
    },
})
