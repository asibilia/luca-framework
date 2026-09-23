import { z } from 'zod'

import type { JevClient, JevReply } from './jev-client'
import type { JevAsk } from './jev-jobs'
import { JevAnswerSchema } from './jev-schemas'

import type { Journal } from '../journal/journal'

/** How long the engine waits for one Jev answer before it moves on. */
export const DEFAULT_JEV_TIMEOUT_MS = 10_000

const JevAnswersSchema = z.record(z.string(), JevAnswerSchema)

/**
 * A reply whose answers don't fit the journal's schema (only a broken client
 * sends one) becomes an error reply, so appending it can never throw.
 */
const checkedReply = (reply: JevReply): JevReply => {
    if (!reply.ok) return reply
    const parsed = JevAnswersSchema.safeParse(reply.answers)
    if (parsed.success) return { ok: true, answers: parsed.data }
    return {
        ok: false,
        reason: 'error',
        error: `Jev's answers do not fit their schema:\n${z.prettifyError(parsed.error)}`,
    }
}

/** Jev and how long to wait for it, as `runEngine` takes them. */
export type JevShadow = {
    client: JevClient
    /** Defaults to `DEFAULT_JEV_TIMEOUT_MS`. */
    timeout_ms?: number
}

/**
 * Calls Jev once, and always comes back: a throw becomes an error reply, and
 * a call past the timeout becomes a timeout reply even if the client ignores
 * the abort signal.
 */
const askWithTimeout = async ({
    jev,
    ask,
    timeout_ms,
}: {
    jev: JevClient
    ask: JevAsk
    timeout_ms: number
}): Promise<JevReply> => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const timedOut = new Promise<JevReply>((resolve) => {
        timer = setTimeout(() => {
            controller.abort()
            resolve({
                ok: false,
                reason: 'timeout',
                error: `Jev did not answer within ${timeout_ms} ms.`,
            })
        }, timeout_ms)
    })
    const called = Promise.resolve()
        .then(() =>
            jev.ask({ request: ask.request, signal: controller.signal })
        )
        .catch(
            (error: unknown): JevReply => ({
                ok: false,
                reason: 'error',
                error: `Jev threw: ${String(error)}`,
            })
        )
    try {
        return await Promise.race([called, timedOut])
    } finally {
        clearTimeout(timer)
    }
}

/**
 * Asks Jev each question in **shadow mode**: journals `jev_asked` with the
 * engine's fixed choice, then `jev_answered` or `jev_failed`, linked back by
 * `asked_seq`. Jev's answers change nothing. A Jev error, timeout, or missing
 * key is journaled and never thrown, so the run goes on.
 *
 * @example
 * await askJevInShadow({
 *     jev: createTypeSafeJev(),
 *     journal,
 *     asks: jevAsksBefore({ action, state }),
 * })
 */
export const askJevInShadow = async ({
    jev,
    journal,
    asks,
    timeout_ms,
}: {
    jev: JevClient
    journal: Journal
    asks: JevAsk[]
    /** Defaults to `DEFAULT_JEV_TIMEOUT_MS`. */
    timeout_ms?: number
}): Promise<void> => {
    for (const ask of asks) {
        const { job, ticket, role, request, fixed } = ask
        const asked = journal.append({
            kind: 'jev_asked',
            ticket,
            role,
            content: { job, request, fixed },
        })
        const started = performance.now()
        const reply = checkedReply(
            await askWithTimeout({
                jev,
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
    }
}
