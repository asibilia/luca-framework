import mapValues from 'lodash/mapValues'
import { z } from 'zod'

import type { JevAnswer, JevFailureReason, JevRequest } from './jev-schemas'

/** Workers AI's REST API: `<base>/<account id>/ai/run/<model id>`. */
const WORKERS_AI_ACCOUNTS_URL = 'https://api.cloudflare.com/client/v4/accounts'

/** How much of an error body a failed call keeps. */
const ERROR_SNIPPET_CHARS = 300

/**
 * The decision model's answers by question id, and the model that gave
 * them; or why there are none. Never a throw.
 */
export type DecisionModelReply =
    | {
          ok: true
          answers: Record<string, JevAnswer>
          /** The model that answered; left out, the client's own. */
          model?: string
      }
    | { ok: false; reason: JevFailureReason; error: string }

/** Asks the decision model one request. The signal cuts the call short. */
export type DecisionModelClient = {
    /** The model it asks, such as `@cf/cloudflare/clef`; journaled on each ask. */
    model: string
    ask: (args: {
        request: JevRequest
        signal: AbortSignal
    }) => Promise<DecisionModelReply>
}

/** The part of `fetch` the client uses, so tests can hand in a fake. */
export type DecisionModelFetch = (
    url: string,
    init: RequestInit
) => Promise<Response>

/** The Cloudflare account and Workers AI token the client calls with. */
export type ClefCredentials = { account_id: string; api_token: string }

/**
 * Clef's output: its answers by question id, and the model's short name.
 * Workers AI wraps it as `{ result, success, errors, messages }`, so it is
 * read inside `result` or bare.
 */
const ClefOutputSchema = z.object({
    model: z.string().min(1).nullish().catch(null),
    answers: z.record(z.string(), z.unknown()),
})

const EnvelopeSchema = z.object({ result: ClefOutputSchema })

/** A Cloudflare v4 error body: `{ success: false, errors: [{ code, message }] }`. */
const ErrorEnvelopeSchema = z.object({
    errors: z.array(z.object({ message: z.string() })).min(1),
})

/**
 * The answer fields the engine knows: Clef's `choice` (a criteria key),
 * `score` (a place on the scale), and `noul` (the probability of yes), each
 * with a `confidence` except noul. Jev's `probability` and a plain `value`
 * read too. A field that doesn't fit falls back to `null`.
 */
const LooseAnswerSchema = z.object({
    choice: z.string().nullish().catch(null),
    score: z.union([z.string(), z.number()]).nullish().catch(null),
    noul: z.number().nullish().catch(null),
    probability: z.number().nullish().catch(null),
    value: z.union([z.string(), z.number()]).nullish().catch(null),
    confidence: z.number().nullish().catch(null),
})

