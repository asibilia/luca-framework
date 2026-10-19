import { z } from 'zod'

import { ENTRY_FIELDS } from './entry-fields'

/** The journal entries of agent messages: each one sent, and each delivery. */

/**
 * What an agent message did when it was sent:
 * - `queued`: it waits for its recipients' next tool calls.
 * - `not_delivered`: nobody can get it (the receiver's ticket is over, or
 *   `all` found no one); it stays in the journal.
 * - `refused`: it broke a rule (a reviewer, a bad address, the cap).
 */
export const AgentMessageStatusSchema = z.enum([
    'queued',
    'not_delivered',
    'refused',
])

export type AgentMessageStatus = z.infer<typeof AgentMessageStatusSchema>

/**
 * One agent message, word for word, as it was sent. Addresses look like
 * `implementer#11`: a role and a ticket.
 */
export const AgentMessageSchema = z.object({
    /** `msg-<n>`: n is 1 + the earlier `agent_message` records in the journal. */
    id: z.string().min(1),
    /** The sender's address. */
    from: z.string(),
    /** What the sender asked for: an address, or `all`. */
    to: z.string(),
    text: z.string(),
    status: AgentMessageStatusSchema,
    /** The addresses it waits for; empty unless queued. */
    recipients: z.array(z.string()),
    /** Why it was refused or not delivered; `null` when queued. */
    reason: z.string().nullable(),
})

export type AgentMessage = z.infer<typeof AgentMessageSchema>

/** An agent sent a message. `ticket` and `role` are the sender's. */
export const AgentMessageEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('agent_message'),
    content: AgentMessageSchema,
})

/** Messages handed to their receiver at one tool call, word for word. */
export const AgentMessageDeliveredSchema = z.object({
    /** The receiver's address. */
    to: z.string(),
    /** The ids of the messages handed over together. */
    ids: z.array(z.string()),
    /** The tool call they rode on. */
    tool_name: z.string().nullable(),
    /** The additional context the agent got, word for word. */
    text: z.string(),
})

export type AgentMessageDelivered = z.infer<typeof AgentMessageDeliveredSchema>

/**
 * Agent messages reached their receiver. `ticket` and `role` are the
 * receiver's; the record's time is when it saw them.
 */
export const AgentMessageDeliveredEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('agent_message_delivered'),
    content: AgentMessageDeliveredSchema,
})
