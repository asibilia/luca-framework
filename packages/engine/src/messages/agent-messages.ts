import uniq from 'lodash/uniq'

import { AgentRoleSchema, type AgentRole } from '../agents/role-results'
import type { AgentMessage, JournalRecord } from '../journal/journal-record'
import { replayRun, type RunState } from '../journal/replay'

/**
 * The pure rules for agent messages (decision #338): journal records in, a
 * decision out. The engine's `send_message` tool and its delivery hook
 * (`createAgentMessaging`) call these and journal what they say.
 */

/** Messages one agent may send on one ticket; refused ones don't count. */
export const MAX_MESSAGES_PER_AGENT = 5

/** The longest message text, in characters. */
export const MAX_MESSAGE_CHARS = 2000

/** What a message may be sent to, besides one address: every other live agent. */
export const ALL_AGENTS = 'all'

/** The roles that send and receive agent messages. Reviewers do neither. */
const MESSAGING_ROLES: AgentRole[] = ['test-writer', 'implementer']

/** Whether agents of this role send and receive agent messages. */
export const canMessage = ({ role }: { role: AgentRole }): boolean =>
    MESSAGING_ROLES.includes(role)

/**
 * An agent's address for messages: its role and its ticket. A fresh
 * test-writer after a bad-test bounce has the same address as the first.
 *
 * @example
 * agentAddress({ role: 'implementer', ticket: 11 }) // 'implementer#11'
 */
export const agentAddress = ({
    role,
    ticket,
}: {
    role: AgentRole
    ticket: number
}): string => `${role}#${ticket}`

/** An address's role and ticket, or `null` if it isn't one. */
export const parseAddress = (
    address: string
): { role: AgentRole; ticket: number } | null => {
    const match = /^([a-z-]+)#(\d+)$/.exec(address)
    if (match === null) return null
    const role = AgentRoleSchema.safeParse(match[1])
    const ticket = Number(match[2])
    if (!role.success || !Number.isSafeInteger(ticket) || ticket < 1) {
        return null
    }
    return { role: role.data, ticket }
}

/**
 * Whether a ticket is over for messages: it pushed (its join and the gates
 * after it passed), it is stuck, it was skipped (by reply, or because it
 * waits on a skipped ticket), the run's PR is open, the owner replied
 * `stop`, or a billing stop ended the run. A ticket that joined but hasn't
 * pushed isn't over yet: a clash or failed gates after joining sends it
 * back to its agents. A `retry` makes a stuck ticket live again, for its
 * fresh agents (see `pendingMessages`).
 *
 * @example
 * isOver({ state: replayRun({ records }), ticket: 11 })
 */
export const isOver = ({
    state,
    ticket,
}: {
    state: RunState
    ticket: number
}): boolean => {
    if (state.pull_request !== null) return true
    if (state.plan.billing_stopped !== null) return true
    if (state.stop !== null) return true
    const progress = state.tickets[ticket]
    if (progress === undefined) return false
    return (
        progress.stuck !== null ||
        progress.pushed !== null ||
        progress.skipped !== null
    )
}

const inRun = ({
    state,
    ticket,
}: {
    state: RunState
    ticket: number
}): boolean => state.snapshot?.ticket_order.includes(ticket) ?? false

const messagesIn = (records: JournalRecord[]): AgentMessage[] =>
    records.flatMap((record) =>
        record.kind === 'agent_message' ? [record.content] : []
    )

/**
 * Every test-writer and implementer address that has started, oldest start
 * first, on a ticket that isn't over.
 */
const liveAddresses = ({
    records,
    state,
}: {
    records: JournalRecord[]
    state: RunState
}): string[] =>
    uniq(
        records.flatMap((record) =>
            record.kind === 'agent_started' &&
            record.ticket !== null &&
            canMessage({ role: record.content.role }) &&
            !isOver({ state, ticket: record.ticket })
                ? [
                      agentAddress({
                          role: record.content.role,
                          ticket: record.ticket,
                      }),
                  ]
                : []
        )
    )

type Verdict = Pick<AgentMessage, 'status' | 'recipients' | 'reason'>

const refused = (reason: string): Verdict => ({
    status: 'refused',
    recipients: [],
    reason,
})

const notDelivered = (reason: string): Verdict => ({
    status: 'not_delivered',
    recipients: [],
    reason,
})

const verdictFor = ({
    records,
    state,
    from,
    to,
    text,
}: {
    records: JournalRecord[]
    state: RunState
    from: string
    to: string
    text: string
}): Verdict => {
    const sender = parseAddress(from)
    if (sender === null || !canMessage({ role: sender.role })) {
        return refused('Only test-writers and implementers send messages.')
    }
    const sent = messagesIn(records).filter(
        (message) => message.from === from && message.status !== 'refused'
    ).length
    if (sent >= MAX_MESSAGES_PER_AGENT) {
        return refused(
            `You already sent ${MAX_MESSAGES_PER_AGENT} messages on this ticket, the most allowed.`
        )
    }
    if (text.trim() === '') return refused('The message is empty.')
    if (text.length > MAX_MESSAGE_CHARS) {
        return refused(
            `The message is over ${MAX_MESSAGE_CHARS} characters. Keep it short.`
        )
    }
    if (to === ALL_AGENTS) {
        const recipients = liveAddresses({ records, state }).filter(
            (address) => address !== from
        )
        return recipients.length === 0
            ? notDelivered('No other test-writer or implementer is working.')
            : { status: 'queued', recipients, reason: null }
    }
    const receiver = parseAddress(to)
    if (receiver === null) {
        return refused(
            `"${to}" is not an address. Use <role>#<ticket>, such as implementer#11, or "all".`
        )
    }
    if (!canMessage({ role: receiver.role })) {
        return refused('Reviewers do not get messages.')
    }
    if (to === from) return refused("You can't message yourself.")
    if (!inRun({ state, ticket: receiver.ticket })) {
        return refused(`#${receiver.ticket} is not a ticket in this run.`)
    }
    if (isOver({ state, ticket: receiver.ticket })) {
        return notDelivered(
            `#${receiver.ticket} is over, so ${to} will not read it. It stays in the journal.`
        )
    }
    return { status: 'queued', recipients: [to], reason: null }
}

