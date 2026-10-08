import { z } from 'zod'

import type { DecisionModelClient, DecisionModelReply } from './clef-client'
import type { JevAsk } from './jev-jobs'
import { JevAnswerSchema } from './jev-schemas'

import type { Journal } from '../journal/journal'

/** How long the engine waits for one decision model answer before it moves on. */
export const DEFAULT_JEV_TIMEOUT_MS = 10_000

const JevAnswersSchema = z.record(z.string(), JevAnswerSchema)

/**
 * A reply whose answers don't fit the journal's schema (only a broken client
 * sends one) becomes an error reply, so appending it can never throw.
 */
const checkedReply = (reply: DecisionModelReply): DecisionModelReply => {
    if (!reply.ok) return reply
    const parsed = JevAnswersSchema.safeParse(reply.answers)
    if (parsed.success) {
        return { ok: true, answers: parsed.data, model: reply.model }
    }
    return {
        ok: false,
        reason: 'error',
        error: `The decision model's answers do not fit their schema:\n${z.prettifyError(parsed.error)}`,
    }
}

/**
 * The decision model, how long to wait for it, and where to print the line
 * when it turns off mid-run, as `runEngine` takes them.
 */
export type JevShadow = {
    client: DecisionModelClient
    /** Defaults to `DEFAULT_JEV_TIMEOUT_MS`. */
    timeout_ms?: number
    /** Gets one plain line when the decision model turns off mid-run. */
    log?: (line: string) => void
}

/**
 * Calls the decision model once, and always comes back: a throw becomes an error reply, and
 * a call past the timeout becomes a timeout reply even if the client ignores
 * the abort signal.
 */
const askWithTimeout = async ({
    jev,
    ask,
    timeout_ms,
}: {
    jev: DecisionModelClient
    ask: JevAsk
    timeout_ms: number
}): Promise<DecisionModelReply> => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const timedOut = new Promise<DecisionModelReply>((resolve) => {
        timer = setTimeout(() => {
            controller.abort()
            resolve({
                ok: false,
                reason: 'timeout',
                error: `The decision model did not answer within ${timeout_ms} ms.`,
            })
        }, timeout_ms)
    })
    const called = Promise.resolve()
        .then(() =>
            jev.ask({ request: ask.request, signal: controller.signal })
        )
        .catch(
            (error: unknown): DecisionModelReply => ({
                ok: false,
                reason: 'error',
                error: `The decision model threw: ${String(error)}`,
            })
        )
    try {
        return await Promise.race([called, timedOut])
    } finally {
        clearTimeout(timer)
    }
}

/** Asks the decision model about a step's asks, in shadow mode. */
export type ShadowAsker = (asks: JevAsk[]) => Promise<void>

/**
 * Asks the decision model in **shadow mode** for one run: for each ask,
 * journals `jev_asked` with the engine's fixed choice and the model, then
 * `jev_answered` (with the model that answered) or `jev_failed`, linked back
 * by `asked_seq`. The answers change nothing. An error, timeout, or missing
 * credentials is journaled and never thrown, so the run goes on.
 *
 * The first ask Cloudflare turns down (`rejected`: HTTP 401 or 403) turns
 * the decision model **off** for the rest of the run: one
 * `decision_model_off { reason: 'rejected' }` record and one line to `log`,
 * and no ask after it is journaled or sent. The off switch lives in this
 * asker, so each run (each `runEngine`) has its own. A timeout or an error
 * doesn't turn it off; the next ask tries again.
 *
 * @example
 * const ask = shadowAsker({ jev: { client: createClefClient({ credentials, model }) }, journal })
 * await ask(jevAsksBefore({ action, state }))
 */
export const shadowAsker = ({
    jev,
    journal,
}: {
    jev: JevShadow
    journal: Journal
}): ShadowAsker => {
    const { client, timeout_ms, log } = jev
    let off = false
    return async (asks) => {
        for (const ask of asks) {
            if (off) return
            const { job, ticket, role, request, fixed } = ask
            const asked = journal.append({
                kind: 'jev_asked',
                ticket,
                role,
                content: { job, request, fixed, model: client.model },
            })
            const started = performance.now()
            const reply = checkedReply(
                await askWithTimeout({
                    jev: client,
                    ask,
                    timeout_ms: timeout_ms ?? DEFAULT_JEV_TIMEOUT_MS,
                })
            )
            const ms = Math.round(performance.now() - started)
            if (reply.ok) {
                journal.append({
                    kind: 'jev_answered',
                    ticket,
                    role,
                    content: {
                        job,
                        asked_seq: asked.seq,
                        answers: reply.answers,
                        ms,
                        model: reply.model ?? client.model,
                    },
                })
                continue
            }
            journal.append({
                kind: 'jev_failed',
                ticket,
                role,
                content: {
                    job,
                    asked_seq: asked.seq,
                    reason: reply.reason,
                    error: reply.error,
                    ms,
                },
            })
            // Asks run at once on other tickets; only the first turns it off.
            if (reply.reason === 'rejected' && !off) {
                off = true
                const detail = `${reply.error} No more asks this run.`
                journal.append({
                    kind: 'decision_model_off',
                    ticket: null,
                    role: null,
                    content: {
                        model: client.model,
                        reason: 'rejected',
                        detail,
                    },
                })
                log?.(`decision model off: ${detail}`)
            }
        }
    }
}
