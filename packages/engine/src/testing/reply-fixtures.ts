/**
 * Journal entry builders for a stuck ticket and the owner's reply: the stuck
 * report, a comment read, a reply word taken, and a ticket retried or skipped.
 */
import { SPEC_OWNER } from './intake-fixtures'

import type { JournalEntry } from '../journal/journal-record'

/** The engine told the spec issue that a ticket is stuck, in comment `comment_id`. */
export const stuckReported = ({
    ticket,
    comment_id,
}: {
    ticket: number
    /** Defaults to 100 + the ticket number. */
    comment_id?: number
}): JournalEntry => ({
    kind: 'stuck_reported',
    ticket,
    role: null,
    content: { comment_id: comment_id ?? 100 + ticket, body: 'stuck' },
})

/** A comment the engine read on the spec issue. */
export const commentRead = ({
    comment_id,
    body,
    author,
}: {
    comment_id: number
    body: string
    /** Defaults to the spec's owner. */
    author?: string
}): JournalEntry => ({
    kind: 'comment_read',
    ticket: null,
    role: null,
    content: { comment_id, author: author ?? SPEC_OWNER, body },
})

/** The engine took a reply word from the spec's owner. */
export const replyReceived = ({
    word,
    ticket,
    comment_id,
}: {
    word: 'retry' | 'skip' | 'stop' | 'ship'
    ticket: number | null
    comment_id: number
}): JournalEntry => ({
    kind: 'reply_received',
    ticket,
    role: null,
    content: { word, ticket, comment_id, author: SPEC_OWNER },
})

/** A retried ticket: resumed, started over, or refused. */
export const ticketRetried = ({
    ticket,
    mode,
}: {
    ticket: number
    mode: 'resume' | 'restart' | 'refused'
}): JournalEntry => ({
    kind: 'ticket_retried',
    ticket,
    role: null,
    content: {
        mode,
        base_sha: mode === 'restart' ? 'tip-sha' : null,
        problems: mode === 'refused' ? ['no criteria'] : [],
        answer_id: null,
    },
})

/** A ticket left out of the run. */
export const ticketSkipped = ({
    ticket,
    because,
}: {
    ticket: number
    because?: number
}): JournalEntry => ({
    kind: 'ticket_skipped',
    ticket,
    role: null,
    content: { because: because ?? null },
})