/**
 * What happens to a message an agent sends: queued for its recipients, not
 * delivered (their ticket is over, or `all` finds nobody), or refused. Pure:
 * the caller journals the answer as an `agent_message` record.
 *
 * - Only test-writers and implementers send, and only they receive.
 * - `to` is an address such as `implementer#11`, or `all`. A named address
 *   whose ticket is in the run and not over (`isOver`) is queued even if
 *   that agent hasn't started yet: it gets it at its first tool call.
 *   Tickets build at the same time, so the receiver may be on another
 *   ticket, working right now.
 * - `all` goes to every other test-writer and implementer that has started
 *   on a ticket that isn't over.
 * - At most `MAX_MESSAGES_PER_AGENT` per address; refused ones don't count.
 *
 * @example
 * const message = planMessage({ records: journal.read(), from: 'test-writer#11', to: 'implementer#11', text: 'sum takes an object.' })
 * // { id: 'msg-1', status: 'queued', recipients: ['implementer#11'], reason: null, ... }
 */
export const planMessage = ({
    records,
    from,
    to,
    text,
}: {
    records: JournalRecord[]
    /** The sender's address. */
    from: string
    to: string
    text: string
}): AgentMessage => {
    const state = replayRun({ records })
    const id = `msg-${messagesIn(records).length + 1}`
    return {
        id,
        from,
        to,
        text,
        ...verdictFor({ records, state, from, to, text }),
    }
}

/**
 * The queued messages an address hasn't been handed yet, oldest first.
 * None once its ticket is over, and none sent before a `retry` of its
 * ticket: those were for the agents before it.
 *
 * @example
 * const waiting = pendingMessages({ records: journal.read(), address: 'implementer#11' })
 */
export const pendingMessages = ({
    records,
    address,
}: {
    records: JournalRecord[]
    address: string
}): AgentMessage[] => {
    const receiver = parseAddress(address)
    if (receiver === null) return []
    const state = replayRun({ records })
    if (isOver({ state, ticket: receiver.ticket })) return []
    const handed = new Set(
        records.flatMap((record) =>
            record.kind === 'agent_message_delivered' &&
            record.content.to === address
                ? record.content.ids
                : []
        )
    )
    // A retry starts fresh agents: what waited for the old ones ends there.
    const retriedAt = retriedSeq({ records, ticket: receiver.ticket })
    return messagesSince({ records, seq: retriedAt }).filter(
        (message) =>
            message.status === 'queued' &&
            message.recipients.includes(address) &&
            !handed.has(message.id)
    )
}

/**
 * The seq of a ticket's latest `retry` that went ahead (resumed or started
 * over), or 0.
 */
const retriedSeq = ({
    records,
    ticket,
}: {
    records: JournalRecord[]
    ticket: number
}): number =>
    records.reduce(
        (latest, record) =>
            record.kind === 'ticket_retried' &&
            record.ticket === ticket &&
            record.content.mode !== 'refused'
                ? record.seq
                : latest,
        0
    )

/** The messages journaled after `seq`. */
const messagesSince = ({
    records,
    seq,
}: {
    records: JournalRecord[]
    seq: number
}): AgentMessage[] => messagesIn(records.filter((record) => record.seq > seq))

/**
 * The text an agent is handed with its messages, one line each.
 *
 * @example
 * deliveryText({ messages })
 * // '[Agent message msg-3 from test-writer#11, a one-way heads-up; no reply expected]: sum takes an object.'
 */
export const deliveryText = ({
    messages,
}: {
    messages: AgentMessage[]
}): string =>
    messages
        .map(
            ({ id, from, text }) =>
                `[Agent message ${id} from ${from}, a one-way heads-up; no reply expected]: ${text}`
        )
        .join('\n')

/**
 * What the `send_message` tool answers the sender. Only a refused message
 * is not ok; one that can't be delivered still went in the journal.
 */
export const sendAnswer = ({
    message,
}: {
    message: AgentMessage
}): { ok: boolean; detail: string } => {
    switch (message.status) {
        case 'queued':
            return {
                ok: true,
                detail: `Sent as ${message.id} to ${message.recipients.join(', ')}; each gets it at their next tool call. Nobody replies.`,
            }
        case 'not_delivered':
            return {
                ok: true,
                detail: `Not delivered: ${message.reason ?? 'nobody can get it.'}`,
            }
        case 'refused':
            return {
                ok: false,
                detail: `Refused: ${message.reason ?? 'it breaks a message rule.'}`,
            }
    }
}
