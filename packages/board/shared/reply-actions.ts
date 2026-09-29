import { z } from 'zod'

/**
 * The reply buttons on stuck work (#503): which one-word replies the engine
 * takes for each kind of stuck item, the words of the confirm step, the
 * `/luca-unstick` command for "Help me", and what each button shows. Plain
 * values only, so the panel, the chat rows, and the server share them.
 */

/** The key of a ticket's "Needs you" item. */
export const ticketKey = ({ ticket }: { ticket: number }): string =>
    `ticket-${ticket}`

/** The key of the final review's "Needs you" item. */
export const FINAL_KEY = 'final'

/** The key of the "Needs you" item for the whole run, stuck on its budget. */
export const RUN_KEY = 'run'

/**
 * The replies the engine takes for one stuck item, as the owner would type
 * them. A stuck ticket always gets its number (`retry #12`), since a bare
 * word is only taken while one ticket is stuck. The final review takes a
 * bare `retry`, `stop`, or `ship`; the run stuck on its budget a bare
 * `retry` or `stop` (see the engine's README, "Replies"). An item this
 * doesn't know gets none, so no button can post a word the engine refuses.
 *
 * @example
 * allowedReplies({ key: 'ticket-12', ticket: 12 }) // ['retry #12', 'skip #12', 'stop']
 * allowedReplies({ key: 'final', ticket: null }) // ['retry', 'stop', 'ship']
 */
export const allowedReplies = ({
    key,
    ticket,
}: {
    key: string
    ticket: number | null
}): string[] => {
    if (ticket !== null) {
        return key === ticketKey({ ticket })
            ? [`retry #${ticket}`, `skip #${ticket}`, 'stop']
            : []
    }
    if (key === FINAL_KEY) return ['retry', 'stop', 'ship']
    if (key === RUN_KEY) return ['retry', 'stop']
    return []
}

/** A reply word and the ticket it names, as the engine journals it. */
export type ReplyParts = {
    word: 'retry' | 'skip' | 'stop' | 'ship'
    ticket: number | null
}

const REPLY_PATTERN = /^(retry|skip|stop|ship)(?: #(\d+))?$/

/**
 * Splits one of `allowedReplies` into its word and ticket, to match it
 * with the engine's `reply_received`. `null` for anything else.
 *
 * @example
 * replyParts({ reply: 'retry #12' }) // { word: 'retry', ticket: 12 }
 */
export const replyParts = ({ reply }: { reply: string }): ReplyParts | null => {
    const match = REPLY_PATTERN.exec(reply)
    const word = z.enum(['retry', 'skip', 'stop', 'ship']).safeParse(match?.[1])
    if (!match || !word.success) return null
    return {
        word: word.data,
        ticket: match[2] === undefined ? null : Number(match[2]),
    }
}

const ISSUE_URL_PATTERN =
    /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/issues\/\d+/

/**
 * The repo of a GitHub issue URL, as `owner/repo`; `null` for any other URL.
 *
 * @example
 * repoOfIssueUrl({ url: 'https://github.com/o/r/issues/10' }) // 'o/r'
 */
export const repoOfIssueUrl = ({ url }: { url: string }): string | null => {
    const match = ISSUE_URL_PATTERN.exec(url)
    return match ? `${match[1]}/${match[2]}` : null
}

/**
 * The question before a reply is posted.
 *
 * @example
 * confirmReplyText({ reply: 'retry #134', spec_number: 133 })
 * // 'Post `retry #134` on spec #133?'
 */
export const confirmReplyText = ({
    reply,
    spec_number,
}: {
    reply: string
    spec_number: number | null
}): string =>
    `Post \`${reply}\` on ${spec_number === null ? 'the spec issue' : `spec #${spec_number}`}?`

/**
 * The `/luca-unstick` command "Help me" puts in the chat: the run id, and
 * the ticket for a stuck ticket (none for the final review or the budget).
 *
 * @example
 * unstickCommand({ run_id: 'luca-20260928-101500-abcd', ticket: 134 })
 * // '/luca-unstick luca-20260928-101500-abcd #134'
 */
export const unstickCommand = ({
    run_id,
    ticket,
}: {
    run_id: string
    ticket: number | null
}): string =>
    ticket === null
        ? `/luca-unstick ${run_id}`
        : `/luca-unstick ${run_id} #${ticket}`

/**
 * API Response part: a reply the board posted on the spec issue, for one
 * stuck item (its key and `since`), and whether the engine took it
 * (`reply_received`). Kept in the plugin's memory only.
 */
export const PostedReplySchema = z.object({
    key: z.string(),
    /** The stuck item's `since`: the same ticket stuck again is a new item. */
    since: z.string(),
    reply: z.string(),
    posted_at: z.string(),
    /** The comment's URL, as `gh issue comment` printed it. */
    comment_url: z.string().nullable(),
    /** Set once the engine journaled `reply_received` for it. */
    taken_at: z.string().nullable(),
})

export type PostedReply = z.infer<typeof PostedReplySchema>

/** One reply button: its reply, and whether and why it can't be tapped. */
export type ReplyButton = {
    reply: string
    /** `ready`, `sending` (this one is in flight), `posted`, or `locked`. */
    state: 'ready' | 'sending' | 'posted' | 'locked'
}

/**
 * The buttons of one stuck item. Once a reply is posted (or while one is in
 * flight) for this item, that button shows it and the others lock, so a
 * second tap can't post again or post a second word the engine would
 * refuse.
 *
 * @example
 * replyButtons({ item, posted: [], sending: null })
 * // [{ reply: 'retry #12', state: 'ready' }, ...]
 */
export const replyButtons = ({
    item,
    posted,
    sending,
}: {
    item: { key: string; ticket: number | null; since: string }
    posted: PostedReply[]
    /** The reply being posted for this item now, if any. */
    sending: string | null
}): ReplyButton[] => {
    const done = postedFor({ item, posted })
    return allowedReplies(item).map((reply) => {
        if (done)
            return { reply, state: done.reply === reply ? 'posted' : 'locked' }
        if (sending !== null) {
            return { reply, state: sending === reply ? 'sending' : 'locked' }
        }
        return { reply, state: 'ready' }
    })
}

/** The reply posted for this stuck item, if any. */
export const postedFor = ({
    item,
    posted,
}: {
    item: { key: string; since: string }
    posted: PostedReply[]
}): PostedReply | null =>
    posted.find(
        (entry) => entry.key === item.key && entry.since === item.since
    ) ?? null

/**
 * What a posted reply says under the buttons.
 *
 * @example
 * postedText({ posted }) // 'Posted `retry #12`. Waiting for the engine to read it.'
 */
export const postedText = ({ posted }: { posted: PostedReply }): string =>
    posted.taken_at === null
        ? `Posted \`${posted.reply}\`. Waiting for the engine to read it (it checks about once a minute).`
        : `Posted \`${posted.reply}\`. The engine took it.`
