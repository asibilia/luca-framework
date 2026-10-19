/**
 * Journal records about stuck work and the owner's replies: a stuck ticket,
 * a reply, a skip, an already-done ticket, a retry, and a reply the engine
 * couldn't use.
 */
import { entry, type Entry } from './journal-fixture-base'

export const ticketStuck = ({
    ticket,
    reason,
    detail,
}: {
    ticket: number
    reason: string
    detail: string
}): Entry =>
    entry({ kind: 'ticket_stuck', ticket, content: { reason, detail } })

/**
 * The owner's one-word reply on the spec issue, as the engine journals it
 * (#366): `retry #n`, `skip #n`, `stop`, or `retry` and `ship` for a stuck
 * final review (`ticket: null`).
 */
export const replyReceived = ({
    word,
    ticket,
    comment_id = 501,
    author = 'owner',
}: {
    word: 'retry' | 'skip' | 'stop' | 'ship'
    ticket: number | null
    comment_id?: number
    author?: string
}): Entry =>
    entry({
        kind: 'reply_received',
        ticket,
        content: { word, ticket, comment_id, author },
    })

/**
 * A skipped ticket: `because` is `null` when the owner skipped it, or the
 * skipped ticket it waits on.
 */
export const ticketSkipped = ({
    ticket,
    because = null,
}: {
    ticket: number
    because?: number | null
}): Entry => entry({ kind: 'ticket_skipped', ticket, content: { because } })

/** A ticket whose work was already on the base branch (#484), done by `shas`. */
export const ticketAlreadyDone = ({
    ticket,
    shas,
}: {
    ticket: number
    shas: string[]
}): Entry =>
    entry({
        kind: 'ticket_already_done',
        ticket,
        content: { shas, comment_id: 300 + ticket },
    })

/** The engine closed an already-done ticket, as the run made no PR. */
export const ticketClosed = ({ ticket }: { ticket: number }): Entry =>
    entry({ kind: 'ticket_closed', ticket, content: { comment_id: 400 } })

/** How the engine took a `retry` reply for a stuck ticket. */
export const ticketRetried = ({
    ticket,
    mode,
    problems = [],
}: {
    ticket: number
    mode: 'resume' | 'restart' | 'refused'
    problems?: string[]
}): Entry =>
    entry({
        kind: 'ticket_retried',
        ticket,
        content: {
            mode,
            base_sha: mode === 'refused' ? null : 'abc1234',
            problems,
            answer_id: mode === 'refused' ? 601 : null,
        },
    })

/** A reply the engine couldn't use; it answered why on the spec issue. */
export const replyIgnored = ({
    reason,
    comment_id = 502,
}: {
    reason: string
    comment_id?: number
}): Entry =>
    entry({
        kind: 'reply_ignored',
        content: { comment_id, reason, answer_id: 602 },
    })

/**
 * A record the board doesn't read: the engine told the spec issue (`ticket`
 * `null` for the final review), or retried the stuck final review.
 */
export const unshownStuckRecord = ({
    kind,
}: {
    kind: 'stuck_reported' | 'final_review_retried'
}): Entry =>
    kind === 'stuck_reported'
        ? entry({ kind, content: { comment_id: 400, body: 'stuck' } })
        : entry({ kind, content: {} })