const normalizeAnswer = (raw: unknown): JevAnswer => {
    const parsed = LooseAnswerSchema.safeParse(raw)
    if (!parsed.success) return { value: null, confidence: null, raw }
    const { choice, score, noul, probability, value, confidence } = parsed.data
    return {
        value: choice ?? score ?? noul ?? probability ?? value ?? null,
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

/** Removes the token from any text, so it never lands in the journal. */
const hideToken = ({ text, token }: { text: string; token: string }): string =>
    text.split(token).join('[token]')

const parseJson = (text: string): unknown => {
    try {
        return JSON.parse(text)
    } catch {
        return undefined
    }
}

/** What a failed call's body says: Cloudflare's error messages, or its start. */
const errorBodyText = (text: string): string => {
    const envelope = ErrorEnvelopeSchema.safeParse(parseJson(text))
    return envelope.success
        ? envelope.data.errors.map(({ message }) => message).join('; ')
        : text.slice(0, ERROR_SNIPPET_CHARS)
}

/**
 * The URL that runs `model` on Workers AI for `account_id`. The model id's
 * `@` and `/` stay as they are, as Cloudflare's docs write them. Pure.
 *
 * @example
 * clefUrl({ account_id: 'abc', model: '@cf/cloudflare/clef' })
 * // 'https://api.cloudflare.com/client/v4/accounts/abc/ai/run/@cf/cloudflare/clef'
 */
export const clefUrl = ({
    account_id,
    model,
}: {
    account_id: string
    model: string
}): string =>
    `${WORKERS_AI_ACCOUNTS_URL}/${encodeURIComponent(account_id)}/ai/run/${model}`

/** The name Clef wants in the body: the model id's last part, `clef` or `clef-flash`. */
const shortName = (model: string): string => model.split('/').at(-1) ?? model

/**
 * The decision model client for Cloudflare's **Clef** on Workers AI (#534).
 * It never throws: missing credentials, a timeout, a bad status, or a bad
 * body each come back as a failed reply, and no error text ever holds the
 * token. HTTP 401 and 403 are `rejected` (the token is wrong or lacks Workers
 * AI), which turns the decision model off for the run; anything else is an
 * `error` or a `timeout`, and the next ask tries again.
 *
 * @param credentials - The account id and token (see
 *   `loadDecisionModelCredentials`); `null` or an empty one is
 *   `missing_credentials`, and then `fetch` is never called.
 * @param model - The Workers AI model id, such as `@cf/cloudflare/clef`.
 * @param fetch - Defaults to the global `fetch`.
 *
 * @example
 * const clef = createClefClient({ credentials: { account_id, api_token }, model: '@cf/cloudflare/clef' })
 * const reply = await clef.ask({ request, signal: AbortSignal.timeout(10_000) })
 * if (reply.ok) console.log(reply.answers)
 */
export const createClefClient = ({
    credentials,
    model,
    fetch: fetchClef,
}: {
    credentials: ClefCredentials | null
    model: string
    fetch?: DecisionModelFetch
}): DecisionModelClient => ({
    model,
    ask: async ({ request, signal }) => {
        if (
            credentials === null ||
            credentials.account_id === '' ||
            credentials.api_token === ''
        ) {
            return {
                ok: false,
                reason: 'missing_credentials',
                error: 'No Cloudflare account id or token is set.',
            }
        }
        const token = credentials.api_token
        try {
            const response = await (fetchClef ?? fetch)(
                clefUrl({ account_id: credentials.account_id, model }),
                {
                    method: 'POST',
                    headers: {
                        authorization: `Bearer ${token}`,
                        'content-type': 'application/json',
                    },
                    body: JSON.stringify({
                        model: shortName(model),
                        state: request.state,
                        questions: request.questions,
                    }),
                    signal,
                }
            )
            const text = await response.text()
            if (!response.ok) {
                const said = hideToken({ text: errorBodyText(text), token })
                const rejected =
                    response.status === 401 || response.status === 403
                return rejected
                    ? {
                          ok: false,
                          reason: 'rejected',
                          error: `Cloudflare turned the token down (HTTP ${response.status}): ${said}`,
                      }
                    : {
                          ok: false,
                          reason: 'error',
                          error: `Clef answered ${response.status}: ${said}`,
                      }
            }
            const json = parseJson(text)
            if (json === undefined) {
                return {
                    ok: false,
                    reason: 'error',
                    error: 'Clef answered with a body that is not JSON.',
                }
            }
            const wrapped = EnvelopeSchema.safeParse(json)
            const output = wrapped.success
                ? { success: true as const, data: wrapped.data.result }
                : ClefOutputSchema.safeParse(json)
            if (!output.success) {
                return {
                    ok: false,
                    reason: 'error',
                    error: hideToken({
                        text: `Clef answered with no answers: ${z.prettifyError(output.error)}`,
                        token,
                    }),
                }
            }
            return {
                ok: true,
                model: output.data.model ?? model,
                answers: mapValues(output.data.answers, normalizeAnswer),
            }
        } catch (error) {
            if (isAbort({ error, signal })) {
                return {
                    ok: false,
                    reason: 'timeout',
                    error: 'Clef did not answer in time.',
                }
            }
            return {
                ok: false,
                reason: 'error',
                error: hideToken({
                    text: `Clef call failed: ${String(error)}`,
                    token,
                }),
            }
        }
    },
})
